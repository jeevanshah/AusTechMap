import type { Pool } from "pg";

/**
 * No auth system exists in this app yet (ARCHITECTURE_DECISIONS.md §4.1
 * decided the role/session model but Phase 1 didn't build it — see the
 * admin/geography page's documented interim state). Every admin mutation
 * still has to attribute to *some* real users.id (audit_records and
 * review_queue_items both reference it), so until real sign-in exists,
 * everything from this UI is attributed to one fixed placeholder account,
 * not a per-person identity. This must be replaced by the real signed-in
 * user once auth lands — it is a known, visible gap, not a permanent design.
 */
const SYSTEM_ACTOR_EMAIL = "system-admin-ui@austechmap.internal";

export async function ensureSystemActor(pool: Pool): Promise<number> {
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO users (name, email, role)
     VALUES ('Admin UI (no auth yet)', $1, 'admin')
     ON CONFLICT ((lower(email))) DO NOTHING
     RETURNING id`,
    [SYSTEM_ACTOR_EMAIL],
  );
  if (inserted.rows[0]) {
    return Number(inserted.rows[0].id);
  }
  const existing = await pool.query<{ id: string }>(
    "SELECT id FROM users WHERE lower(email) = lower($1)",
    [SYSTEM_ACTOR_EMAIL],
  );
  if (!existing.rows[0]) {
    throw new Error("system actor user disappeared during ensure");
  }
  return Number(existing.rows[0].id);
}
