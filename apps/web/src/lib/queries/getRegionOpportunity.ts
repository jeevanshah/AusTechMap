import type { Pool } from "pg";

import type { RegionOpportunityResponse } from "@austechmap/contracts";

type RegionOpportunityData = Omit<RegionOpportunityResponse, "version">;

interface RegionRow {
  id: string;
  code: string;
  name: string;
}

interface SummaryRow {
  employer_count: string;
  monitored_employer_count: string;
  active_job_count: string;
  industry_count: string;
}

interface EmployerRow {
  slug: string;
  name: string;
  primary_category: string | null;
  active_job_count: string;
}

interface JobRow {
  company_slug: string;
  company_name: string;
  title: string;
  role_family: string | null;
  remote_type: RegionOpportunityData["jobs"][number]["remoteType"];
  source_url: string;
  posted_at: Date | string | null;
}

interface MigrationRow {
  category: RegionOpportunityData["migrationContext"]["categories"][number];
  dama_name: string | null;
}

interface LaborRow {
  dataset: RegionOpportunityData["laborSignals"][number]["dataset"];
  metric_key: string;
  period_start: Date | string;
  period_end: Date | string;
  value: string;
  unit: string;
  direction: number | null;
  source_version: string;
}

interface ScoreRow {
  score: string | null;
  period_start: Date | string;
  period_end: Date | string;
  methodology_version: string;
  generated_at: Date | string;
  components_json: RegionOpportunityData["score"]["components"];
  sufficiency_json: RegionOpportunityData["score"]["sufficiency"];
}

