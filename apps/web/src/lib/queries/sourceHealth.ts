import type { Pool } from "pg";

export type AtsSourceHealthStatus =
  "healthy" | "overdue" | "failing" | "paused" | "quarantined" | "disabled";

export interface AtsSourceHealthRecord {
  id: string;
  companyName: string;
  companySlug: string;
  provider: string;
  identifier: string;
  status: AtsSourceHealthStatus;
  consecutiveFailures: number;
  activeJobs: number;
  lastAttemptedAt: string | null;
  lastSucceededAt: string | null;
  nextCrawlAt: string;
  lastFailureCode: string | null;
  statusReason: string | null;
}

export interface AtsSourceHealthSummary {
  total: number;
  active: number;
  overdue: number;
  failing: number;
  quarantined: number;
}

export interface AtsSourceHealthData {
  summary: AtsSourceHealthSummary;
  sources: AtsSourceHealthRecord[];
  truncated: boolean;
}

interface SummaryRow {
  total: string;
  active: string;
  overdue: string;
  failing: string;
  quarantined: string;
}

interface SourceRow {
  id: string;
  company_name: string;
  company_slug: string;
  ats_provider: string;
  ats_identifier: string;
  source_status: "active" | "paused" | "quarantined" | "disabled";
  consecutive_failures: number;
  active_jobs: string;
  last_attempted_at: Date | string | null;
  last_succeeded_at: Date | string | null;
  next_crawl_at: Date | string;
  last_failure_code: string | null;
  status_reason: string | null;
  is_overdue: boolean;
}

const MAX_SOURCES = 100;

function timestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function healthStatus(row: SourceRow): AtsSourceHealthStatus {
  if (row.source_status !== "active") return row.source_status;
  if (row.is_overdue) return "overdue";
  if (row.consecutive_failures > 0) return "failing";
  return "healthy";
}

export async function getAtsSourceHealth(
  pool: Pool,
): Promise<AtsSourceHealthData> {
  const [summaryResult, sourceResult] = await Promise.all([
    pool.query<SummaryRow>(
      `SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status = 'active')::text AS active,
         COUNT(*) FILTER (WHERE status = 'active' AND next_crawl_at <= NOW())::text AS overdue,
         COUNT(*) FILTER (WHERE status = 'active' AND consecutive_failures > 0)::text AS failing,
         COUNT(*) FILTER (WHERE status = 'quarantined')::text AS quarantined
       FROM company_ats_sources`,
    ),
    pool.query<SourceRow>(
      `SELECT
         cas.id,
         c.display_name AS company_name,
         c.slug AS company_slug,
         cas.ats_provider::text,
         cas.ats_identifier,
         cas.status AS source_status,
         cas.consecutive_failures,
         COUNT(j.id)::text AS active_jobs,
         cas.last_attempted_at,
         cas.last_succeeded_at,
         cas.next_crawl_at,
         cas.last_failure_code,
         cas.status_reason,
         (cas.status = 'active' AND cas.next_crawl_at <= NOW()) AS is_overdue
       FROM company_ats_sources cas
       JOIN companies c ON c.id = cas.company_id
       LEFT JOIN jobs j ON j.source_id = cas.source_id AND j.expired_at IS NULL
       GROUP BY cas.id, c.id
       ORDER BY
         CASE
           WHEN cas.status = 'quarantined' THEN 0
           WHEN cas.status = 'active' AND cas.next_crawl_at <= NOW() THEN 1
           WHEN cas.status = 'active' AND cas.consecutive_failures > 0 THEN 2
           WHEN cas.status = 'paused' THEN 3
           WHEN cas.status = 'disabled' THEN 4
           ELSE 5
         END,
         cas.next_crawl_at ASC,
         c.display_name ASC
       LIMIT $1`,
      [MAX_SOURCES],
    ),
  ]);

  const summary = summaryResult.rows[0] ?? {
    total: "0",
    active: "0",
    overdue: "0",
    failing: "0",
    quarantined: "0",
  };
  const total = Number(summary.total);

  return {
    summary: {
      total,
      active: Number(summary.active),
      overdue: Number(summary.overdue),
      failing: Number(summary.failing),
      quarantined: Number(summary.quarantined),
    },
    sources: sourceResult.rows.map((row) => ({
      id: row.id,
      companyName: row.company_name,
      companySlug: row.company_slug,
      provider: row.ats_provider,
      identifier: row.ats_identifier,
      status: healthStatus(row),
      consecutiveFailures: row.consecutive_failures,
      activeJobs: Number(row.active_jobs),
      lastAttemptedAt: timestamp(row.last_attempted_at),
      lastSucceededAt: timestamp(row.last_succeeded_at),
      nextCrawlAt: timestamp(row.next_crawl_at) ?? "",
      lastFailureCode: row.last_failure_code,
      statusReason: row.status_reason,
    })),
    truncated: total > MAX_SOURCES,
  };
}
