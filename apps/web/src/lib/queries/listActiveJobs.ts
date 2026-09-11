import type { Pool } from "pg";

export type PublicWorkStyle =
  "onsite" | "hybrid" | "remote" | "flexible_mixed" | "unknown";

export interface ActiveJobFilters {
  query?: string;
  roleFamily?: string;
  workStyle?: PublicWorkStyle;
}

export interface ActiveJobRecord {
  id: string;
  title: string;
  companyName: string;
  companySlug: string;
  roleFamily: string | null;
  roleFamilyKey: string | null;
  seniority: string;
  workStyle: PublicWorkStyle;
  locationText: string | null;
  sourceUrl: string;
  postedAt: string | null;
  firstSeenAt: string;
}

export interface ActiveJobRoleFamily {
  key: string;
  label: string;
}

export interface ActiveJobsPageData {
  jobs: ActiveJobRecord[];
  roleFamilies: ActiveJobRoleFamily[];
  total: number;
  truncated: boolean;
}

interface JobRow {
  id: string;
  title: string;
  company_name: string;
  company_slug: string;
  role_family: string | null;
  role_family_key: string | null;
  seniority: string;
  remote_type: PublicWorkStyle;
  location_text: string | null;
  source_url: string;
  posted_at: Date | string | null;
  first_seen_at: Date | string;
  total_count: string;
}

interface RoleFamilyRow {
  key: string;
  label: string;
}

const MAX_PUBLIC_JOBS = 100;

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function normalizeQuery(value: string | undefined): string {
  return value?.trim().slice(0, 120) ?? "";
}

export async function listActiveJobs(
  pool: Pool,
  filters: ActiveJobFilters = {},
): Promise<ActiveJobsPageData> {
  const query = normalizeQuery(filters.query);
  const roleFamily = filters.roleFamily?.trim().slice(0, 120) ?? "";
  const workStyle = filters.workStyle ?? null;

  const [jobResult, roleFamilyResult] = await Promise.all([
    pool.query<JobRow>(
      `SELECT
         j.id,
         j.title,
         c.display_name AS company_name,
         c.slug AS company_slug,
         rf.label AS role_family,
         rf.key AS role_family_key,
         j.seniority::text,
         j.remote_type::text,
         j.location_text,
         j.source_url,
         j.posted_at,
         j.first_seen_at,
         COUNT(*) OVER ()::text AS total_count
       FROM jobs j
       JOIN companies c ON c.id = j.company_id
       LEFT JOIN role_families rf ON rf.id = j.role_family_id
       WHERE j.expired_at IS NULL
         AND c.status NOT IN ('merged', 'disabled')
         AND (
           $1::text = ''
           OR j.title ILIKE '%' || $1 || '%'
           OR c.display_name ILIKE '%' || $1 || '%'
         )
         AND ($2::text = '' OR rf.key = $2)
         AND ($3::work_style IS NULL OR j.remote_type = $3)
       ORDER BY j.posted_at DESC NULLS LAST, j.first_seen_at DESC, j.id ASC
       LIMIT $4`,
      [query, roleFamily, workStyle, MAX_PUBLIC_JOBS],
    ),
    pool.query<RoleFamilyRow>(
      `SELECT DISTINCT rf.key, rf.label
       FROM role_families rf
       JOIN jobs j ON j.role_family_id = rf.id
       JOIN companies c ON c.id = j.company_id
       WHERE j.expired_at IS NULL AND c.status NOT IN ('merged', 'disabled')
       ORDER BY rf.label ASC`,
    ),
  ]);

  const total = Number(jobResult.rows[0]?.total_count ?? 0);

  return {
    jobs: jobResult.rows.map((row) => ({
      id: row.id,
      title: row.title,
      companyName: row.company_name,
      companySlug: row.company_slug,
      roleFamily: row.role_family,
      roleFamilyKey: row.role_family_key,
      seniority: row.seniority,
      workStyle: row.remote_type,
      locationText: row.location_text,
      sourceUrl: row.source_url,
      postedAt: row.posted_at ? timestamp(row.posted_at) : null,
      firstSeenAt: timestamp(row.first_seen_at),
    })),
    roleFamilies: roleFamilyResult.rows,
    total,
    truncated: total > MAX_PUBLIC_JOBS,
  };
}
