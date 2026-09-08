import type { Pool } from "pg";
import type { SponsoredPlacement } from "@austechmap/contracts";

export interface GetSponsoredPlacementsOptions {
  roleFamily?: string;
  region?: string;
  limit?: number;
}

/**
 * Retrieves active sponsored placements for a given discovery context.
 *
 * CRITICAL RULE (PRODUCT_SPEC.md §18.7):
 * Sponsored placements returned here are rendered in dedicated, quarantined
 * promotional cards. They are NEVER injected into or merged into the organic
 * Opportunity Match scoring or ranking pipelines.
 */
export async function getActiveSponsoredPlacements(
  pool: Pool,
  options: GetSponsoredPlacementsOptions = {},
): Promise<SponsoredPlacement[]> {
  const limit = options.limit ?? 3;

  const result = await pool.query<{
    id: string;
    company_id: string;
    display_name: string;
    slug: string;
    campaign_name: string;
    headline: string;
    target_role_families: string[];
    target_regions: string[];
    cta_label: string;
    cta_url: string | null;
    status: "active" | "paused" | "expired";
    start_date: Date;
    end_date: Date;
    created_at: Date;
    updated_at: Date;
  }>(
    `SELECT
       sp.id,
       sp.company_id,
       c.display_name,
       c.slug,
       sp.campaign_name,
       sp.headline,
       sp.target_role_families,
       sp.target_regions,
       sp.cta_label,
       sp.cta_url,
       sp.status,
       sp.start_date,
       sp.end_date,
       sp.created_at,
       sp.updated_at
     FROM sponsored_placements sp
     JOIN companies c ON c.id = sp.company_id
     WHERE sp.status = 'active'
       AND sp.start_date <= now()
       AND sp.end_date >= now()
       AND c.status = 'active'
       AND (
         $1::text IS NULL
         OR sp.target_role_families = '{}'
         OR $1 = ANY(sp.target_role_families)
       )
       AND (
         $2::text IS NULL
         OR sp.target_regions = '{}'
         OR $2 = ANY(sp.target_regions)
       )
     ORDER BY sp.created_at DESC
     LIMIT $3`,
    [options.roleFamily ?? null, options.region ?? null, limit],
  );

  return result.rows.map((r) => ({
    id: r.id,
    companyId: r.company_id,
    companyName: r.display_name,
    companySlug: r.slug,
    campaignName: r.campaign_name,
    headline: r.headline,
    targetRoleFamilies: r.target_role_families,
    targetRegions: r.target_regions,
    ctaLabel: r.cta_label,
    ctaUrl: r.cta_url ?? undefined,
    status: r.status,
    startDate: r.start_date.toISOString(),
    endDate: r.end_date.toISOString(),
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  }));
}
