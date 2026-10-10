import type { Pool } from "pg";

export type EmailSuppressionReason = "unsubscribed" | "bounced" | "complaint";

export async function getEmailSuppression(
  pool: Pool,
  userId: number,
): Promise<EmailSuppressionReason | null> {
  const result = await pool.query<{ reason: EmailSuppressionReason }>(
    "SELECT reason FROM email_suppressions WHERE user_id = $1",
    [userId],
  );
  return result.rows[0]?.reason ?? null;
}

/** Idempotent: unsubscribing twice, or an unknown user id, is not an error. */
export async function suppressEmail(
  pool: Pool,
  userId: number,
  reason: EmailSuppressionReason,
): Promise<void> {
  await pool.query(
    `INSERT INTO email_suppressions (user_id, reason)
     SELECT id, $2 FROM users WHERE id = $1
     ON CONFLICT (user_id) DO NOTHING`,
    [userId, reason],
  );
}

/** Only a user-initiated "unsubscribed" can be cleared by the user. */
export async function clearUserUnsubscribe(
  pool: Pool,
  userId: number,
): Promise<void> {
  await pool.query(
    "DELETE FROM email_suppressions WHERE user_id = $1 AND reason = 'unsubscribed'",
    [userId],
  );
}
