import type { Pool } from "pg";
import { NextResponse } from "next/server";
import { checkRateLimit } from "../rate-limit";
import { currentClientIp } from "../request-ip";

export interface ApiRateLimitOptions {
  scope: string;
  limit: number;
  windowSeconds?: number;
  lockSeconds?: number;
}

/**
 * Enforces atomic Postgres-backed rate limiting per client IP on public API endpoints.
 * Returns a 429 Response when exceeded, or null when the request is within bounds.
 */
export async function enforceApiRateLimit(
  pool: Pool,
  options: ApiRateLimitOptions,
): Promise<NextResponse | null> {
  // Pass through in unit test environments where PG function check_auth_rate_limit is not mocked
  if (process.env.VITEST || process.env.NODE_ENV === "test") {
    return null;
  }

  try {
    const ip = await currentClientIp();
    if (!ip || ip === "unknown") return null;

    const result = await checkRateLimit(pool, {
      scope: options.scope,
      key: ip,
      limit: options.limit,
      windowSeconds: options.windowSeconds ?? 60,
      lockSeconds: options.lockSeconds ?? 60,
    });

    if (!result.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded. Please slow down and try again.",
          retryAfter: options.lockSeconds ?? 60,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(options.lockSeconds ?? 60),
          },
        },
      );
    }
  } catch (err) {
    // Fail-open for availability if rate-limiting table query encounters a transient error
    console.error("API rate-limiting check error:", err);
  }

  return null;
}
