import type { Pool } from "pg";
import type { EntitlementType, UserEntitlement } from "@austechmap/contracts";
import { recordAudit } from "../audit";

/**
 * Returns all active (unexpired) entitlements for a user.
 */
export async function getUserEntitlements(
  pool: Pool,
  userId: number,
): Promise<Set<EntitlementType>> {
  const result = await pool.query<{ entitlement: EntitlementType }>(
    `SELECT entitlement
     FROM user_entitlements
     WHERE user_id = $1
       AND (expires_at IS NULL OR expires_at > now())`,
    [userId],
  );

  return new Set(result.rows.map((r) => r.entitlement));
}

/**
 * Checks whether a user holds a specific active entitlement.
 */
export async function hasEntitlement(
  pool: Pool,
  userId: number,
  entitlement: EntitlementType,
): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM user_entitlements
       WHERE user_id = $1
         AND entitlement = $2
         AND (expires_at IS NULL OR expires_at > now())
     ) AS exists`,
    [userId, entitlement],
  );

  return result.rows[0]?.exists ?? false;
}

export interface GrantEntitlementInput {
  userId: number;
  entitlement: EntitlementType;
  grantedByUserId?: number | null;
  expiresAt?: Date | null;
  metadata?: Record<string, unknown>;
}

/**
 * Grants an entitlement to a user and logs an audit record.
 */
export async function grantEntitlement(
  pool: Pool,
  input: GrantEntitlementInput,
): Promise<UserEntitlement> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    const res = await client.query<{
      id: string;
      user_id: string;
      entitlement: EntitlementType;
      granted_by_user_id: string | null;
      granted_at: Date;
      expires_at: Date | null;
      metadata: Record<string, unknown>;
    }>(
      `INSERT INTO user_entitlements (
         user_id, entitlement, granted_by_user_id, expires_at, metadata
       ) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, entitlement) DO UPDATE
         SET granted_by_user_id = EXCLUDED.granted_by_user_id,
             granted_at = now(),
             expires_at = EXCLUDED.expires_at,
             metadata = EXCLUDED.metadata
       RETURNING *`,
      [
        input.userId,
        input.entitlement,
        input.grantedByUserId ?? null,
        input.expiresAt ?? null,
        JSON.stringify(input.metadata ?? {}),
      ],
    );

    const row = res.rows[0];
    if (!row) throw new Error("Failed to grant entitlement");

    if (input.grantedByUserId) {
      await recordAudit(client, {
        actorUserId: input.grantedByUserId,
        action: "entitlement.grant",
        targetType: "user",
        targetId: String(input.userId),
        reason: `Granted entitlement ${input.entitlement}`,
        metadata: {
          entitlement: input.entitlement,
          expires_at: input.expiresAt ? input.expiresAt.toISOString() : null,
        },
      });
    }

    await client.query("COMMIT;");

    return {
      id: row.id,
      userId: Number(row.user_id),
      entitlement: row.entitlement,
      grantedByUserId: row.granted_by_user_id ? Number(row.granted_by_user_id) : undefined,
      grantedAt: row.granted_at.toISOString(),
      expiresAt: row.expires_at ? row.expires_at.toISOString() : undefined,
      metadata: row.metadata,
    };
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Revokes an entitlement and logs an audit record.
 */
export async function revokeEntitlement(
  pool: Pool,
  userId: number,
  entitlement: EntitlementType,
  revokedByUserId: number,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    await client.query(
      `DELETE FROM user_entitlements
       WHERE user_id = $1 AND entitlement = $2`,
      [userId, entitlement],
    );

    await recordAudit(client, {
      actorUserId: revokedByUserId,
      action: "entitlement.revoke",
      targetType: "user",
      targetId: String(userId),
      reason: `Revoked entitlement ${entitlement}`,
      metadata: { entitlement },
    });

    await client.query("COMMIT;");
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}
