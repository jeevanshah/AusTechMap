import type { Pool } from "pg";

/**
 * Atomic Postgres-backed rate limiting -- Vercel functions are stateless
 * across invocations with no guaranteed shared process/isolate, so an
 * in-memory counter is unsafe (two concurrent requests can land on
 * different isolates and each see a fresh counter). Mirrors import_runs'
 * existing atomic claim pattern: one database-function round trip, with a
 * transaction-scoped advisory lock serialising each scope/key. Table:
 * db/migrations/0012_auth_rate_limiting.sql; hardened function:
 * db/migrations/0014_harden_auth_rate_limiting.sql.
 */
export interface RateLimitOptions {
  scope: string;
  key: string;
  limit: number;
  windowSeconds: number;
  lockSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  attemptCount: number;
  lockedUntil: Date | null;
}

export async function checkRateLimit(
  pool: Pool,
  options: RateLimitOptions,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  if (
    !Number.isInteger(options.limit) ||
    !Number.isInteger(options.windowSeconds) ||
    !Number.isInteger(options.lockSeconds) ||
    options.limit <= 0 ||
    options.windowSeconds <= 0 ||
    options.lockSeconds <= 0
  ) {
    throw new RangeError(
      "Rate-limit limit, windowSeconds, and lockSeconds must be positive integers",
    );
  }

  const result = await pool.query<{
    attempt_count: number;
    locked_until: Date | null;
  }>(
    `SELECT attempt_count, locked_until
     FROM check_auth_rate_limit($1, $2, $3, $4, $5, $6)`,
    [
      options.scope,
      options.key,
      now,
      options.windowSeconds,
      options.limit,
      options.lockSeconds,
    ],
  );

  const row = result.rows[0]!;
  const stillLocked = row.locked_until !== null && row.locked_until > now;
  const allowed = row.attempt_count <= options.limit && !stillLocked;

  return {
    allowed,
    attemptCount: row.attempt_count,
    lockedUntil: row.locked_until,
  };
}

/** Deletes rate-limit buckets whose window closed more than a day ago. */
export async function cleanupExpiredRateLimitBuckets(
  pool: Pool,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const result = await pool.query(
    "DELETE FROM auth_rate_limit_buckets WHERE window_start < $1",
    [cutoff],
  );
  return result.rowCount ?? 0;
}
