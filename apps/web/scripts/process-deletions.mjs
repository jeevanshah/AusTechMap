#!/usr/bin/env node
// Scheduled job (.github/workflows/process-account-deletions.yml, hourly):
// completes queued account_deletion_requests within 24h of confirmation
// (ARCHITECTURE_DECISIONS.md §4.1 step 2's SLA), and expires old
// rate-limit buckets. Plain Node, no ts-node/tsx dependency -- mirrors
// src/lib/deletion/erasure.ts's logic (that module can't be imported
// directly here since this runs outside the Next.js/TS build).

import { Pool } from "pg";
import { Encrypter } from "age-encryption";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function r2Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("R2 credentials are not configured");
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

async function writeLedgerRecord(requestId, userId, emailDigestHex) {
  const recipient = process.env.DELETION_LEDGER_AGE_RECIPIENT;
  const bucket = process.env.RAW_SNAPSHOT_BUCKET;
  if (!recipient || !bucket) {
    throw new Error(
      "DELETION_LEDGER_AGE_RECIPIENT/RAW_SNAPSHOT_BUCKET not configured",
    );
  }
  const encrypter = new Encrypter();
  encrypter.addRecipient(recipient);
  const plaintext = JSON.stringify({
    requestId,
    userId,
    emailDigestHex,
    writtenAt: new Date().toISOString(),
  });
  const ciphertext = await encrypter.encrypt(plaintext);
  await r2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: `deletion-ledger/${requestId}.age`,
      Body: ciphertext,
      ContentType: "application/octet-stream",
    }),
  );
}

async function processRequest(pool, request) {
  await pool.query(
    "UPDATE account_deletion_requests SET status = 'processing', processing_started_at = now() WHERE id = $1",
    [request.id],
  );
  try {
    await pool.query('DELETE FROM accounts WHERE "userId" = $1', [
      request.user_id,
    ]);
    await pool.query(
      `UPDATE users
       SET name = NULL, email = 'deleted-' || id || '@deleted.invalid', image = NULL, status = 'disabled'
       WHERE id = $1`,
      [request.user_id],
    );
    await writeLedgerRecord(
      request.id,
      request.user_id,
      Buffer.from(request.email_digest).toString("hex"),
    );
    await pool.query(
      "UPDATE account_deletion_requests SET status = 'completed', completed_at = now() WHERE id = $1",
      [request.id],
    );
    console.log(`completed deletion request ${request.id}`);
  } catch (error) {
    await pool.query(
      "UPDATE account_deletion_requests SET status = 'failed', failure_code = $2 WHERE id = $1",
      [request.id, String(error?.message ?? error).slice(0, 200)],
    );
    console.error(`failed deletion request ${request.id}:`, error);
  }
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, email_digest FROM account_deletion_requests
       WHERE status IN ('queued', 'failed') AND confirmed_at IS NOT NULL
         AND confirmed_at > now() - interval '24 hours'`,
    );
    for (const request of rows) {
      if (request.user_id === null) continue;
      await processRequest(pool, request);
    }

    const cleanup = await pool.query(
      "DELETE FROM auth_rate_limit_buckets WHERE window_start < now() - interval '24 hours'",
    );
    console.log(
      `processed ${rows.length} deletion request(s); cleaned up ${cleanup.rowCount} rate-limit bucket(s)`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
