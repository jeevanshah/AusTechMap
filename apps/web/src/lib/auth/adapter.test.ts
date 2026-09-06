import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { RoleAwareAdapter } from "./adapter";
import {
  STAFF_SESSION_MAX_AGE_S,
  USER_SESSION_MAX_AGE_S,
} from "./session-policy";

function fakePool(roleRow: { role: string } | undefined): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: roleRow ? [roleRow] : [] }),
  } as unknown as Pool;
}

describe("RoleAwareAdapter", () => {
  it("gives a plain user a ~30-day session on createSession", async () => {
    const pool = fakePool({ role: "user" });
    const adapter = RoleAwareAdapter(pool);
    const before = Date.now();

    await adapter.createSession!({
      sessionToken: "tok",
      userId: "1",
      expires: new Date(0), // Auth.js core's own computed value -- must be overridden
    });

    const call = vi
      .mocked(pool.query)
      .mock.calls.find(([sql]) => String(sql).includes("insert into sessions"));
    const passedExpires = call?.[1]?.[1] as unknown as Date;
    const deltaSeconds = (passedExpires.getTime() - before) / 1000;
    expect(deltaSeconds).toBeGreaterThan(USER_SESSION_MAX_AGE_S - 5);
    expect(deltaSeconds).toBeLessThan(USER_SESSION_MAX_AGE_S + 5);
  });

  it("gives a reviewer/admin an 8-hour session on createSession", async () => {
    const pool = fakePool({ role: "admin" });
    const adapter = RoleAwareAdapter(pool);
    const before = Date.now();

    await adapter.createSession!({
      sessionToken: "tok",
      userId: "1",
      expires: new Date(0),
    });

    const call = vi
      .mocked(pool.query)
      .mock.calls.find(([sql]) => String(sql).includes("insert into sessions"));
    const passedExpires = call?.[1]?.[1] as unknown as Date;
    const deltaSeconds = (passedExpires.getTime() - before) / 1000;
    expect(deltaSeconds).toBeGreaterThan(STAFF_SESSION_MAX_AGE_S - 5);
    expect(deltaSeconds).toBeLessThan(STAFF_SESSION_MAX_AGE_S + 5);
  });

  it("falls back to the base adapter's own expires when the session token can't be resolved to a role", async () => {
    const query = vi.fn().mockImplementation((sql: string) => {
      if (String(sql).includes("SELECT u.role")) return { rows: [] }; // no matching session/user
      if (String(sql).includes("select * from sessions where")) {
        return {
          rows: [{ sessionToken: "tok", userId: "1", expires: new Date(0) }],
        };
      }
      return { rows: [{}] };
    });
    const pool = { query } as unknown as Pool;
    const adapter = RoleAwareAdapter(pool);
    const fixedExpires = new Date("2030-01-01T00:00:00Z");

    await adapter.updateSession!({
      sessionToken: "tok",
      expires: fixedExpires,
    });

    const call = query.mock.calls.find(([sql]) =>
      String(sql).includes("UPDATE sessions"),
    );
    expect(call?.[1]?.[1]).toEqual(fixedExpires);
  });
});
