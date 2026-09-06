import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DatabaseNotConfiguredError, getPool } from "../../../lib/db";
import { GET } from "./route";

vi.mock("../../../lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/db")>();
  return { ...actual, getPool: vi.fn() };
});

function fakePool(rows: unknown[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

describe("GET /api/regions", () => {
  beforeEach(() => {
    vi.mocked(getPool).mockReset();
  });

  it("returns real per-city regional counts with a caching header", async () => {
    vi.mocked(getPool).mockReturnValue(
      fakePool([
        { city: "Wollongong", count: "3" },
        { city: "Newcastle", count: "1" },
      ]),
    );

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=300, stale-while-revalidate=1800",
    );
    const body = await response.json();
    expect(body.hubs).toEqual([
      { city: "Wollongong", count: 3 },
      { city: "Newcastle", count: 1 },
    ]);
  });

  it("returns an empty list when no regional evidence exists yet", async () => {
    vi.mocked(getPool).mockReturnValue(fakePool([]));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.hubs).toEqual([]);
  });

  it("returns 503 when the database is not configured", async () => {
    vi.mocked(getPool).mockImplementation(() => {
      throw new DatabaseNotConfiguredError();
    });

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      version: 1,
      error: "database_not_configured",
    });
  });
});
