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
  jobCountAnomaly: AtsSourceJobCountAnomaly | null;
}

export interface AtsSourceJobCountAnomaly {
  reportedJobCount: number;
  baselineJobCount: number;
  baselineSampleSize: number;
  detectedAt: string;
}

export interface AtsSourceHealthSummary {
  total: number;
  active: number;
  overdue: number;
  failing: number;
  quarantined: number;
  jobCountAnomalies: number;
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
  job_count_anomalies: string;
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
  reported_job_count: number | null;
  baseline_job_count: string | null;
  baseline_sample_size: number | null;
  is_job_count_anomaly: boolean | null;
  anomaly_detected_at: Date | string | null;
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
      `WITH latest_metrics AS (
         SELECT DISTINCT ON (company_ats_source_id)
           company_ats_source_id, is_job_count_anomaly
         FROM ats_source_crawl_metrics
         ORDER BY company_ats_source_id, observed_at DESC, id DESC
       )
       SELECT
         COUNT(*)::text AS total,
         COUNT(*) FILTER (WHERE status = 'active')::text AS active,
         COUNT(*) FILTER (WHERE status = 'active' AND next_crawl_at <= NOW())::text AS overdue,
         COUNT(*) FILTER (WHERE status = 'active' AND consecutive_failures > 0)::text AS failing,
         COUNT(*) FILTER (WHERE status = 'quarantined')::text AS quarantined,
         COUNT(*) FILTER (WHERE latest_metrics.is_job_count_anomaly)::text AS job_count_anomalies
       FROM company_ats_sources
       LEFT JOIN latest_metrics ON latest_metrics.company_ats_source_id = company_ats_sources.id`,
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
         (cas.status = 'active' AND cas.next_crawl_at <= NOW()) AS is_overdue,
         latest_metric.reported_job_count,
         latest_metric.baseline_job_count::text,
         latest_metric.baseline_sample_size,
         latest_metric.is_job_count_anomaly,
         latest_metric.observed_at AS anomaly_detected_at
       FROM company_ats_sources cas
       JOIN companies c ON c.id = cas.company_id
       LEFT JOIN jobs j ON j.source_id = cas.source_id AND j.expired_at IS NULL
       LEFT JOIN LATERAL (
         SELECT reported_job_count, baseline_job_count, baseline_sample_size,
                is_job_count_anomaly, observed_at
         FROM ats_source_crawl_metrics
         WHERE company_ats_source_id = cas.id
         ORDER BY observed_at DESC, id DESC
         LIMIT 1
       ) latest_metric ON true
       GROUP BY cas.id, c.id, latest_metric.reported_job_count,
                latest_metric.baseline_job_count, latest_metric.baseline_sample_size,
                latest_metric.is_job_count_anomaly, latest_metric.observed_at
       ORDER BY
         CASE
           WHEN cas.status = 'quarantined' THEN 0
           WHEN latest_metric.is_job_count_anomaly THEN 1
           WHEN cas.status = 'active' AND cas.next_crawl_at <= NOW() THEN 2
           WHEN cas.status = 'active' AND cas.consecutive_failures > 0 THEN 3
           WHEN cas.status = 'paused' THEN 4
           WHEN cas.status = 'disabled' THEN 5
           ELSE 6
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
    job_count_anomalies: "0",
  };
  const total = Number(summary.total);

  return {
    summary: {
      total,
      active: Number(summary.active),
      overdue: Number(summary.overdue),
      failing: Number(summary.failing),
      quarantined: Number(summary.quarantined),
      jobCountAnomalies: Number(summary.job_count_anomalies),
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
      jobCountAnomaly:
        row.is_job_count_anomaly &&
        row.reported_job_count !== null &&
        row.baseline_job_count !== null &&
        row.baseline_sample_size !== null &&
        row.anomaly_detected_at !== null
          ? {
              reportedJobCount: row.reported_job_count,
              baselineJobCount: Number(row.baseline_job_count),
              baselineSampleSize: row.baseline_sample_size,
              detectedAt: timestamp(row.anomaly_detected_at) ?? "",
            }
          : null,
    })),
    truncated: total > MAX_SOURCES,
  };
}
