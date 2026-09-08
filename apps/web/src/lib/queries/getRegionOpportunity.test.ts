import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { getRegionOpportunity } from "./getRegionOpportunity";

describe("getRegionOpportunity", () => {
  it("maps regional evidence and preserves a suppressed score", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ id: "region-1", code: "101", name: "Capital Region" }],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            employer_count: "6",
            monitored_employer_count: "4",
            active_job_count: "3",
            industry_count: "2",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            slug: "registry-tech",
            name: "Registry Tech",
            primary_category: "GovTech",
            active_job_count: "1",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            company_slug: "registry-tech",
            company_name: "Registry Tech",
            title: "Platform Engineer",
            role_family: "Software Engineering",
            remote_type: "hybrid",
            source_url: "https://example.test/jobs/1",
            posted_at: new Date("2026-09-01T00:00:00Z"),
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          { category: "category_2", dama_name: null },
          { category: "dama", dama_name: "Capital DAMA" },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            dataset: "ivi",
            metric_key: "vacancy_direction",
            period_start: "2026-08-01",
            period_end: "2026-08-31",
            value: "1",
            unit: "direction",
            direction: 1,
            source_version: "2026-08",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [
          {
            score: null,
            period_start: "2026-08-01",
            period_end: "2026-08-31",
            methodology_version: "regional-opportunity-v1",
            generated_at: new Date("2026-09-08T02:00:00Z"),
            components_json: {},
            sufficiency_json: {
              sufficient: false,
              reasons: ["missing_nero"],
            },
          },
        ],
      });
    const result = await getRegionOpportunity(
      { query } as unknown as Pool,
      "101",
    );

    expect(query).toHaveBeenCalledTimes(7);
    expect(result).toMatchObject({
      region: { code: "101", name: "Capital Region" },
      summary: {
        employerCount: 6,
        monitoredEmployerCount: 4,
        activeJobCount: 3,
        industryCount: 2,
      },
      migrationContext: {
        categories: ["category_2", "dama"],
        damaNames: ["Capital DAMA"],
      },
      employers: [{ slug: "registry-tech", activeJobCount: 1 }],
      jobs: [
        { title: "Platform Engineer", postedAt: "2026-09-01T00:00:00.000Z" },
      ],
      laborSignals: [{ dataset: "ivi", value: 1 }],
      score: {
        value: null,
        methodologyVersion: "regional-opportunity-v1",
        sufficiency: { reasons: ["missing_nero"] },
      },
    });
  });

  it("returns null when the code is not an active SA4", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });

    await expect(
      getRegionOpportunity({ query } as unknown as Pool, "missing"),
    ).resolves.toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
});
