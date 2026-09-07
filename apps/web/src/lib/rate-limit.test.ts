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

  it("regression: the generated SQL locks only once attempt_count exceeds the limit, not merely reaches it (off-by-one)", async () => {
    // The previous test above only proves the *mocked return row* says
    // allowed -- it never actually exercised the SQL's own CASE WHEN, so
    // it kept passing even when the real query used `>= $4` and locked
    // out the 5th attempt itself. This asserts on the literal SQL text
    // sent to the database, so reverting the operator fails this test
    // directly rather than only failing in production.
    const pool = fakePool({ attempt_count: 5, locked_until: null });
    await checkRateLimit(pool, {
      scope: "mfa_attempt",
      key: "42",
      limit: 5,
      windowSeconds: 900,
      lockSeconds: 900,
    });
    const [sql] = vi.mocked(pool.query).mock.calls[0]!;
    expect(String(sql)).toMatch(/attempt_count\s*\+\s*1\s*>\s*\$4/);
    expect(String(sql)).not.toMatch(/attempt_count\s*\+\s*1\s*>=\s*\$4/);
  });

  it("integration-style: permits attempts 1-5 and locks starting at attempt 6, across a real sequential run", async () => {
    // A stateful fake that actually applies the same UPSERT semantics
    // (attempt_count increments every call; locked_until is set once the
    // real SQL's condition -- extracted from the query text itself, not
    // re-guessed -- is met) rather than a fixed per-call mock, so this
    // proves end-to-end sequential behavior, not just one isolated call.
    let attemptCount = 0;
    let lockedUntil: Date | null = null;
    const pool = {
      query: vi.fn().mockImplementation((sql: string, params: unknown[]) => {
        const limit = params[3] as number;
        const lockUntilParam = params[4] as Date;
        attemptCount += 1;
        const conditionMet = /attempt_count\s*\+\s*1\s*>\s*\$4/.test(sql)
          ? attemptCount > limit
          : attemptCount >= limit; // falls back to the buggy semantics if ever reintroduced
        if (conditionMet) lockedUntil = lockUntilParam;
        return Promise.resolve({
          rows: [{ attempt_count: attemptCount, locked_until: lockedUntil }],
        });
      }),
    } as unknown as Pool;

    const results: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      const result = await checkRateLimit(pool, {
        scope: "mfa_attempt",
        key: "42",
        limit: 5,
        windowSeconds: 900,
        lockSeconds: 900,
      });
      results.push(result.allowed);
    }

    expect(results).toEqual([true, true, true, true, true, false]);
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
