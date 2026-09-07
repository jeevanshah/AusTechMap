import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { fetchMapCompanies } from "./mapCompanies";
import { searchCompanies } from "./searchCompanies";

function emptyPool(): { pool: Pool; query: ReturnType<typeof vi.fn> } {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  return { pool: { query } as unknown as Pool, query };
}

describe("public evidence lifecycle filtering", () => {
  it("counts and filters only active sponsorship evidence on the map", async () => {
    const { pool, query } = emptyPool();

    await fetchMapCompanies(pool, {
      bbox: { west: 150, south: -35, east: 152, north: -33 },
      category: null,
      sponsorship: true,
      regional: false,
    });

    const sql = String(query.mock.calls[0]?.[0]);
    expect(sql.match(/e2\.status = 'active'/g)).toHaveLength(1);
    expect(sql.match(/e\.status = 'active'/g)).toHaveLength(2);
  });

  it("counts and filters only active sponsorship evidence in both search paths", async () => {
    const { pool, query } = emptyPool();

    await searchCompanies(pool, "example", null, true, false);

    expect(query).toHaveBeenCalledTimes(2);
    for (const call of query.mock.calls) {
      const sql = String(call[0]);
      expect(sql).toContain("e2.status = 'active'");
      expect(sql).toContain("e.status = 'active'");
    }
  });
});
