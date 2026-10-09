import type { Pool } from "pg";

/**
 * ARCHITECTURE_DECISIONS.md §4.1 step 3:
 * "Delete Auth.js accounts and user-owned saved searches, watches,
 * preferences, and undelivered notifications."
 * The P2 Job Vault and P1 candidate profile both extend that registry to
 * private application/profile state.
 *
 * When an account is tombstoned, the user row is updated to 'disabled'
 * (retained for audit logs and review queue attribution), so ON DELETE CASCADE
 * does not fire. This hook explicitly purges all user-owned retention state.
 */
export async function eraseUserRetentionData(
  pool: Pool,
  userId: number,
): Promise<void> {
  await pool.query("DELETE FROM job_applications WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM saved_searches WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM watchlists WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM user_alerts WHERE user_id = $1", [userId]);
  await pool.query("DELETE FROM candidate_profiles WHERE user_id = $1", [
    userId,
  ]);
}
