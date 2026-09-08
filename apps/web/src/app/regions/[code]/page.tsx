import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  MapPinned,
  ShieldCheck,
} from "lucide-react";

import type { RegionOpportunityResponse } from "@austechmap/contracts";

import styles from "./page.module.css";
import { DatabaseNotConfiguredError, getPool } from "../../../lib/db";
import { getRegionOpportunity } from "../../../lib/queries/getRegionOpportunity";

export const dynamic = "force-dynamic";

type Opportunity = Omit<RegionOpportunityResponse, "version">;

const SUPPRESSION_LABELS: Record<string, string> = {
  insufficient_employer_depth: "Fewer than five mapped employers",
  insufficient_monitored_coverage:
    "Less than 60% of mapped employers are monitored",
  insufficient_active_jobs: "Fewer than three location-confirmed active jobs",
  insufficient_hiring_history: "Less than 14 days of hiring history",
  insufficient_observation_cadence:
    "Fewer than three distinct observation dates",
  missing_nero: "JSA NERO signal not imported",
  missing_ivi: "JSA IVI signal not imported",
  score_not_generated: "The regional score has not been generated",
};

const MIGRATION_LABELS = {
  category_2: "Designated regional — Category 2",
  category_3: "Designated regional — Category 3",
  dama: "DAMA-covered postcode",
} as const;

const SCORE_COMPONENT_LABELS: Record<string, string> = {
  relevant_employer_depth: "Relevant employer depth",
  current_relevant_vacancies: "Current relevant vacancies",
  hiring_momentum: "Hiring momentum",
  jsa_employment_vacancy_direction: "JSA employment and vacancy direction",
  employer_industry_diversity: "Employer and industry diversity",
  remote_hybrid_opportunity: "Remote and hybrid opportunity",
  graduate_early_career_opportunity: "Graduate and early-career opportunity",
  sponsorship_evidence_density: "Sponsorship evidence density",
  regional_migration_context: "Regional migration context",
};

async function loadRegion(code: string): Promise<Opportunity | null> {
  return getRegionOpportunity(getPool(), code);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  try {
    const opportunity = await loadRegion(code);
    if (!opportunity) return { title: "Region not found" };
    return {
      title: `${opportunity.region.name} tech opportunities`,
      description: `Evidence-backed technology employers, active roles, labour signals and migration context for ${opportunity.region.name}.`,
      alternates: { canonical: `/regions/${opportunity.region.code}` },
    };
  } catch {
    return { title: "Australia Tech Map" };
  }
}

function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="border-t border-surface-border py-5 text-sm leading-6 text-slate-600">
      {children}
    </p>
  );
}

