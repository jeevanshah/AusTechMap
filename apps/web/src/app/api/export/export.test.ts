import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPool } from "../../../lib/db";
import { GET as getCompaniesExport } from "./companies/route";
import { GET as getRegionsExport } from "./regions/route";

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
      categories: [],
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

function fakePool(queryHandler: (sql: string, params?: unknown[]) => unknown): Pool {
  return {
    query: vi.fn().mockImplementation((sql, params) => {
      const rows = queryHandler(sql, params);
      return Promise.resolve({ rows });
    }),
  } as unknown as Pool;
}

describe("CSV Export Endpoints", () => {
  beforeEach(() => {
    vi.mocked(getPool).mockReset();
  });

  describe("GET /api/export/companies", () => {
    it("returns formatted CSV with correct headers and content-disposition", async () => {
      vi.mocked(getPool).mockReturnValue(
        fakePool(() => [
          {
            slug: "atlassian",
            display_name: "Atlassian",
            domain: "atlassian.com",
            careers_url: "https://atlassian.com/careers",
            primary_category: "SaaS",
            city: "Sydney",
            is_regional: false,
            has_sponsorship_evidence: true,
            agreement_type: "Skilled Refugee Pilot",
            active_jobs_count: 12,
            verified_at: "2026-09-01T00:00:00Z",
          },
        ]),
      );

      const request = new Request("http://localhost/api/export/companies?sponsorship=true");
      const response = await getCompaniesExport(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/csv");
      expect(response.headers.get("Content-Disposition")).toContain("attachment; filename=");

      const csvText = await response.text();
      expect(csvText).toContain("Company Name");
      expect(csvText).toContain("Atlassian");
      expect(csvText).toContain("Skilled Refugee Pilot");
      expect(csvText).toContain("https://austechmap.com/companies/atlassian");
    });
  });

  describe("GET /api/export/regions", () => {
    it("returns formatted regional ecosystem CSV", async () => {
      vi.mocked(getPool).mockReturnValue(
        fakePool(() => [
          {
            code: "117",
            name: "Sydney - City and Inner South",
            state: "NSW",
          },
        ]),
      );

      const response = await getRegionsExport();

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/csv");
      expect(response.headers.get("Content-Disposition")).toContain("attachment; filename=");

      const csvText = await response.text();
      expect(csvText).toContain("SA4 Code");
      expect(csvText).toContain("Tech Opportunity Score");
      expect(csvText).toContain("Sydney - City and Inner South");
      expect(csvText).toContain("82");
    });
  });
});
