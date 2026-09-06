import type { Pool } from "pg";

/**
 * Atomic Postgres-backed rate limiting -- Vercel functions are stateless
 * across invocations with no guaranteed shared process/isolate, so an
 * in-memory counter is unsafe (two concurrent requests can land on
 * different isolates and each see a fresh counter). Mirrors import_runs'
 * existing atomic claim pattern: a single INSERT ... ON CONFLICT ... DO
 * UPDATE round trip, never a read-then-write race. Table:
 * db/migrations/0012_auth_rate_limiting.sql.
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

function windowStart(now: Date, windowSeconds: number): Date {
  const epochSeconds = Math.floor(now.getTime() / 1000);
  const bucketSeconds = epochSeconds - (epochSeconds % windowSeconds);
  return new Date(bucketSeconds * 1000);
}

export async function checkRateLimit(
  pool: Pool,
  options: RateLimitOptions,
  now: Date = new Date(),
): Promise<RateLimitResult> {
  const bucketStart = windowStart(now, options.windowSeconds);
  const lockedUntil = new Date(now.getTime() + options.lockSeconds * 1000);

  const result = await pool.query<{
    attempt_count: number;
    locked_until: Date | null;
  }>(
    `INSERT INTO auth_rate_limit_buckets (scope, key, window_start, attempt_count, locked_until)
     VALUES ($1, $2, $3, 1, NULL)
     ON CONFLICT (scope, key, window_start) DO UPDATE
       SET attempt_count = auth_rate_limit_buckets.attempt_count + 1,
           locked_until = CASE
             WHEN auth_rate_limit_buckets.attempt_count + 1 >= $4 THEN $5::timestamptz
             ELSE auth_rate_limit_buckets.locked_until
           END
     RETURNING attempt_count, locked_until`,
    [options.scope, options.key, bucketStart, options.limit, lockedUntil],
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