function dateOnly(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString().slice(0, 10)
    : value.slice(0, 10);
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

export async function getRegionOpportunity(
  pool: Pool,
  code: string,
): Promise<RegionOpportunityData | null> {
  const regionResult = await pool.query<RegionRow>(
    `SELECT r.id, r.code, r.name
     FROM regions r
     JOIN geography_releases gr ON gr.id = r.release_id
     WHERE r.region_type = 'sa4'
       AND r.code = $1
       AND gr.dataset = 'asgs_sa4'
       AND gr.is_active
     LIMIT 1`,
    [code],
  );
  const region = regionResult.rows[0];
  if (!region) return null;

  const [
    summaryResult,
    employerResult,
    jobResult,
    migrationResult,
    laborResult,
    scoreResult,
  ] = await Promise.all([
    pool.query<SummaryRow>(
      `WITH region_companies AS (
           SELECT DISTINCT cl.company_id
           FROM company_locations cl
           JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
           JOIN companies c ON c.id = cl.company_id
           WHERE rl.sa4_region_id = $1 AND c.status NOT IN ('merged', 'disabled')
         )
         SELECT
           COUNT(*) AS employer_count,
           COUNT(*) FILTER (WHERE EXISTS (
             SELECT 1 FROM company_ats_sources cas
             WHERE cas.company_id = rc.company_id AND cas.status = 'active'
           )) AS monitored_employer_count,
           (SELECT COUNT(DISTINCT ccl.category_id)
            FROM company_category_links ccl
            JOIN region_companies categorized ON categorized.company_id = ccl.company_id
           ) AS industry_count,
           (SELECT COUNT(*)
            FROM jobs j
            JOIN company_locations jcl ON jcl.id = j.company_location_id
            JOIN resolved_locations jrl ON jrl.id = jcl.resolved_location_id
            WHERE jrl.sa4_region_id = $1 AND j.expired_at IS NULL
           ) AS active_job_count
         FROM region_companies rc`,
      [region.id],
    ),
    pool.query<EmployerRow>(
      `WITH region_companies AS (
           SELECT DISTINCT cl.company_id
           FROM company_locations cl
           JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
           WHERE rl.sa4_region_id = $1
         )
         SELECT c.slug, c.display_name AS name,
           category.label AS primary_category,
           COUNT(j.id) AS active_job_count
         FROM region_companies rc
         JOIN companies c ON c.id = rc.company_id
         LEFT JOIN LATERAL (
           SELECT cg.label
           FROM company_category_links ccl
           JOIN categories cg ON cg.id = ccl.category_id
           WHERE ccl.company_id = c.id
           ORDER BY ccl.confidence DESC, cg.label ASC
           LIMIT 1
         ) category ON true
         LEFT JOIN company_locations jcl ON jcl.company_id = c.id
         LEFT JOIN resolved_locations jrl
           ON jrl.id = jcl.resolved_location_id AND jrl.sa4_region_id = $1
         LEFT JOIN jobs j
           ON j.company_location_id = jcl.id
          AND jrl.id IS NOT NULL
          AND j.expired_at IS NULL
         WHERE c.status NOT IN ('merged', 'disabled')
         GROUP BY c.id, c.slug, c.display_name, category.label
         ORDER BY active_job_count DESC, c.display_name ASC
         LIMIT 20`,
      [region.id],
    ),
    pool.query<JobRow>(
      `SELECT c.slug AS company_slug, c.display_name AS company_name,
           j.title, rf.label AS role_family, j.remote_type, j.source_url, j.posted_at
         FROM jobs j
         JOIN companies c ON c.id = j.company_id
         JOIN company_locations cl ON cl.id = j.company_location_id
         JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
         LEFT JOIN role_families rf ON rf.id = j.role_family_id
         WHERE rl.sa4_region_id = $1
           AND j.expired_at IS NULL
           AND c.status NOT IN ('merged', 'disabled')
         ORDER BY j.posted_at DESC NULLS LAST, j.first_seen_at DESC
         LIMIT 20`,
      [region.id],
    ),
    pool.query<MigrationRow>(
      `SELECT DISTINCT migration_category::text AS category, migration_dama_name AS dama_name
         FROM resolved_locations
         WHERE sa4_region_id = $1 AND migration_category IS NOT NULL
         ORDER BY category, dama_name NULLS FIRST`,
      [region.id],
    ),
    pool.query<LaborRow>(
      `SELECT dataset::text AS dataset, metric_key, period_start, period_end,
           value, unit, direction, source_version
         FROM regional_labor_observations
         WHERE region_id = $1 AND role_family_id IS NULL
         ORDER BY period_end DESC, dataset, metric_key
         LIMIT 20`,
      [region.id],
    ),
    pool.query<ScoreRow>(
      `SELECT score, period_start, period_end, methodology_version,
           generated_at, components_json, sufficiency_json
         FROM region_opportunity_scores
         WHERE region_id = $1 AND role_family_id IS NULL
         ORDER BY generated_at DESC
         LIMIT 1`,
      [region.id],
    ),
  ]);

  const summary = summaryResult.rows[0] ?? {
    employer_count: "0",
    monitored_employer_count: "0",
    active_job_count: "0",
    industry_count: "0",
  };
  const score = scoreResult.rows[0];

  return {
    region: { code: region.code, name: region.name, type: "sa4" },
    summary: {
      employerCount: Number(summary.employer_count),
      monitoredEmployerCount: Number(summary.monitored_employer_count),
      activeJobCount: Number(summary.active_job_count),
      industryCount: Number(summary.industry_count),
    },
    migrationContext: {
      categories: [...new Set(migrationResult.rows.map((row) => row.category))],
      damaNames: [
        ...new Set(
          migrationResult.rows.flatMap((row) =>
            row.dama_name ? [row.dama_name] : [],
          ),
        ),
      ],
    },
    employers: employerResult.rows.map((row) => ({
      slug: row.slug,
      name: row.name,
      primaryCategory: row.primary_category,
      activeJobCount: Number(row.active_job_count),
    })),
    jobs: jobResult.rows.map((row) => ({
      companySlug: row.company_slug,
      companyName: row.company_name,
      title: row.title,
      roleFamily: row.role_family,
      remoteType: row.remote_type,
      sourceUrl: row.source_url,
      postedAt: row.posted_at ? timestamp(row.posted_at) : null,
    })),
    laborSignals: laborResult.rows.map((row) => ({
      dataset: row.dataset,
      metricKey: row.metric_key,
      periodStart: dateOnly(row.period_start),
      periodEnd: dateOnly(row.period_end),
      value: Number(row.value),
      unit: row.unit,
      direction: row.direction,
      sourceVersion: row.source_version,
    })),
    score: score
      ? {
          value: score.score === null ? null : Number(score.score),
          methodologyVersion: score.methodology_version,
          periodStart: dateOnly(score.period_start),
          periodEnd: dateOnly(score.period_end),
          generatedAt: timestamp(score.generated_at),
          components: score.components_json,
          sufficiency: score.sufficiency_json,
        }
      : {
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
  };
}
