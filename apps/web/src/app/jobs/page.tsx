/* Hallmark · macrostructure: Index-First · theme: National Registry · system: DESIGN.md
 * pre-emit critique: P5 H4 E5 S5 R5 V4
 */
import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  MapPin,
  Search,
} from "lucide-react";

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

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-5 py-6 sm:px-8 sm:py-10 lg:px-10">
      <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-border pb-4">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center whitespace-nowrap text-sm font-semibold text-navy-900 hover:text-terracotta-700 active:text-terracotta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Directory
        </Link>
        <Link
          href="/opportunities"
          className="inline-flex min-h-11 items-center whitespace-nowrap text-sm font-semibold text-slate-700 hover:text-navy-900 active:text-terracotta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 focus-visible:ring-offset-2"
        >
          Opportunity Match <ArrowUpRight className="ml-1.5 h-4 w-4" />
        </Link>
      </nav>

      <header className="grid gap-5 border-b border-surface-border py-9 sm:py-12 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold tracking-[0.12em] text-slate-500">
            VERIFIED HIRING REGISTRY
          </p>
          <h1 className="mt-3 min-w-0 wrap-anywhere font-heading text-4xl font-bold leading-tight tracking-tight text-navy-900 sm:text-5xl">
            Live technology roles
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Roles are linked to the employer&apos;s official application page.
            Listings remain visible only while their monitored source reports
            them as open.
          </p>
        </div>
        <div className="border-l-2 border-terracotta-700 pl-4 text-sm leading-6 text-slate-600">
          <span className="block font-mono text-xs font-semibold tracking-[0.12em] text-slate-500">
            CURRENT RESULTS
          </span>
          <span className="mt-1 block font-heading text-3xl font-bold tabular-nums text-navy-900">
            {data?.total ?? "—"}
          </span>
          <span>open roles matching this view</span>
        </div>
      </header>

      <section className="py-7" aria-labelledby="filter-heading">
        <h2 id="filter-heading" className="sr-only">
          Filter live roles
        </h2>
        <form className="grid gap-3 rounded-lg border border-surface-border bg-surface p-4 shadow-2xs lg:grid-cols-[minmax(0,1fr)_15rem_12rem_auto] lg:items-end">
          <label className="grid gap-1.5 text-sm font-semibold text-navy-900">
            Search role or employer
            <span className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                name="q"
                defaultValue={filters.query}
                maxLength={120}
                placeholder="e.g. platform engineer"
                className="min-h-11 w-full rounded border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm font-normal text-navy-900 placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pacific-700 focus-visible:ring-offset-2"
              />
            </span>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-navy-900">
            Role family
            <select
              name="role_family"
              defaultValue={filters.roleFamily}
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm font-normal text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pacific-700 focus-visible:ring-offset-2"
            >
              <option value="">All role families</option>
              {data?.roleFamilies.map((family) => (
                <option key={family.key} value={family.key}>
                  {family.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-navy-900">
            Work style
            <select
              name="work_style"
              defaultValue={filters.workStyle}
              className="min-h-11 rounded border border-slate-300 bg-white px-3 text-sm font-normal text-navy-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pacific-700 focus-visible:ring-offset-2"
            >
              <option value="">Any work style</option>
              {WORK_STYLES.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex min-h-11 items-end gap-3">
            <button
              type="submit"
              className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded bg-terracotta-700 px-4 text-sm font-semibold text-white hover:bg-terracotta-800 active:bg-terracotta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 focus-visible:ring-offset-2"
            >
              Apply filters
            </button>
            {activeFilters ? (
              <Link
                href="/jobs"
                className="inline-flex min-h-11 items-center whitespace-nowrap text-sm font-semibold text-slate-700 underline decoration-slate-300 underline-offset-4 hover:text-navy-900 hover:decoration-terracotta-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 focus-visible:ring-offset-2"
              >
                Clear
              </Link>
            ) : null}
          </div>
        </form>
      </section>

      {error ? (
        <section className="border-l-2 border-terracotta-700 bg-terracotta-50 px-5 py-6 text-sm leading-6 text-terracotta-900">
          {error}
        </section>
      ) : null}

      {data?.truncated ? (
        <p className="mb-4 border-l-2 border-ochre-600 bg-ochre-50 px-4 py-3 text-sm leading-6 text-ochre-900">
          Showing the first 100 of {data.total} matching roles. Refine the
          filters to narrow this registry view.
        </p>
      ) : null}

      {data && data.jobs.length > 0 ? (
        <ol className="divide-y divide-surface-border border-y border-surface-border">
          {data.jobs.map((job) => {
            const postedLabel = formatDate(job.postedAt);
            return (
              <li
                key={job.id}
                className="grid gap-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-slate-600">
                    <Building2 className="h-4 w-4 shrink-0 text-pacific-700" />
                    <Link
                      href={`/companies/${job.companySlug}`}
                      className="font-semibold text-navy-900 hover:text-terracotta-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 focus-visible:ring-offset-2"
                    >
                      {job.companyName}
                    </Link>
                    {job.locationText ? (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <MapPin className="h-3.5 w-3.5" /> {job.locationText}
                      </span>
                    ) : null}
                  </div>
                  <h2 className="mt-2 wrap-anywhere font-heading text-xl font-bold tracking-tight text-navy-900">
                    {job.title}
                  </h2>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                    {job.roleFamily ? (
                      <span className="rounded border border-pacific-100 bg-pacific-50 px-2 py-1 text-pacific-900">
                        {job.roleFamily}
                      </span>
                    ) : null}
                    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                      {SENIORITY_LABELS[job.seniority] ?? job.seniority}
                    </span>
                    <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
                      {workStyleLabel(job.workStyle)}
                    </span>
                    <span className="font-mono text-[11px] leading-7 text-slate-500">
                      {postedLabel
                        ? `Posted ${postedLabel}`
                        : `Observed ${formatDate(job.firstSeenAt)}`}
                    </span>
                  </div>
                </div>
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Apply for ${job.title} at ${job.companyName} on the employer site`}
                  className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded border border-navy-800 px-4 text-sm font-semibold text-navy-900 hover:border-terracotta-700 hover:text-terracotta-700 active:border-terracotta-900 active:text-terracotta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 focus-visible:ring-offset-2"
                >
                  Apply on employer site{" "}
                  <ArrowUpRight className="ml-2 h-4 w-4" />
                </a>
              </li>
            );
          })}
        </ol>
      ) : data && !error ? (
        <section className="grid min-h-64 place-items-center border border-dashed border-surface-border bg-surface px-6 py-12 text-center">
          <div className="max-w-md">
            <BriefcaseBusiness className="mx-auto h-7 w-7 text-slate-500" />
            <h2 className="mt-3 font-heading text-xl font-bold text-navy-900">
              No live roles match this view
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Try a broader role, employer name, or work-style filter. We only
              list roles still reported as open by their monitored source.
            </p>
            {activeFilters ? (
              <Link
                href="/jobs"
                className="mt-4 inline-flex min-h-11 items-center whitespace-nowrap text-sm font-semibold text-terracotta-700 underline decoration-terracotta-300 underline-offset-4 hover:text-terracotta-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 focus-visible:ring-offset-2"
              >
                Reset filters
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}
    </main>
  );
}
