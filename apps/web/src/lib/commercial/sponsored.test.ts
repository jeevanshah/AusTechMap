import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { getActiveSponsoredPlacements } from "./sponsored";

function fakePool(rows: unknown[]): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } as unknown as Pool;
}

describe("Commercial Sponsored Placements Engine", () => {
  it("fetches active sponsored placements with correct structure", async () => {
    const mockRow = {
      id: "sp-1",
      company_id: "comp-1",
      display_name: "Atlassian",
      slug: "atlassian",
      campaign_name: "Sydney Engineering Hiring 2026",
      headline: "Join the Team Behind Jira and Confluence",
      target_role_families: ["software-engineering"],
      target_regions: ["102"],
      cta_label: "View Open Tech Roles",
      cta_url: "https://atlassian.com/careers",
      status: "active",
      start_date: new Date("2026-09-01T00:00:00Z"),
      end_date: new Date("2026-12-31T23:59:59Z"),
      created_at: new Date("2026-09-01T00:00:00Z"),
      updated_at: new Date("2026-09-01T00:00:00Z"),
    };

    const pool = fakePool([mockRow]);
    const placements = await getActiveSponsoredPlacements(pool, {
      roleFamily: "software-engineering",
    });

    expect(placements).toHaveLength(1);
    expect(placements[0]?.companyName).toBe("Atlassian");
    expect(placements[0]?.ctaLabel).toBe("View Open Tech Roles");
    expect(placements[0]?.headline).toBe("Join the Team Behind Jira and Confluence");
  });

  it("handles empty placements gracefully", async () => {
    const pool = fakePool([]);
    const placements = await getActiveSponsoredPlacements(pool);
    expect(placements).toEqual([]);
  });
});
