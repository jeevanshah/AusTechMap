import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPool } from "../../../lib/db";
import { GET as getCompanyOg } from "./company/[slug]/route";
import { GET as getRegionOg } from "./region/[code]/route";

vi.mock("../../../lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/db")>();
  return { ...actual, getPool: vi.fn() };
});

vi.mock("../../../lib/queries/getRegionOpportunity", () => ({
  getRegionOpportunity: vi.fn().mockResolvedValue({
    region: {
      code: "117",
      name: "Sydney - City and Inner South",
      type: "sa4",
    },
    summary: {
      employerCount: 45,
      monitoredEmployerCount: 30,
      activeJobCount: 120,
      industryCount: 12,
    },
    migrationContext: {
      categories: ["category_2"],
      damaNames: [],
    },
    employers: [],
    jobs: [],
    laborSignals: [],
    score: {
      value: 82,
      methodologyVersion: "1.0",
      periodStart: "2026-01-01",
      periodEnd: "2026-06-30",
      generatedAt: "2026-09-01T00:00:00Z",
      components: {},
      sufficiency: {
        sufficient: true,
        reasons: [],
      },
    },
  }),
}));

function fakePool(rows: unknown[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

describe("OpenGraph Intelligence Cards", () => {
  beforeEach(() => {
    vi.mocked(getPool).mockReset();
  });

  describe("GET /api/og/company/[slug]", () => {
    it("returns an ImageResponse with 200 status and image content-type", async () => {
      vi.mocked(getPool).mockReturnValue(
        fakePool([
          {
            id: "dcc011db-dd7e-4988-982a-eadf8ef371ce",
            slug: "atlassian",
            display_name: "Atlassian",
            domain: "atlassian.com",
            primary_category: "SaaS",
            city: "Sydney",
            has_sponsorship_evidence: true,
            agreement_type: "Skilled Refugee Pilot",
            is_regional: false,
            active_jobs_count: 14,
            verified_at: "2026-09-01T00:00:00Z",
          },
        ]),
      );

      const request = new Request("http://localhost/api/og/company/atlassian");
      const response = await getCompanyOg(request, {
        params: Promise.resolve({ slug: "atlassian" }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("image/png");
    });
  });

  describe("GET /api/og/region/[code]", () => {
    it("returns an ImageResponse with 200 status and image content-type", async () => {
      vi.mocked(getPool).mockReturnValue(fakePool([]));

      const request = new Request("http://localhost/api/og/region/117");
      const response = await getRegionOg(request, {
        params: Promise.resolve({ code: "117" }),
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("image/png");
    });
  });
});
