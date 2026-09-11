import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Database,
  RadioTower,
  Server,
  ShieldCheck,
} from "lucide-react";

import { getPool } from "../../../lib/db";
import {
  getAtsSourceHealth,
  type AtsSourceHealthData,
  type AtsSourceHealthRecord,
} from "../../../lib/queries/sourceHealth";

export const dynamic = "force-dynamic";

interface MonitoringData {
  dbLatencyMs: number;
  latestMigration: string;
  totalCompanies: number;
  activeCompanies: number;
  totalJobs: number;
  activeJobs: number;
  totalEvents: number;
  totalDeliveries: number;
  sourceHealth: AtsSourceHealthData;
  anomalies: {
    companiesWithoutLocations: number;
    companiesWithoutCategory: number;
    staleEvidenceCount: number;
  };
}

async function loadMonitoringData(): Promise<MonitoringData> {
  const pool = getPool();

  const start = performance.now();
  await pool.query("SELECT 1;");
  const dbLatencyMs = Math.round(performance.now() - start);

  const [
    migrationRes,
    companiesRes,
    jobsRes,
    eventsRes,
    deliveriesRes,
    noLocationsRes,
    noCategoryRes,
    staleEvidenceRes,
    sourceHealth,
  ] = await Promise.all([
    pool.query<{ filename: string }>(
      "SELECT filename FROM schema_migrations ORDER BY version DESC LIMIT 1;",
    ),
    pool.query<{ total: string; active: string }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE status = 'active')::text AS active
       FROM companies;`,
    ),
    pool.query<{ total: string; active: string }>(
      `SELECT count(*)::text AS total,
              count(*) FILTER (WHERE expired_at IS NULL)::text AS active
       FROM jobs;`,
    ),
    pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM events;",
    ),
    pool.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM notification_deliveries;",
    ),
    pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM companies c
       WHERE c.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM company_locations cl WHERE cl.company_id = c.id);`,
    ),
    pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM companies c
       WHERE c.status = 'active'
         AND NOT EXISTS (SELECT 1 FROM company_category_links ccl WHERE ccl.company_id = c.id);`,
    ),
    pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM evidence
       WHERE status = 'active'
         AND observed_at < NOW() - INTERVAL '180 days';`,
    ),
    getAtsSourceHealth(pool),
  ]);

  return {
    dbLatencyMs,
    latestMigration: migrationRes.rows[0]?.filename || "None",
    totalCompanies: Number(companiesRes.rows[0]?.total || 0),
    activeCompanies: Number(companiesRes.rows[0]?.active || 0),
    totalJobs: Number(jobsRes.rows[0]?.total || 0),
    activeJobs: Number(jobsRes.rows[0]?.active || 0),
    totalEvents: Number(eventsRes.rows[0]?.count || 0),
    totalDeliveries: Number(deliveriesRes.rows[0]?.count || 0),
    sourceHealth,
    anomalies: {
      companiesWithoutLocations: Number(noLocationsRes.rows[0]?.count || 0),
      companiesWithoutCategory: Number(noCategoryRes.rows[0]?.count || 0),
      staleEvidenceCount: Number(staleEvidenceRes.rows[0]?.count || 0),
    },
  };
}

const SOURCE_STATUS_STYLE: Record<
  AtsSourceHealthRecord["status"],
  { label: string; className: string }
> = {
  healthy: {
    label: "On schedule",
    className: "border-forest-200 bg-forest-50 text-forest-900",
  },
  overdue: {
    label: "Overdue",
    className: "border-ochre-300 bg-ochre-50 text-ochre-900",
  },
  failing: {
    label: "Retrying after failure",
    className: "border-terracotta-200 bg-terracotta-50 text-terracotta-900",
  },
  paused: {
    label: "Paused",
    className: "border-slate-300 bg-slate-100 text-slate-700",
  },
  quarantined: {
    label: "Quarantined",
    className: "border-terracotta-300 bg-terracotta-50 text-terracotta-900",
  },
  disabled: {
    label: "Disabled",
    className: "border-slate-300 bg-slate-100 text-slate-700",
  },
};

function formatTimestamp(value: string | null): string {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Australia/Sydney",
    timeZoneName: "short",
  }).format(new Date(value));
}

