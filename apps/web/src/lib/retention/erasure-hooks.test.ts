import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { eraseUserRetentionData } from "./erasure-hooks";

describe("eraseUserRetentionData", () => {
  it("executes DELETE statements for saved searches, watchlists, and alerts", async () => {
    const executedQueries: Array<{ sql: string; values: unknown[] }> = [];
    const pool = {
      query: vi.fn().mockImplementation((sql: string, values: unknown[]) => {
        executedQueries.push({ sql, values });
        return Promise.resolve({ rows: [] });
      }),
    } as unknown as Pool;

    await eraseUserRetentionData(pool, 42);

    expect(executedQueries).toHaveLength(3);
    expect(executedQueries[0]?.sql).toContain("DELETE FROM saved_searches WHERE user_id = $1");
    expect(executedQueries[0]?.values).toEqual([42]);
    expect(executedQueries[1]?.sql).toContain("DELETE FROM watchlists WHERE user_id = $1");
    expect(executedQueries[1]?.values).toEqual([42]);
    expect(executedQueries[2]?.sql).toContain("DELETE FROM user_alerts WHERE user_id = $1");
    expect(executedQueries[2]?.values).toEqual([42]);
  });
});
