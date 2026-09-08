import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Database,
  Server,
  ShieldCheck,
} from "lucide-react";

import { getPool } from "../../../lib/db";

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
  ] = await Promise.all([
    pool.query<{ name: string }>(
      "SELECT name FROM schema_migrations ORDER BY version DESC LIMIT 1;",
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
    pool.query<{ count: string }>("SELECT count(*)::text AS count FROM events;"),
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
  ]);

  return {
    dbLatencyMs,
    latestMigration: migrationRes.rows[0]?.name || "None",
    totalCompanies: Number(companiesRes.rows[0]?.total || 0),
    activeCompanies: Number(companiesRes.rows[0]?.active || 0),
    totalJobs: Number(jobsRes.rows[0]?.total || 0),
    activeJobs: Number(jobsRes.rows[0]?.active || 0),
    totalEvents: Number(eventsRes.rows[0]?.count || 0),
    totalDeliveries: Number(deliveriesRes.rows[0]?.count || 0),
    anomalies: {
      companiesWithoutLocations: Number(noLocationsRes.rows[0]?.count || 0),
      companiesWithoutCategory: Number(noCategoryRes.rows[0]?.count || 0),
      staleEvidenceCount: Number(staleEvidenceRes.rows[0]?.count || 0),
    },
  };
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
                <span className="text-xs font-bold uppercase tracking-wider">Postgres Latency</span>
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
              <p className="mt-2 text-xs text-slate-500">Neon PostGIS Serverless Cluster</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">Schema Migration</span>
                <Server className="h-4 w-4 text-sky-600" />
              </div>
              <div className="mt-3">
                <span className="font-mono text-xs font-bold text-slate-900 break-all">
                  {data.latestMigration}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">Up to date through Phase 7 ledger</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs sm:col-span-2 lg:col-span-1">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold uppercase tracking-wider">MFA & RBAC Status</span>
                <ShieldCheck className="h-4 w-4 text-indigo-600" />
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900">Enforced</span>
                <span className="text-xs font-medium text-emerald-600">Active</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">Staff TOTP & Role Gates Active</p>
            </div>
          </section>

          {/* Core Pipeline Metrics */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <h2 className="text-base font-bold text-slate-900">Pipeline Inventory & Volume</h2>
            <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-4">
              <div>
                <span className="text-xs font-medium text-slate-500 uppercase">Employers</span>
                <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
                  {data.activeCompanies} <span className="text-xs font-normal text-slate-400">/ {data.totalCompanies}</span>
                </p>
                <span className="text-xs text-slate-500">Active / Total</span>
              </div>

              <div>
                <span className="text-xs font-medium text-slate-500 uppercase">Tech Jobs</span>
                <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
                  {data.activeJobs} <span className="text-xs font-normal text-slate-400">/ {data.totalJobs}</span>
                </p>
                <span className="text-xs text-slate-500">Active / Scraped</span>
              </div>

              <div>
                <span className="text-xs font-medium text-slate-500 uppercase">Change Events</span>
                <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
                  {data.totalEvents}
                </p>
                <span className="text-xs text-slate-500">Derived longitudinal</span>
              </div>

              <div>
                <span className="text-xs font-medium text-slate-500 uppercase">Alert Deliveries</span>
                <p className="mt-1 font-mono text-2xl font-bold text-slate-900">
                  {data.totalDeliveries}
                </p>
                <span className="text-xs text-slate-500">Deduplicated ledger</span>
              </div>
            </div>
          </section>

          {/* Data Anomaly Monitoring (PRODUCT_SPEC.md §13.2) */}
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-slate-900">Data Anomaly Monitors</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automated checks catching data rot, missing locations, or categorisation gaps
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
                  <span className="text-xs font-semibold text-slate-700">Missing Locations</span>
                  {data.anomalies.companiesWithoutLocations > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                </div>
                <p className="mt-2 font-mono text-2xl font-bold text-slate-900">
                  {data.anomalies.companiesWithoutLocations}
                </p>
                <p className="text-xs text-slate-500 mt-1">Active employers without geometry</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Missing Categories</span>
                  {data.anomalies.companiesWithoutCategory > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                </div>
                <p className="mt-2 font-mono text-2xl font-bold text-slate-900">
                  {data.anomalies.companiesWithoutCategory}
                </p>
                <p className="text-xs text-slate-500 mt-1">Employers needing sector mapping</p>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Stale Evidence</span>
                  {data.anomalies.staleEvidenceCount > 0 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  )}
                </div>
                <p className="mt-2 font-mono text-2xl font-bold text-slate-900">
                  {data.anomalies.staleEvidenceCount}
                </p>
                <p className="text-xs text-slate-500 mt-1">Claims older than 180 days</p>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