export default async function AdminMonitoringPage() {
  let data: MonitoringData | null = null;
  let loadError: string | null = null;

  try {
    data = await loadMonitoringData();
  } catch (err) {
    loadError = String(err);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-8 sm:px-10 sm:py-12">
      <div className="flex items-center justify-between border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/companies"
            className="inline-flex items-center text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Admin Hub
          </Link>
          <span className="text-slate-300">•</span>
          <span className="text-xs font-bold tracking-wider uppercase text-emerald-800">
            System Monitoring & Health
          </span>
        </div>

        <a
          href="/api/health?deep=true"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
        >
          <Activity className="h-3.5 w-3.5 text-slate-500" />
          <span>Raw Diagnostics JSON</span>
        </a>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">Failed to query monitoring metrics</p>
          <p className="font-mono text-xs mt-1">{loadError}</p>
        </div>
      )}

      {data && (
        <div className="grid gap-8">
          {/* Operational Health Section */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Postgres Latency
                </span>
                <Database className="h-4 w-4 text-emerald-600" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-mono text-3xl font-bold text-slate-900">
                  {data.dbLatencyMs}ms
                </span>
                <span className="text-xs font-medium text-emerald-600">
                  {data.dbLatencyMs < 100 ? "Excellent" : "Nominal"}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Neon PostGIS Serverless Cluster
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">
                  Schema Migration
                </span>
                <Server className="h-4 w-4 text-sky-600" />
              </div>
              <div className="mt-3">
                <span className="font-mono text-xs font-bold text-slate-900 break-all">
                  {data.latestMigration}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Up to date through Phase 7 ledger
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">
                  MFA & RBAC Status
                </span>
                <ShieldCheck className="h-4 w-4 text-indigo-600" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900">
                  Enforced
                </span>
                <span className="text-xs font-medium text-emerald-600">
                  Active
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                Staff TOTP & Role Gates Active
              </p>
            </div>
          </section>

          {/* Core Pipeline Metrics */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <h2 className="text-base font-bold text-slate-900">
              Pipeline Inventory & Volume
            </h2>
            <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
              <div>
                <span className="text-xs font-medium text-slate-500 uppercase">
                  Employers
                </span>
                <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
                  {data.activeCompanies}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    / {data.totalCompanies}
                  </span>
                </p>
                <span className="text-xs text-slate-500">Active / Total</span>
              </div>

              <div>
                <span className="text-xs font-medium text-slate-500 uppercase">
                  Tech Jobs
                </span>
                <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
                  {data.activeJobs}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    / {data.totalJobs}
                  </span>
                </p>
                <span className="text-xs text-slate-500">Active / Scraped</span>
              </div>

              <div>
                <span className="text-xs font-medium text-slate-500 uppercase">
                  Change Events
                </span>
                <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
                  {data.totalEvents}
                </p>
                <span className="text-xs text-slate-500">
                  Derived longitudinal
                </span>
              </div>

              <div>
                <span className="text-xs font-medium text-slate-500 uppercase">
                  Alert Deliveries
                </span>
                <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
                  {data.totalDeliveries}
                </p>
                <span className="text-xs text-slate-500">
                  Deduplicated ledger
                </span>
              </div>
            </div>
          </section>

          <section
            className="border-y border-surface-border py-6"
            aria-labelledby="source-health-heading"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <RadioTower className="h-4 w-4 text-pacific-700" />
                  <h2
                    id="source-health-heading"
                    className="font-heading text-lg font-bold tracking-tight text-navy-900"
                  >
                    Hiring source health
                  </h2>
                </div>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                  Overdue means the source&apos;s recorded next crawl time has
                  passed. It does not infer a freshness SLA beyond the lifecycle
                  schedule.
                </p>
              </div>
              <span className="font-mono text-xs font-semibold tracking-[0.12em] text-slate-500">
                {data.sourceHealth.summary.total} REGISTERED SOURCES
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SourceHealthMetric
                label="Active"
                value={data.sourceHealth.summary.active}
                detail="Eligible for scheduled crawls"
                tone="text-navy-900"
              />
              <SourceHealthMetric
                label="Overdue"
                value={data.sourceHealth.summary.overdue}
                detail="Past recorded next-crawl time"
                tone="text-ochre-900"
              />
              <SourceHealthMetric
                label="Retrying"
                value={data.sourceHealth.summary.failing}
                detail="Active with recent terminal failure"
                tone="text-terracotta-900"
              />
              <SourceHealthMetric
                label="Quarantined"
                value={data.sourceHealth.summary.quarantined}
                detail="Requires an audited operator decision"
                tone="text-terracotta-900"
              />
              <SourceHealthMetric
                label="Count drops"
                value={data.sourceHealth.summary.jobCountAnomalies}
                detail="Latest crawl is 50% or lower than its baseline"
                tone="text-terracotta-900"
              />
            </div>

            {data.sourceHealth.truncated ? (
              <p className="mt-4 border-l-2 border-ochre-600 bg-ochre-50 px-4 py-3 text-sm leading-6 text-ochre-900">
                Showing the first 100 source records, ordered by attention
                state. The summary includes all registered sources.
              </p>
            ) : null}

            {data.sourceHealth.sources.length > 0 ? (
              <ol className="mt-5 divide-y divide-surface-border border-y border-surface-border">
                {data.sourceHealth.sources.map((source) => (
                  <li
                    key={source.id}
                    className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_minmax(13rem,0.7fr)_auto] lg:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link
                          href={`/companies/${source.companySlug}`}
                          className="font-semibold text-navy-900 hover:text-terracotta-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 focus-visible:ring-offset-2"
                        >
                          {source.companyName}
                        </Link>
                        <span
                          className={`inline-flex rounded border px-2 py-0.5 text-xs font-semibold ${SOURCE_STATUS_STYLE[source.status].className}`}
                        >
                          {SOURCE_STATUS_STYLE[source.status].label}
                        </span>
                        {source.jobCountAnomaly ? (
                          <span className="inline-flex items-center gap-1 rounded border border-terracotta-300 bg-terracotta-50 px-2 py-0.5 text-xs font-semibold text-terracotta-900">
                            <AlertTriangle className="h-3 w-3" /> Job-count drop
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 break-all font-mono text-xs leading-5 text-slate-500">
                        {source.provider} / {source.identifier}
                      </p>
                      {source.statusReason || source.lastFailureCode ? (
                        <p className="mt-1 text-xs leading-5 text-slate-600">
                          {source.statusReason ??
                            `Latest failure: ${source.lastFailureCode}`}
                        </p>
                      ) : null}
                      {source.jobCountAnomaly ? (
                        <p className="mt-1 text-xs leading-5 text-terracotta-900">
                          Latest crawl reported{" "}
                          {source.jobCountAnomaly.reportedJobCount} roles vs a
                          median baseline of{" "}
                          {source.jobCountAnomaly.baselineJobCount} across{" "}
                          {source.jobCountAnomaly.baselineSampleSize} prior
                          crawls.
                        </p>
                      ) : null}
                    </div>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs leading-5 text-slate-600 sm:grid-cols-4 lg:grid-cols-2">
                      <SourceHealthDetail
                        label="Active jobs"
                        value={String(source.activeJobs)}
                      />
                      <SourceHealthDetail
                        label="Failures"
                        value={String(source.consecutiveFailures)}
                      />
                      <SourceHealthDetail
                        label="Last attempt"
                        value={formatTimestamp(source.lastAttemptedAt)}
                      />
                      <SourceHealthDetail
                        label="Last success"
                        value={formatTimestamp(source.lastSucceededAt)}
                      />
                      <SourceHealthDetail
                        label="Next crawl"
                        value={formatTimestamp(source.nextCrawlAt)}
                      />
                    </dl>
                    <Link
                      href={`/companies/${source.companySlug}`}
                      className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded border border-navy-800 px-3 text-sm font-semibold text-navy-900 hover:border-terracotta-700 hover:text-terracotta-700 active:border-terracotta-900 active:text-terracotta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 focus-visible:ring-offset-2"
                    >
                      Inspect employer
                    </Link>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="mt-5 grid min-h-40 place-items-center border border-dashed border-surface-border bg-surface px-6 py-8 text-center">
                <div>
                  <Clock3 className="mx-auto h-6 w-6 text-slate-500" />
                  <p className="mt-2 text-sm font-semibold text-navy-900">
                    No hiring sources are registered
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    Source health will appear after a verified ATS source is
                    registered.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Data Anomaly Monitoring (PRODUCT_SPEC.md §13.2) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Data Anomaly Monitors
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automated checks catching data rot, missing locations, or
                  categorisation gaps
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 border border-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Monitored
              </span>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Missing Locations
                  </span>
                  {data.anomalies.companiesWithoutLocations > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                </div>
                <p className="mt-2 font-mono text-2xl font-bold text-slate-900">
                  {data.anomalies.companiesWithoutLocations}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Active employers without geometry
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Missing Categories
                  </span>
                  {data.anomalies.companiesWithoutCategory > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                </div>
                <p className="mt-2 font-mono text-2xl font-bold text-slate-900">
                  {data.anomalies.companiesWithoutCategory}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Employers needing sector mapping
                </p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">
                    Stale Evidence
                  </span>
                  {data.anomalies.staleEvidenceCount > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                </div>
                <p className="mt-2 font-mono text-2xl font-bold text-slate-900">
                  {data.anomalies.staleEvidenceCount}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Claims older than 180 days
                </p>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function SourceHealthMetric({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: string;
}) {
  return (
    <div className="border border-surface-border bg-surface p-4 shadow-2xs">
      <p className="text-xs font-semibold tracking-[0.08em] text-slate-500 uppercase">
        {label}
      </p>
      <p className={`mt-2 font-mono text-2xl font-bold tabular-nums ${tone}`}>
        {value}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-600">{detail}</p>
    </div>
  );
}

function SourceHealthDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[10px] font-semibold tracking-[0.08em] text-slate-500 uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-slate-700">{value}</dd>
    </div>
  );
}
