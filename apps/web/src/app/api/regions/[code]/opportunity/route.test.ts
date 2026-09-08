import { beforeEach, describe, expect, it, vi } from "vitest";

import { DatabaseNotConfiguredError, getPool } from "../../../../../lib/db";
import { getRegionOpportunity } from "../../../../../lib/queries/getRegionOpportunity";
import { GET } from "./route";

vi.mock("../../../../../lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../lib/db")>();
  return { ...actual, getPool: vi.fn() };
});

vi.mock("../../../../../lib/queries/getRegionOpportunity", () => ({
  getRegionOpportunity: vi.fn(),
}));

const request = new Request("https://example.test/api/regions/101/opportunity");

function context(code = "101") {
  return { params: Promise.resolve({ code }) };
}

describe("GET /api/regions/[code]/opportunity", () => {
  beforeEach(() => {
    vi.mocked(getPool).mockReset();
    vi.mocked(getRegionOpportunity).mockReset();
    vi.mocked(getPool).mockReturnValue({} as ReturnType<typeof getPool>);
  });

  it("returns a versioned profile with an honest suppressed score", async () => {
    vi.mocked(getRegionOpportunity).mockResolvedValue({
      region: { code: "101", name: "Capital Region", type: "sa4" },
      summary: {
        employerCount: 2,
        monitoredEmployerCount: 1,
        activeJobCount: 0,
        industryCount: 1,
      },
      migrationContext: { categories: ["category_2"], damaNames: [] },
      employers: [],
      jobs: [],
      laborSignals: [],
      score: {
        value: null,
        methodologyVersion: null,
        periodStart: null,
        periodEnd: null,
        generatedAt: null,
        components: {},
        sufficiency: {
          sufficient: false,
          reasons: ["score_not_generated"],
        },
      },
    });

    const response = await GET(request, context());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300");
    await expect(response.json()).resolves.toMatchObject({
      version: 1,
      region: { code: "101" },
      score: { value: null },
    });
  });

  it("returns 404 for an unknown active SA4", async () => {
    vi.mocked(getRegionOpportunity).mockResolvedValue(null);

    const response = await GET(request, context("missing"));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      version: 1,
      error: "region_not_found",
    });
  });

  it("returns 503 when the database is not configured", async () => {
    vi.mocked(getPool).mockImplementation(() => {
      throw new DatabaseNotConfiguredError();
    });

    const response = await GET(request, context());

    expect(response.status).toBe(503);
  });
});
