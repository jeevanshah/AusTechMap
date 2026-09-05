import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { DatabaseNotConfiguredError, getPool } from "../../../../lib/db";
import { GET } from "./route";

vi.mock("../../../../lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../lib/db")>();
  return { ...actual, getPool: vi.fn() };
});

function fakePool(rows: unknown[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

function request(query: string): Request {
  return new Request(`http://localhost/api/map/companies?${query}`);
}

describe("GET /api/map/companies", () => {
  beforeEach(() => {
    vi.mocked(getPool).mockReset();
  });

  it("returns matching points with a caching header", async () => {
    vi.mocked(getPool).mockReturnValue(
      fakePool([
        {
          slug: "acme",
          name: "Acme",
          careers_url: "https://acme.example.com/careers",
          lng: 151.2093,
          lat: -33.8688,
          location_type: "head_office",
        },
      ]),
    );

    const response = await GET(request("bbox=150,-34,152,-33"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe(
      "public, s-maxage=60, stale-while-revalidate=300",
    );
    const body = await response.json();
    expect(body.truncated).toBe(false);
    expect(body.points).toEqual([
      {
        slug: "acme",
        name: "Acme",
        lat: -33.8688,
        lng: 151.2093,
        locationType: "head_office",
        careersUrl: "https://acme.example.com/careers",
      },
    ]);
  });

  it("marks the response truncated when the row limit is exceeded", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({
      slug: `co-${i}`,
      name: `Co ${i}`,
      careers_url: null,
      lng: 151.2093,
      lat: -33.8688,
      location_type: "head_office",
    }));
    vi.mocked(getPool).mockReturnValue(fakePool(rows));

    const response = await GET(request("bbox=150,-34,152,-33"));
    const body = await response.json();

    expect(body.truncated).toBe(true);
    expect(body.points).toHaveLength(500);
  });

  it("forwards a sponsorship filter to the query", async () => {
    const pool = fakePool([]);
    vi.mocked(getPool).mockReturnValue(pool);

    await GET(request("bbox=150,-34,152,-33&sponsorship=true"));

    expect(pool.query).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([true]),
    );
  });

  it("returns 400 for a malformed bbox without touching the database", async () => {
    const response = await GET(request("bbox=not-a-bbox"));

    expect(response.status).toBe(400);
    expect(getPool).not.toHaveBeenCalled();
  });

  it("returns 503 when the database is not configured", async () => {
    vi.mocked(getPool).mockImplementation(() => {
      throw new DatabaseNotConfiguredError();
    });

    const response = await GET(request("bbox=150,-34,152,-33"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      version: 1,
      error: "database_not_configured",
    });
  });
});
