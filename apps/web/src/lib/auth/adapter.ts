import PostgresAdapter from "@auth/pg-adapter";
import type { Adapter, AdapterSession } from "@auth/core/adapters";
import type { Pool } from "pg";

import { sessionMaxAgeForRole } from "./session-policy";

/**
 * @auth/pg-adapter's own getSessionAndUser/getUser/getUserByEmail all use
 * `select *`, so role/status/mfa_verified_at already come back for free --
 * verified directly against the installed package's source
 * (node_modules/@auth/pg-adapter/src/index.ts) rather than assumed. The one
 * real gap: createSession/updateSession only ever write a single global
 * `expires`, but ARCHITECTURE_DECISIONS.md §4.1 requires a role-aware
 * session lifetime (30 days for `user`, 8 hours for `reviewer`/`admin`).
 * This wrapper is the one place that logic lives.
 */

async function roleForUser(pool: Pool, userId: string): Promise<string> {
  const result = await pool.query<{ role: string }>(
    "SELECT role FROM users WHERE id = $1",
    [userId],
  );
  return result.rows[0]?.role ?? "user";
}

async function roleForSessionToken(
  pool: Pool,
  sessionToken: string,
): Promise<string | null> {
  const result = await pool.query<{ role: string }>(
    `SELECT u.role FROM sessions s JOIN users u ON u.id = s."userId"
     WHERE s."sessionToken" = $1`,
    [sessionToken],
  );
  return result.rows[0]?.role ?? null;
}

function expiresFromNow(role: string): Date {
  return new Date(Date.now() + sessionMaxAgeForRole(role) * 1000);
}

export function RoleAwareAdapter(pool: Pool): Adapter {
  const base = PostgresAdapter(pool);

  return {
    ...base,
    async createSession(session) {
      const role = await roleForUser(pool, session.userId);
      return base.createSession!({ ...session, expires: expiresFromNow(role) });
    },
    async updateSession(session): Promise<AdapterSession | null | undefined> {
      const role = await roleForSessionToken(pool, session.sessionToken);
      if (role === null) {
        return base.updateSession!(session);
      }
      return base.updateSession!({ ...session, expires: expiresFromNow(role) });
    },
  };
}