export default async function RegionPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  let opportunity: Opportunity | null;
  try {
    opportunity = await loadRegion(code);
  } catch (caught) {
    const message =
      caught instanceof DatabaseNotConfiguredError
        ? "DATABASE_URL is not configured for this deployment."
        : "This regional record could not be loaded.";
    return (
      <main className="mx-auto min-h-screen max-w-3xl px-5 py-8 sm:px-8 sm:py-12">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center whitespace-nowrap text-sm font-semibold text-terracotta-700 active:text-terracotta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to directory
        </Link>
        <p className="mt-8 border border-red-600/40 bg-red-50 p-4 text-sm text-red-900">
          {message}
        </p>
      </main>
    );
  }

  if (!opportunity) notFound();

  const {
    region,
    summary,
    migrationContext,
    employers,
    jobs,
    laborSignals,
    score,
  } = opportunity;

  return (
    <main
      className={`${styles.page} mx-auto min-h-screen max-w-6xl px-5 py-6 sm:px-8 sm:py-10 lg:px-10`}
    >
      <nav className="flex items-center justify-between gap-4 border-b border-surface-border pb-4">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center whitespace-nowrap text-sm font-semibold text-navy-900 hover:text-terracotta-700 active:text-terracotta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 focus-visible:ring-offset-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Directory
        </Link>
        <a
          href={`/api/regions/${region.code}/opportunity`}
          className="inline-flex min-h-11 items-center whitespace-nowrap text-sm font-semibold text-terracotta-700 underline decoration-slate-300 underline-offset-4 hover:decoration-terracotta-700 active:text-terracotta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 focus-visible:ring-offset-2"
        >
          API record <ArrowUpRight className="ml-1.5 h-4 w-4" />
        </a>
      </nav>

      <header className="grid gap-5 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold tracking-[0.12em] text-slate-500">
            SA4 {region.code}
          </p>
          <h1 className="mt-3 min-w-0 font-heading text-4xl font-bold leading-tight tracking-tight text-navy-900 sm:text-5xl">
            {region.name}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Mapped employers, location-confirmed roles, labour indicators and
            migration context. Counts are evidence, not an estimate of the
            region&apos;s entire technology workforce.
          </p>
        </div>
        <div className="border-t border-surface-border pt-4 font-mono text-xs leading-6 text-slate-600 lg:border-t-0 lg:border-l lg:pl-6">
          <p>GEOGRAPHY: ASGS SA4</p>
          <p>
            SCORE:{" "}
            {score.value === null
              ? "WITHHELD"
              : `${score.value.toFixed(2)} / 100`}
          </p>
          <p>EMPLOYER COVERAGE: OBSERVED</p>
        </div>
      </header>

      <section
        aria-labelledby="overview-heading"
        className="border-y border-surface-border"
      >
        <h2 id="overview-heading" className="sr-only">
          Regional overview
        </h2>
        <dl className="grid sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Mapped employers", summary.employerCount, Building2],
            [
              "Monitored employers",
              summary.monitoredEmployerCount,
              ShieldCheck,
            ],
            [
              "Location-confirmed roles",
              summary.activeJobCount,
              BriefcaseBusiness,
            ],
            ["Observed niches", summary.industryCount, MapPinned],
          ].map(([label, value, Icon], index) => {
            const MetricIcon = Icon as typeof Building2;
            return (
              <div
                key={String(label)}
                className={`flex min-h-32 flex-col justify-between gap-6 py-5 ${
                  index % 2 === 0 ? "sm:pr-6" : "sm:border-l sm:pl-6"
                } ${index > 1 ? "border-t lg:border-t-0" : ""} ${
                  index > 0 ? "lg:border-l lg:pl-6" : ""
                } border-surface-border lg:pr-6`}
              >
                <MetricIcon
                  className="h-4 w-4 text-slate-500"
                  aria-hidden="true"
                />
                <div>
                  <dd className="font-mono text-3xl font-bold tabular-nums text-navy-900">
                    {String(value)}
                  </dd>
                  <dt className="mt-1 text-sm text-slate-600">
                    {String(label)}
                  </dt>
                </div>
              </div>
            );
          })}
        </dl>
      </section>

      <div className="grid gap-x-14 lg:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]">
        <div className="min-w-0">
          <section
            aria-labelledby="employers-heading"
            className="py-12 sm:py-16"
          >
            <h2
              id="employers-heading"
              className="font-heading text-2xl font-bold text-navy-900"
            >
              Employers in this SA4
            </h2>
            {employers.length === 0 ? (
              <EmptyState>
                No mapped employers are linked to this SA4 yet.
              </EmptyState>
            ) : (
              <ul className="mt-6 border-t border-surface-border">
                {employers.map((employer) => (
                  <li
                    key={employer.slug}
                    className="border-b border-surface-border"
                  >
                    <Link
                      href={`/companies/${employer.slug}`}
                      className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 hover:text-terracotta-700 active:text-terracotta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 focus-visible:ring-offset-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-navy-900">
                          {employer.name}
                        </span>
                        <span className="mt-1 block truncate text-sm text-slate-500">
                          {employer.primaryCategory ??
                            "No niche classification"}
                        </span>
                      </span>
                      <span className="whitespace-nowrap font-mono text-xs tabular-nums text-slate-600">
                        {employer.activeJobCount} active
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="jobs-heading" className="pb-12 sm:pb-16">
            <h2
              id="jobs-heading"
              className="font-heading text-2xl font-bold text-navy-900"
            >
              Current opportunities
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Only roles tied to a resolved employer location in this SA4 appear
              here.
            </p>
            {jobs.length === 0 ? (
              <EmptyState>
                No current jobs have a location-confirmed link to this SA4.
                Employer-wide or remote-only roles are not attributed here
                without stronger location evidence.
              </EmptyState>
            ) : (
              <ul className="mt-6 border-t border-surface-border">
                {jobs.map((job) => (
                  <li
                    key={`${job.companySlug}-${job.sourceUrl}`}
                    className="border-b border-surface-border py-4"
                  >
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 max-w-full items-center font-semibold text-navy-900 underline decoration-slate-300 underline-offset-4 hover:text-terracotta-700 hover:decoration-terracotta-700 active:text-terracotta-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-700 focus-visible:ring-offset-2"
                    >
                      <span className="truncate">{job.title}</span>
                      <ArrowUpRight className="ml-1.5 h-4 w-4 shrink-0" />
                    </a>
                    <p className="text-sm text-slate-600">
                      {job.companyName}
                      {job.roleFamily ? ` · ${job.roleFamily}` : ""}
                      {` · ${job.remoteType.replace("_", " ")}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="min-w-0 border-t border-surface-border py-12 lg:border-t-0 lg:border-l lg:pl-10 sm:py-16">
          <section aria-labelledby="score-heading">
            <h2
              id="score-heading"
              className="font-heading text-xl font-bold text-navy-900"
            >
              Tech Opportunity Score
            </h2>
            {score.value === null ? (
              <div className="mt-5 bg-slate-100 p-5">
                <p className="font-mono text-2xl font-bold text-navy-900">
                  WITHHELD
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Publishing a number would imply more coverage than the current
                  evidence supports.
                </p>
                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  {score.sufficiency.reasons.map((reason) => (
                    <li key={reason}>
                      — {SUPPRESSION_LABELS[reason] ?? reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <>
                <div className="mt-5 border-y border-surface-border py-5">
                  <p className="font-mono text-4xl font-bold tabular-nums text-navy-900">
                    {score.value.toFixed(2)}
                    <span className="ml-2 text-base font-normal text-slate-500">
                      / 100
                    </span>
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    Method {score.methodologyVersion} · period ending{" "}
                    {score.periodEnd}
                  </p>
                </div>
                <dl className="border-b border-surface-border">
                  {Object.entries(score.components).map(([key, component]) => (
                    <div
                      key={key}
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-surface-border py-3 text-sm"
                    >
                      <dt className="text-slate-700">
                        {SCORE_COMPONENT_LABELS[key] ??
                          key.replaceAll("_", " ")}
                      </dt>
                      <dd className="whitespace-nowrap font-mono tabular-nums text-slate-600">
                        {component.normalized === null
                          ? "—"
                          : `${Math.round(component.normalized * 100)}%`}{" "}
                        × {Math.round(component.weight * 100)}%
                      </dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </section>

          <section aria-labelledby="migration-heading" className="pt-12">
            <h2
              id="migration-heading"
              className="font-heading text-xl font-bold text-navy-900"
            >
              Migration context
            </h2>
            {migrationContext.categories.length === 0 ? (
              <EmptyState>
                No designated-regional or DAMA postcode context is linked yet.
              </EmptyState>
            ) : (
              <ul className="mt-5 space-y-3 text-sm leading-6 text-slate-700">
                {migrationContext.categories.map((category) => (
                  <li key={category}>{MIGRATION_LABELS[category]}</li>
                ))}
                {migrationContext.damaNames.map((name) => (
                  <li key={name}>DAMA: {name}</li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-xs leading-5 text-slate-500">
              Regional or DAMA status does not guarantee eligibility. Confirm
              occupation, employer and visa requirements with Home Affairs.
            </p>
          </section>

          <section aria-labelledby="labor-heading" className="pt-12">
            <h2
              id="labor-heading"
              className="font-heading text-xl font-bold text-navy-900"
            >
              JSA labour signals
            </h2>
            {laborSignals.length === 0 ? (
              <EmptyState>
                NERO and IVI observations have not been imported for this SA4.
                The score remains suppressed until both are present.
              </EmptyState>
            ) : (
              <dl className="mt-5 border-t border-surface-border">
                {laborSignals.map((signal) => (
                  <div
                    key={`${signal.dataset}-${signal.metricKey}-${signal.periodEnd}`}
                    className="border-b border-surface-border py-4"
                  >
                    <dt className="text-sm font-semibold text-navy-900">
                      {signal.dataset.toUpperCase()} ·{" "}
                      {signal.metricKey.replaceAll("_", " ")}
                    </dt>
                    <dd className="mt-1 font-mono text-sm tabular-nums text-slate-600">
                      {signal.value} {signal.unit} · {signal.periodEnd}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-4 text-xs leading-5 text-slate-500">
              NERO estimates can be volatile for small series and are best read
              by direction and scale. IVI measures online advertisements, not
              every vacancy.
            </p>
          </section>
        </aside>
      </div>

      <footer className="border-t border-surface-border py-6 font-mono text-xs leading-5 text-slate-500">
        <p>
          Australia Tech Map regional record · ASGS SA4 {region.code} · employer
          and job counts come from mapped first-party observations · NERO and
          IVI remain separately versioned · score components are retained for
          reproducibility.
        </p>
      </footer>
    </main>
  );
}
