import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPool } from "../../../lib/db";
import { GET as getCompaniesExport } from "./companies/route";
import { GET as getRegionsExport } from "./regions/route";
import * as entitlementsModule from "../../../lib/commercial/entitlements";
import * as authModule from "../../../auth";

vi.mock("../../../lib/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../lib/db")>();
  return { ...actual, getPool: vi.fn() };
});

vi.mock("../../../auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

vi.mock("../../../lib/commercial/entitlements", () => ({
  hasEntitlement: vi.fn().mockResolvedValue(false),
}));

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
      components: {
        employerDepth: 20,
        currentVacancies: 18,
        hiringMomentum: 12,
        laborMarketDirection: 14,
        industryDiversity: 8,
      },
      sufficiency: {
        sufficient: true,
        reasons: [],
      },
    },
  }),
}));

function fakePool(
  queryHandler: (sql: string, params?: unknown[]) => unknown,
): Pool {
  return {
    query: vi.fn().mockImplementation((sql, params) => {
      const rows = queryHandler(sql, params);
      return Promise.resolve({ rows });
    }),
  } as unknown as Pool;
}

describe("CSV Export Endpoints & Institutional Controls", () => {
  beforeEach(() => {
    vi.mocked(getPool).mockReset();
    (authModule.auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      null,
    );
    vi.spyOn(entitlementsModule, "hasEntitlement").mockResolvedValue(false);
  });

  describe("GET /api/export/companies", () => {
    it("returns formatted CSV with community columns for public requests", async () => {
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
            is_claimed: true,
            verified_at: "2026-09-01T00:00:00Z",
          },
        ]),
      );

      const request = new Request(
        "http://localhost/api/export/companies?sponsorship=true",
      );
      const response = await getCompaniesExport(request);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain("text/csv");
      expect(response.headers.get("Content-Disposition")).toContain(
        "attachment; filename=",
      );

      const csvText = await response.text();
      expect(csvText).toContain("Company Name");
      expect(csvText).toContain("Atlassian");
      expect(csvText).toContain("Skilled Refugee Pilot");
      expect(csvText).not.toContain(
        "# AusTechMap Institutional Intelligence Export",
      );
    });

    it("includes institutional watermark and audited columns for licensed analysts", async () => {
      (
        authModule.auth as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        user: { id: "42", email: "analyst@csiro.au", role: "user" },
      });
      vi.spyOn(entitlementsModule, "hasEntitlement").mockResolvedValue(true);

      vi.mocked(getPool).mockReturnValue(
        fakePool(() => [
          {
            slug: "canva",
            display_name: "Canva",
            abn: "80158929938",
            acn: "158929938",
            domain: "canva.com",
            careers_url: "https://canva.com/careers",
            primary_category: "Design Software",
            city: "Sydney",
            is_regional: false,
            has_sponsorship_evidence: true,
            active_jobs_count: 24,
            active_evidence_count: 8,
            is_claimed: true,
            verified_at: "2026-09-01T00:00:00Z",
          },
        ]),
      );

      const request = new Request("http://localhost/api/export/companies");
      const response = await getCompaniesExport(request);

      expect(response.status).toBe(200);
      const csvText = await response.text();
      expect(csvText).toContain(
        "# AusTechMap Institutional Intelligence Export (Licensed to: analyst@csiro.au",
      );
      expect(csvText).toContain("ABN,ACN,Active Evidence Count");
      expect(csvText).toContain("80158929938");
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
      const csvText = await response.text();
      expect(csvText).toContain("SA4 Code");
      expect(csvText).toContain("Tech Opportunity Score");
      expect(csvText).toContain("Sydney - City and Inner South");
      expect(csvText).toContain("82");
    });

    it("includes institutional component breakdown for licensed analysts", async () => {
      (
        authModule.auth as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        user: { id: "42", email: "analyst@csiro.au", role: "user" },
      });
      vi.spyOn(entitlementsModule, "hasEntitlement").mockResolvedValue(true);

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
      const csvText = await response.text();
      expect(csvText).toContain(
        "# AusTechMap Institutional Regional Intelligence Export",
      );
      expect(csvText).toContain(
        "Employer Depth Score,Vacancies Score,Momentum Score",
      );
    });
  });
});
