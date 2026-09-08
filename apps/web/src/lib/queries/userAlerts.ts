import type { Pool } from "pg";
import type { AlertType, UserAlert } from "@austechmap/contracts";

interface UserAlertRow {
  id: string;
  user_id: string;
  alert_type: AlertType;
  title: string;
  message: string;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  read_at: Date | null;
  created_at: Date;
}

function mapRow(row: UserAlertRow): UserAlert {
  return {
    id: row.id,
    userId: Number(row.user_id),
    alertType: row.alert_type,
    title: row.title,
    message: row.message,
    link: row.link,
    entityType: row.entity_type,
    entityId: row.entity_id,
    readAt: row.read_at ? row.read_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
  };
}

export async function listUserAlerts(
  pool: Pool,
  userId: number,
): Promise<{ unreadCount: number; alerts: UserAlert[] }> {
  const result = await pool.query<UserAlertRow>(
    `SELECT id, user_id, alert_type, title, message, link, entity_type, entity_id, read_at, created_at
     FROM user_alerts
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [userId],
  );

  const unreadCountResult = await pool.query<{ count: string }>(
    `SELECT count(*) AS count
     FROM user_alerts
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );

  return {
    unreadCount: parseInt(unreadCountResult.rows[0]?.count ?? "0", 10),
    alerts: result.rows.map(mapRow),
  };
}

export async function markAlertRead(
  pool: Pool,
  userId: number,
  alertId: string,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE user_alerts
     SET read_at = now()
     WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
    [alertId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function markAllAlertsRead(
  pool: Pool,
  userId: number,
): Promise<number> {
  const result = await pool.query(
    `UPDATE user_alerts
     SET read_at = now()
     WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return result.rowCount ?? 0;
}

export async function createUserAlert(
  pool: Pool,
  userId: number,
  alert: {
    alertType: AlertType;
    title: string;
    message: string;
    link?: string;
    entityType?: string;
    entityId?: string;
  },
): Promise<UserAlert> {
  const result = await pool.query<UserAlertRow>(
    `INSERT INTO user_alerts (user_id, alert_type, title, message, link, entity_type, entity_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, user_id, alert_type, title, message, link, entity_type, entity_id, read_at, created_at`,
    [
      userId,
      alert.alertType,
      alert.title,
      alert.message,
      alert.link ?? null,
      alert.entityType ?? null,
      alert.entityId ?? null,
    ],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Failed to insert user alert");
  return mapRow(row);
}
