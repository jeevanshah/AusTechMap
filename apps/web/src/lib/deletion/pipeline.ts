import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

const CURRENT_POLICY_VERSION = 1;

export class LastAdminError extends Error {
  constructor() {
    super("the last active administrator cannot delete itself");
    this.name = "LastAdminError";
  }
}

export class StaffMustBeDemotedError extends Error {
  constructor() {
    super(
      "staff accounts must be demoted by another administrator before deletion",
    );
    this.name = "StaffMustBeDemotedError";
  }
}

/**
 * §4.1 step 1: staff accounts must first be demoted by another
 * administrator; the last administrator cannot delete itself.
 */
async function assertDeletionAllowed(
  pool: Pool,
  userId: number,
): Promise<void> {
  const row = await pool.query<{ role: string }>(
    "SELECT role FROM users WHERE id = $1",
    [userId],
  );
  const role = row.rows[0]?.role;
  if (role === "user") return;

  if (role === "admin") {
    const activeAdmins = await pool.query<{ count: string }>(
      "SELECT count(*) FROM users WHERE role = 'admin' AND status = 'active'",
    );
    if (Number(activeAdmins.rows[0]?.count ?? "0") <= 1) {
      throw new LastAdminError();
    }
  }
  throw new StaffMustBeDemotedError();
}

/** Step 1: authenticated user starts deletion (a fresh magic link then confirms it). */
export async function startAccountDeletionRequest(
  pool: Pool,
  userId: number,
  emailDigest: Buffer,
): Promise<string> {
  await assertDeletionAllowed(pool, userId);

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM account_deletion_requests
     WHERE user_id = $1 AND status = 'pending_confirmation'`,
    [userId],
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO account_deletion_requests (user_id, email_digest, status, policy_version)
     VALUES ($1, $2, 'pending_confirmation', $3)
     RETURNING id`,
    [userId, emailDigest, CURRENT_POLICY_VERSION],
  );
  return inserted.rows[0]!.id;
}

/**
 * Step 2: runs synchronously at confirm-time. Immediately disables the
 * account, revokes all sessions (including the one confirming this very
 * request -- the user is signed out as part of confirming deletion) and
 * pending verification tokens, and marks the request queued for the
 * scheduled erasure job.
 */
export async function confirmAccountDeletionRequest(
  pool: Pool,
  requestId: string,
  userId: number,
): Promise<void> {
  const request = await pool.query<{ status: string; user_id: number | null }>(
    "SELECT status, user_id FROM account_deletion_requests WHERE id = $1",
    [requestId],
  );
  const row = request.rows[0];
  if (!row || row.user_id !== userId) {
    throw new Error("deletion request not found for this user");
  }
  if (row.status !== "pending_confirmation") {
    throw new Error("deletion request already confirmed or resolved");
  }

  const userRow = await pool.query<{ email: string }>(
    "SELECT email FROM users WHERE id = $1",
    [userId],
  );
  const email = userRow.rows[0]?.email;

  await pool.query(
    "UPDATE users SET status = 'deletion_pending' WHERE id = $1",
    [userId],
  );
  await pool.query('DELETE FROM sessions WHERE "userId" = $1', [userId]);
  if (email) {
    await pool.query("DELETE FROM verification_token WHERE identifier = $1", [
      email,
    ]);
  }
  await pool.query(
    `UPDATE account_deletion_requests
     SET status = 'queued', confirmed_at = now()
     WHERE id = $1`,
    [requestId],
  );
}

export function newIdempotencyKey(): string {
  return randomUUID();
}
