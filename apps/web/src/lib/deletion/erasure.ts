import { createHash } from "node:crypto";
import type { Pool } from "pg";

import { writeDeletionLedgerRecord } from "./ledger";
import { eraseUserRetentionData } from "../retention/erasure-hooks";

/**
 * §4.1 step 3's extensible hook registry.
 * Erases Auth.js identity tables (accounts), tombstones users row (PII cleared,
 * row kept for historical audit attribution), and invokes registered hooks
 * (such as retention erasure for saved searches, watchlists, and alerts).
 */
export type ErasureHook = (pool: Pool, userId: number) => Promise<void>;

const erasureHooks: ErasureHook[] = [eraseUserRetentionData];

export function registerErasureHook(hook: ErasureHook): void {
  erasureHooks.push(hook);
}

async function eraseAuthIdentity(pool: Pool, userId: number): Promise<void> {
  await pool.query('DELETE FROM accounts WHERE "userId" = $1', [userId]);
  await pool.query(
    `UPDATE users
     SET name = NULL, email = 'deleted-' || id || '@deleted.invalid',
         image = NULL, status = 'disabled'
     WHERE id = $1`,
    [userId],
  );
}

export interface ProcessDeletionResult {
  requestId: string;
  userId: number;
  erased: boolean;
}

/**
 * Idempotent: safe to re-run for the same request (a request already
 * 'completed' is skipped). Called by the scheduled job with each queued
 * request's own id as the idempotency key.
 */
export async function processDeletionRequest(
  pool: Pool,
  requestId: string,
): Promise<ProcessDeletionResult> {
  const row = await pool.query<{
    status: string;
    user_id: number | null;
    email_digest: Buffer;
  }>(
    "SELECT status, user_id, email_digest FROM account_deletion_requests WHERE id = $1",
    [requestId],
  );
  const request = row.rows[0];
  if (!request || request.user_id === null) {
    return { requestId, userId: -1, erased: false };
  }
  if (request.status === "completed") {
    return { requestId, userId: request.user_id, erased: false };
  }

  await pool.query(
    "UPDATE account_deletion_requests SET status = 'processing', processing_started_at = now() WHERE id = $1",
    [requestId],
  );

  try {
    await eraseAuthIdentity(pool, request.user_id);
    for (const hook of erasureHooks) {
      await hook(pool, request.user_id);
    }
    await writeDeletionLedgerRecord({
      requestId,
      userId: request.user_id,
      emailDigestHex: request.email_digest.toString("hex"),
    });
    await pool.query(
      "UPDATE account_deletion_requests SET status = 'completed', completed_at = now() WHERE id = $1",
      [requestId],
    );
    return { requestId, userId: request.user_id, erased: true };
  } catch (error) {
    await pool.query(
      "UPDATE account_deletion_requests SET status = 'failed', failure_code = $2 WHERE id = $1",
      [
        requestId,
        error instanceof Error ? error.message.slice(0, 200) : "unknown_error",
      ],
    );
    throw error;
  }
}

export function emailDigest(normalisedEmail: string): Buffer {
  return createHash("sha256").update(normalisedEmail, "utf8").digest();
}
