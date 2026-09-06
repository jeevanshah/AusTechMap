import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

/**
 * Consolidates two previously-diverging audit_records writers:
 * admin/companies/actions.ts's private writeAudit() (reason/before/after
 * always present) and admin/review/actions.ts's inline insert (which
 * omitted reason/before_state/after_state entirely). actorUserId always
 * comes from the caller's verified session -- never a placeholder.
 */
export interface RecordAuditInput {
  actorUserId: number;
  action: string;
  targetType: string;
  targetId: string;
  reason?: string | null;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}

export async function recordAudit(
  pool: Pool,
  input: RecordAuditInput,
): Promise<void> {
  await pool.query(
    `INSERT INTO audit_records (
       actor_type, actor_id, action, target_type, target_id,
       reason, before_state, after_state, metadata, request_id
     )
     VALUES ('user', $1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      String(input.actorUserId),
      input.action,
      input.targetType,
      input.targetId,
      input.reason ?? null,
      input.beforeState ? JSON.stringify(input.beforeState) : null,
      input.afterState ? JSON.stringify(input.afterState) : null,
      JSON.stringify(input.metadata ?? {}),
      randomUUID(),
    ],
  );
}
