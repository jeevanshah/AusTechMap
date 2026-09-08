import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  getUserEntitlements,
  hasEntitlement,
  grantEntitlement,
  revokeEntitlement,
} from "./entitlements";

function fakeClient(queryHandler: (sql: string, params?: unknown[]) => Promise<unknown>) {
  return {
    query: vi.fn(queryHandler),
    release: vi.fn(),
  };
}

function fakePool(client: ReturnType<typeof fakeClient>): Pool {
  return {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn(client.query),
  } as unknown as Pool;
}

describe("Commercial Entitlements Engine", () => {
  it("resolves active user entitlements as a Set", async () => {
    const client = fakeClient(async (sql, params) => {
      if (sql.includes("FROM user_entitlements") && !sql.includes("EXISTS")) {
        expect(params?.[0]).toBe(42);
        return {
          rows: [
            { entitlement: "employer_analytics" },
            { entitlement: "institutional_export" },
          ],
        };
      }
      return { rows: [] };
    });
    const pool = fakePool(client);

    const entitlements = await getUserEntitlements(pool, 42);
    expect(entitlements.has("employer_analytics")).toBe(true);
    expect(entitlements.has("institutional_export")).toBe(true);
    expect(entitlements.has("api_stream")).toBe(false);
  });

  it("checks specific entitlement presence", async () => {
    const client = fakeClient(async (sql, params) => {
      if (sql.includes("SELECT EXISTS")) {
        expect(params?.[0]).toBe(42);
        expect(params?.[1]).toBe("institutional_export");
        return { rows: [{ exists: true }] };
      }
      return { rows: [] };
    });
    const pool = fakePool(client);

    const allowed = await hasEntitlement(pool, 42, "institutional_export");
    expect(allowed).toBe(true);
  });

  it("grants entitlement and emits audit record", async () => {
    const executedSql: string[] = [];
    const client = fakeClient(async (sql) => {
      executedSql.push(sql);
      if (sql.includes("INSERT INTO user_entitlements")) {
        return {
          rows: [
            {
              id: "ent-uuid-1",
              user_id: "42",
              entitlement: "institutional_export",
              granted_by_user_id: "1",
              granted_at: new Date("2026-09-09T00:00:00Z"),
              expires_at: null,
              metadata: { org: "CSIRO" },
            },
          ],
        };
      }
      return { rows: [] };
    });
    const pool = fakePool(client);

    const res = await grantEntitlement(pool, {
      userId: 42,
      entitlement: "institutional_export",
      grantedByUserId: 1,
      metadata: { org: "CSIRO" },
    });

    expect(res.id).toBe("ent-uuid-1");
    expect(res.entitlement).toBe("institutional_export");
    expect(executedSql.some((s) => s.includes("INSERT INTO user_entitlements"))).toBe(true);
    expect(executedSql.some((s) => s.includes("INSERT INTO audit_records"))).toBe(true);
  });

  it("revokes entitlement and logs audit record", async () => {
    const executedSql: string[] = [];
    const client = fakeClient(async (sql) => {
      executedSql.push(sql);
      return { rows: [] };
    });
    const pool = fakePool(client);

    await revokeEntitlement(pool, 42, "institutional_export", 1);

    expect(executedSql.some((s) => s.includes("DELETE FROM user_entitlements"))).toBe(true);
    expect(executedSql.some((s) => s.includes("INSERT INTO audit_records"))).toBe(true);
  });
});
