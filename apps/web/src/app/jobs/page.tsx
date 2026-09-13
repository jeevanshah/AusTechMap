/* Hallmark · macrostructure: Index-First · theme: National Registry · system: DESIGN.md
 * pre-emit critique: P5 H4 E5 S5 R5 V4
 */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  Briefcase,
  Building2,
  Calendar,
  Compass,
  Filter,
  Globe,
  MapPin,
  Search,
  Sparkles,
  User,
} from "lucide-react";
import { GlobalNavbar } from "../../components/ui/GlobalNavbar";

import { auth } from "../../auth";
import { CompanyBrandMark } from "../../components/ui/CompanyBrandMark";
import { DatabaseNotConfiguredError, getPool } from "../../lib/db";
import {
  listActiveJobs,
  type ActiveJobFilters,
  type PublicWorkStyle,
} from "../../lib/queries/listActiveJobs";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Live tech jobs · Australia Tech Map",
  description:
    "Current technology roles sourced from verified Australian employer careers pages.",
};

const WORK_STYLES: Array<{ value: PublicWorkStyle; label: string }> = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "onsite", label: "On-site" },
  { value: "flexible_mixed", label: "Flexible" },
  { value: "unknown", label: "Work style not stated" },
];

const WORK_STYLE_LABELS: Record<string, string> = {
  remote: "Remote",
  hybrid: "Hybrid",
  onsite: "On-site",
  flexible_mixed: "Flexible",
  unknown: "Work style unstated",
};

const SENIORITY_LABELS: Record<string, string> = {
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  staff_principal: "Staff / Principal",
  management: "Management",
  unknown: "Seniority not stated",
};

function firstValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function parseWorkStyle(value: string): PublicWorkStyle | undefined {
  return WORK_STYLES.some((style) => style.value === value)
    ? (value as PublicWorkStyle)
    : undefined;
}

function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(new Date(value));
}

