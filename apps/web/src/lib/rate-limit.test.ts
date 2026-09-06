import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { checkRateLimit } from "./rate-limit";

function fakePool(row: {
  attempt_count: number;
  locked_until: Date | null;
}): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [row] }),
  } as unknown as Pool;
}

describe("checkRateLimit", () => {
  it("allows a request under the limit", async () => {
    const pool = fakePool({ attempt_count: 1, locked_until: null });
    const result = await checkRateLimit(pool, {
      scope: "magic_link_email",
      key: "a@example.com",
      limit: 5,
      windowSeconds: 900,
      lockSeconds: 900,
    });
    expect(result.allowed).toBe(true);
    expect(result.attemptCount).toBe(1);
  });

  it("issues a single atomic INSERT ... ON CONFLICT round trip", async () => {
    const pool = fakePool({ attempt_count: 1, locked_until: null });
    await checkRateLimit(pool, {
      scope: "mfa_attempt",
      key: "42",
      limit: 5,
      windowSeconds: 900,
      lockSeconds: 900,
    });
    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "ON CONFLICT (scope, key, window_start) DO UPDATE",
      ),
      expect.any(Array),
    );
  });

  it("still allows the Nth attempt itself, matching '5 attempts... followed by a lock'", async () => {
    const pool = fakePool({ attempt_count: 5, locked_until: null });
    const result = await checkRateLimit(pool, {
      scope: "mfa_attempt",
      key: "42",
      limit: 5,
      windowSeconds: 900,
      lockSeconds: 900,
    });
    expect(result.allowed).toBe(true);
  });

  it("disallows once the attempt count exceeds the limit", async () => {
    const pool = fakePool({ attempt_count: 6, locked_until: null });
    const result = await checkRateLimit(pool, {
      scope: "mfa_attempt",
      key: "42",
      limit: 5,
      windowSeconds: 900,
      lockSeconds: 900,
    });
    expect(result.allowed).toBe(false);
  });

  it("disallows while locked_until is in the future, even under the count", async () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const pool = fakePool({
      attempt_count: 2,
      locked_until: new Date("2026-01-01T00:10:00Z"),
    });
    const result = await checkRateLimit(
      pool,
      {
        scope: "mfa_attempt",
        key: "42",
        limit: 5,
        windowSeconds: 900,
        lockSeconds: 900,
      },
      now,
    );
    expect(result.allowed).toBe(false);
  });

  it("allows again once locked_until has passed", async () => {
    const now = new Date("2026-01-01T00:20:00Z");
    const pool = fakePool({
      attempt_count: 2,
      locked_until: new Date("2026-01-01T00:10:00Z"),
    });
    const result = await checkRateLimit(
      pool,
      {
        scope: "mfa_attempt",
        key: "42",
        limit: 5,
        windowSeconds: 900,
        lockSeconds: 900,
      },
      now,
    );
    expect(result.allowed).toBe(true);
  });
});
