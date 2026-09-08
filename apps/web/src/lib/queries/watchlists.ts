import type { Pool } from "pg";
import type { WatchlistEntry } from "@austechmap/contracts";

interface WatchlistRow {
  id: string;
  user_id: string;
  entity_type: "company" | "region";
  company_id: string | null;
  region_id: string | null;
  sa4_code: string | null;
  notes: string | null;
  created_at: Date;
  company_slug: string | null;
  company_name: string | null;
  company_city: string | null;
  company_category: string | null;
  has_sponsorship: boolean | null;
  is_regional: boolean | null;
  region_code: string | null;
  region_name: string | null;
  opportunity_score: string | null;
}

const SPONSORSHIP_CLAIM_TYPES = [
  "sponsorship_current_explicit",
  "sponsorship_historical_explicit",
  "sponsorship_labour_agreement",
];

export async function listWatchlist(
  pool: Pool,
  userId: number,
): Promise<WatchlistEntry[]> {
  const result = await pool.query<WatchlistRow>(
    `SELECT 
       w.id,
       w.user_id,
       w.entity_type,
       w.company_id,
       w.region_id,
       w.sa4_code,
       w.notes,
       w.created_at,
       c.slug AS company_slug,
       c.display_name AS company_name,
       research.claim_value ->> 'city' AS company_city,
       cat.label AS company_category,
       EXISTS (
         SELECT 1 FROM evidence e2
         WHERE e2.entity_type = 'company' AND e2.entity_id = c.id::text
           AND e2.claim_type = ANY($2::text[])
           AND e2.status = 'active'
       ) AS has_sponsorship,
       EXISTS (
         SELECT 1 FROM company_locations cl2
         JOIN resolved_locations rl2 ON rl2.id = cl2.resolved_location_id
         WHERE cl2.company_id = c.id AND rl2.migration_category IS NOT NULL
       ) AS is_regional,
       coalesce(r.code, w.sa4_code) AS region_code,
       coalesce(r.name, 'Regional Tech Hub ' || w.sa4_code) AS region_name,
       ros.score AS opportunity_score
     FROM watchlists w
     LEFT JOIN companies c ON w.company_id = c.id
     LEFT JOIN LATERAL (
       SELECT e.claim_value
       FROM evidence e
       WHERE e.entity_type = 'company' AND e.entity_id = c.id::text
         AND e.claim_type = 'employer_seed_research'
         AND e.status = 'active'
       ORDER BY e.observed_at DESC LIMIT 1
     ) research ON true
     LEFT JOIN LATERAL (
       SELECT cat_inner.label
       FROM company_categories cc_inner
       JOIN categories cat_inner ON cat_inner.id = cc_inner.category_id
       WHERE cc_inner.company_id = c.id
       ORDER BY cc_inner.is_primary DESC, cc_inner.created_at ASC
       LIMIT 1
     ) cat ON true
     LEFT JOIN regions r ON (w.region_id = r.id OR (w.sa4_code IS NOT NULL AND r.code = w.sa4_code AND r.region_type = 'sa4'))
     LEFT JOIN LATERAL (
       SELECT ros_inner.score
       FROM region_opportunity_scores ros_inner
       WHERE ros_inner.region_id = r.id
       ORDER BY ros_inner.period_end DESC, ros_inner.generated_at DESC
       LIMIT 1
     ) ros ON true
     WHERE w.user_id = $1
     ORDER BY w.created_at DESC`,
    [userId, SPONSORSHIP_CLAIM_TYPES],
  );

  return result.rows.map((row) => ({
    id: row.id,
    userId: Number(row.user_id),
    entityType: row.entity_type,
    companyId: row.company_id,
    regionId: row.region_id,
    sa4Code: row.sa4_code,
    notes: row.notes,
    createdAt: row.created_at.toISOString(),
    company:
      row.entity_type === "company" && row.company_id && row.company_slug
        ? {
            id: row.company_id,
            slug: row.company_slug,
            name: row.company_name ?? row.company_slug,
            city: row.company_city,
            primaryCategory: row.company_category,
            hasSponsorshipEvidence: Boolean(row.has_sponsorship),
            isRegional: Boolean(row.is_regional),
          }
        : undefined,
    region:
      row.entity_type === "region" && row.region_code
        ? {
            code: row.region_code,
            name: row.region_name ?? `Region ${row.region_code}`,
            opportunityScore: row.opportunity_score ? Number(row.opportunity_score) : null,
          }
        : undefined,
  }));
}

export async function isWatchingCompany(
  pool: Pool,
  userId: number,
  companyId: string,
): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM watchlists WHERE user_id = $1 AND company_id = $2 AND entity_type = 'company'",
    [userId, companyId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function isWatchingRegion(
  pool: Pool,
  userId: number,
  sa4Code: string,
): Promise<boolean> {
  const result = await pool.query(
    "SELECT 1 FROM watchlists WHERE user_id = $1 AND sa4_code = $2 AND entity_type = 'region'",
    [userId, sa4Code],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function toggleCompanyWatch(
  pool: Pool,
  userId: number,
  companyId: string,
): Promise<{ watching: boolean }> {
  const existing = await isWatchingCompany(pool, userId, companyId);
  if (existing) {
    await pool.query(
      "DELETE FROM watchlists WHERE user_id = $1 AND company_id = $2 AND entity_type = 'company'",
      [userId, companyId],
    );
    return { watching: false };
  } else {
    await pool.query(
      "INSERT INTO watchlists (user_id, entity_type, company_id) VALUES ($1, 'company', $2)",
      [userId, companyId],
    );
    return { watching: true };
  }
}

export async function toggleRegionWatch(
  pool: Pool,
  userId: number,
  sa4Code: string,
  regionId?: string,
): Promise<{ watching: boolean }> {
  const existing = await isWatchingRegion(pool, userId, sa4Code);
  if (existing) {
    await pool.query(
      "DELETE FROM watchlists WHERE user_id = $1 AND sa4_code = $2 AND entity_type = 'region'",
      [userId, sa4Code],
    );
    return { watching: false };
  } else {
    await pool.query(
      "INSERT INTO watchlists (user_id, entity_type, sa4_code, region_id) VALUES ($1, 'region', $2, $3)",
      [userId, sa4Code, regionId ?? null],
    );
    return { watching: true };
  }
}

export async function removeWatchlistEntry(
  pool: Pool,
  userId: number,
  entryId: string,
): Promise<boolean> {
  const result = await pool.query(
    "DELETE FROM watchlists WHERE id = $1 AND user_id = $2",
    [entryId, userId],
  );
  return (result.rowCount ?? 0) > 0;
}
