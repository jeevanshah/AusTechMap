import { createHash } from "node:crypto";
import type { Pool } from "pg";

import { writeDeletionLedgerRecord } from "./ledger";

/**
 * §4.1 step 3's extensible hook registry. Today's real, honest scope:
 * only the Auth.js identity tables (accounts) have real rows to erase,
 * plus the users row itself is tombstoned (PII cleared, row kept -- other
 * tables reference users.id, e.g. review_queue_items.reviewed_by_user_id
 * and audit_records' historical actor attribution). No saved-searches/
 * watches/notification-preference hooks exist yet because those features
 * don't exist yet (Phase 7) -- this registry is the extension point future
 * features must register against when they're built, not a pipeline that
 * pretends to erase data that doesn't exist.
 */
export type ErasureHook = (pool: Pool, userId: number) => Promise<void>;

const erasureHooks: ErasureHook[] = [];

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