function workStyleLabel(style: PublicWorkStyle): string {
  return WORK_STYLES.find((entry) => entry.value === style)?.label ?? style;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters: ActiveJobFilters = {
    query: firstValue(params.q),
    roleFamily: firstValue(params.role_family),
    workStyle: parseWorkStyle(firstValue(params.work_style)),
  };

  let data: Awaited<ReturnType<typeof listActiveJobs>> | null = null;
  let error: string | null = null;

  try {
    data = await listActiveJobs(getPool(), filters);
  } catch (caught) {
    error =
      caught instanceof DatabaseNotConfiguredError
        ? "The jobs registry is not configured for this deployment."
        : "The jobs registry could not be loaded. Please try again shortly.";
  }

  const activeFilters = Boolean(
    filters.query?.trim() || filters.roleFamily || filters.workStyle,
  );

  const session = await auth();
  const userEmail = session?.user?.email ?? null;

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      {/* 1. Global Brand Header */}
      <GlobalNavbar
        currentPage="jobs"
        userEmail={userEmail}
        subtitle="National Live Jobs Registry"
      />

      {/* 2. Breadcrumb & Status Bar */}
      <div className="flex items-center justify-between text-xs text-slate-500 font-medium -mt-1">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1 font-semibold text-terracotta-700 hover:text-terracotta-800 hover:underline"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to map directory
          </Link>
          <span className="text-slate-300">•</span>
          <span>Jobs</span>
          <span className="text-slate-300">•</span>
          <span className="font-bold text-navy-900">
            {data?.total ?? 0} Live Positions
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-400 hidden sm:inline">
          Monitored official ATS feeds
        </span>
      </div>

      {/* 3. Hero Header & Filter Form */}
      <section className="relative overflow-hidden rounded-2xl border border-surface-border bg-white p-6 sm:p-8 shadow-2xs">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 opacity-[0.05] mix-blend-multiply bg-center bg-cover [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_95%)]"
          style={{ backgroundImage: "url('/brand/hero_cartography.jpg')" }}
        />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-600 animate-pulse" />
                <span className="font-mono text-xs font-bold text-emerald-800 tracking-wider uppercase">
                  Active Hiring Index
                </span>
              </div>
              <h1 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-navy-900">
                Live Australian Technology Roles
              </h1>
              <p className="mt-2 max-w-2xl text-xs sm:text-sm text-slate-600 leading-relaxed">
                Direct vacancies substantiated from official careers pages of
                verified tech employers and subclass 482 visa sponsors nationwide.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200/90 bg-slate-50 p-3.5 text-right shrink-0">
              <span className="font-mono text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                Active Openings
              </span>
              <span className="font-heading text-2xl font-black text-navy-900 tabular-nums">
                {data?.total ?? "—"}
              </span>
              <span className="block text-[11px] font-medium text-slate-500 mt-0.5">
                roles currently indexed
              </span>
            </div>
          </div>

          {/* Search & Filter Form */}
          <form className="grid gap-3 rounded-xl border border-slate-200/90 bg-slate-50/70 p-3 sm:p-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <div>
              <label className="block text-xs font-bold text-navy-900 mb-1.5">
                Search role or employer
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  name="q"
                  defaultValue={filters.query}
                  maxLength={120}
                  placeholder="e.g. Platform Engineer, Canva, Sydney"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 pl-9 text-xs font-medium text-navy-900 placeholder:text-slate-400 focus:border-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/15"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-navy-900 mb-1.5">
                Role family
              </label>
              <select
                name="role_family"
                defaultValue={filters.roleFamily}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-navy-900 focus:border-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/15 cursor-pointer"
              >
                <option value="">All role families</option>
                {data?.roleFamilies.map((family) => (
                  <option key={family.key} value={family.key}>
                    {family.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-navy-900 mb-1.5">
                Work style
              </label>
              <select
                name="work_style"
                defaultValue={filters.workStyle}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-navy-900 focus:border-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/15 cursor-pointer"
              >
                <option value="">Any work style</option>
                {WORK_STYLES.map((style) => (
                  <option key={style.value} value={style.value}>
                    {style.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-1 lg:pt-0">
              <button
                type="submit"
                className="flex-1 lg:flex-none inline-flex items-center justify-center rounded-xl bg-navy-900 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition-colors"
              >
                Apply Filters
              </button>
              {activeFilters && (
                <Link
                  href="/jobs"
                  className="rounded-xl border border-surface-border bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Clear
                </Link>
              )}
            </div>
          </form>

          {/* Quick Role Family Chips */}
          {data && data.roleFamilies.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 pt-3 border-t border-slate-200/80">
              <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                Discipline:
              </span>
              <Link
                href="/jobs"
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                  !filters.roleFamily
                    ? "bg-navy-900 text-white shadow-2xs font-bold"
                    : "bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50"
                }`}
              >
                All roles
              </Link>
              {data.roleFamilies.slice(0, 8).map((rf) => (
                <Link
                  key={rf.key}
                  href={`/jobs?role_family=${encodeURIComponent(rf.key)}${filters.query ? `&q=${encodeURIComponent(filters.query)}` : ""}${filters.workStyle ? `&work_style=${encodeURIComponent(filters.workStyle)}` : ""}`}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                    filters.roleFamily === rf.key
                      ? "bg-navy-900 text-white shadow-2xs font-bold"
                      : "bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  {rf.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-900">
          {error}
        </div>
      )}

      {data?.truncated && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Showing the first 100 of {data.total} matching roles. Refine your
          filters to view specific sectors or locations.
        </div>
      )}

      {/* Results Count & Filter Summary */}
      {data && (
        <div className="flex items-center justify-between text-xs text-slate-600 font-medium px-1">
          <div className="flex items-center gap-2">
            <span>
              Showing <strong className="text-navy-900 font-bold">{data.jobs.length}</strong> of{" "}
              <strong className="text-navy-900 font-bold">{data.total}</strong> active verified roles
            </span>
            {activeFilters && (
              <span className="rounded-full bg-terracotta-50 border border-terracotta-200 px-2 py-0.5 text-[10px] font-bold text-terracotta-800">
                Filtered view
              </span>
            )}
          </div>
          {activeFilters && (
            <Link
              href="/jobs"
              className="text-terracotta-700 hover:text-terracotta-800 hover:underline font-semibold"
            >
              Reset all filters
            </Link>
          )}
        </div>
      )}

      {/* 4. Live Roles Cards Listing */}
      {data && data.jobs.length > 0 ? (
        <div className="space-y-3">
          {data.jobs.map((job) => {
            const postedLabel = formatDate(job.postedAt);
            return (
              <div
                key={job.id}
                className="group rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-5"
              >
                <div className="flex items-start gap-4 min-w-0">
                  <CompanyBrandMark
                    slug={job.companySlug}
                    name={job.companyName}
                    size="md"
                    className="shrink-0 mt-0.5"
                  />
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                      <Link
                        href={`/companies/${job.companySlug}`}
                        className="font-bold text-navy-900 hover:text-terracotta-700 hover:underline transition-colors"
                      >
                        {job.companyName}
                      </Link>
                      {job.locationText && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-slate-400" />
                            {job.locationText}
                          </span>
                        </>
                      )}
                    </div>

                    <h2 className="font-heading text-base sm:text-lg font-bold text-navy-900 truncate group-hover:text-terracotta-700 transition-colors">
                      <a
                        href={job.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {job.title}
                      </a>
                    </h2>

                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {job.roleFamily && (
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                          {job.roleFamily}
                        </span>
                      )}
                      {SENIORITY_LABELS[job.seniority] && (
                        <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-medium text-slate-600">
                          {SENIORITY_LABELS[job.seniority]}
                        </span>
                      )}
                      {WORK_STYLE_LABELS[job.workStyle] && (
                        <span className="rounded bg-sky-50 text-sky-700 border border-sky-200/70 px-2 py-0.5 font-mono text-[10px] font-semibold">
                          {WORK_STYLE_LABELS[job.workStyle]}
                        </span>
                      )}
                      <span className="font-mono text-[11px] text-slate-400 ml-1">
                        {postedLabel
                          ? `Posted ${postedLabel}`
                          : `Observed ${formatDate(job.firstSeenAt)}`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end md:self-center">
                  <a
                    href={job.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl bg-terracotta-700 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-terracotta-800 active:scale-95 transition-all"
                  >
                    <span>Apply on careers page</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      ) : data && !error ? (
        <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-center shadow-2xs">
          <Briefcase className="mx-auto h-9 w-9 text-slate-400" />
          <h2 className="mt-3 font-heading text-lg font-bold text-navy-900">
            No live roles match this view
          </h2>
          <p className="mt-1.5 text-xs text-slate-500 max-w-sm mx-auto">
            Try adjusting your search terms, role family, or work style filters
            to explore more vacancies.
          </p>
          {activeFilters && (
            <Link
              href="/jobs"
              className="mt-4 inline-flex items-center gap-1 rounded-xl bg-navy-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition-colors"
            >
              Reset all filters
            </Link>
          )}
        </section>
      ) : null}
    </main>
  );
}
