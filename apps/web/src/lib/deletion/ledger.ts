import { Encrypter } from "age-encryption";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * §4.1 step 4: "Write an encrypted restore-suppression record outside the
 * database containing the deletion request ID, user ID, and keyed digest
 * of the normalised email. Retain it for 40 days." Mirrors §4.4's existing
 * backup-encryption pattern: the app only ever encrypts, against an
 * operator-held asymmetric age public key (DELETION_LEDGER_AGE_RECIPIENT)
 * -- the matching private identity lives outside Vercel/Neon/R2/repo, so
 * this code never needs (or is able) to decrypt. Retention is enforced by
 * an R2 lifecycle rule on the `deletion-ledger/` prefix (a one-time bucket
 * configuration step, not application code) rather than a second cleanup
 * job -- see the operational runbook note in ARCHITECTURE_DECISIONS.md.
 *
 * Reuses the same R2 account/credential env vars already established for
 * the Python ingestion side's snapshot store (R2_ACCOUNT_ID,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) -- this is the first TypeScript-
 * side R2 usage, via the S3-compatible @aws-sdk/client-s3 client.
 */

export interface DeletionLedgerRecord {
  requestId: string;
  userId: number;
  emailDigestHex: string;
}

function r2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 credentials are not configured (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY)",
    );
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function writeDeletionLedgerRecord(
  record: DeletionLedgerRecord,
): Promise<void> {
  const recipient = process.env.DELETION_LEDGER_AGE_RECIPIENT;
  if (!recipient) {
    throw new Error("DELETION_LEDGER_AGE_RECIPIENT is not configured");
  }
  const bucket = process.env.RAW_SNAPSHOT_BUCKET;
  if (!bucket) {
    throw new Error("RAW_SNAPSHOT_BUCKET is not configured");
  }

  const encrypter = new Encrypter();
  encrypter.addRecipient(recipient);
  const plaintext = JSON.stringify({
    requestId: record.requestId,
    userId: record.userId,
    emailDigestHex: record.emailDigestHex,
    writtenAt: new Date().toISOString(),
  });
  const ciphertext = await encrypter.encrypt(plaintext);

  const client = r2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `deletion-ledger/${record.requestId}.age`,
      Body: ciphertext,
      ContentType: "application/octet-stream",
    }),
  );
}
