/* Hallmark · macrostructure: long-document · theme: National Registry · system: DESIGN.md */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";

import type { MapCompanyPoint } from "@austechmap/contracts";

import { CareersLink } from "./CareersLink";
import { MapCanvas, type Bbox } from "../../../components/map/MapCanvas";
import { trackEvent } from "../../../lib/analytics";
import { DatabaseNotConfiguredError, getPool } from "../../../lib/db";

export const dynamic = "force-dynamic";

interface LocationEntry {
  locationType: "head_office" | "branch" | "remote_only";
  lat: number;
  lng: number;
  inputText: string;
}

interface CategoryEntry {
  key: string;
  label: string;
}

interface ResearchClaim {
  city?: string;
  reason?: string;
  confidence_tier?: string;
  confidence_note?: string | null;
}

type SponsorshipClaimType =
  | "sponsorship_current_explicit"
  | "sponsorship_historical_explicit"
  | "sponsorship_labour_agreement";

interface SponsorshipEvidenceEntry {
  claimType: SponsorshipClaimType;
  claimValue: Record<string, unknown>;
  observedAt: string;
}

interface OpenJobEntry {
  title: string;
  roleFamily: string | null;
  seniority: string;
  remoteType: string;
  sourceUrl: string | null;
  postedAt: string | null;
}

interface CompanyProfileRow {
  id: string;
  slug: string;
  display_name: string;
  domain: string | null;
  careers_url: string | null;
  status: string;
  disabled_reason: string | null;
  verified_at: string | null;
  created_at: string;
  merged_into_slug: string | null;
  locations: LocationEntry[];
  categories: CategoryEntry[];
  research_claim: ResearchClaim | null;
  research_confidence: string | null;
  research_observed_at: string | null;
  research_source_name: string | null;
  sponsorship_evidence: SponsorshipEvidenceEntry[];
  open_jobs: OpenJobEntry[];
}

const SENIORITY_LABELS: Record<string, string> = {
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  staff_principal: "Staff / Principal",
  management: "Management",
};

const REMOTE_TYPE_LABELS: Record<string, string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
  flexible_mixed: "Flexible",
};

const SPONSORSHIP_CLAIM_LABELS: Record<SponsorshipClaimType, string> = {
  sponsorship_current_explicit: "Current explicit evidence",
  sponsorship_labour_agreement: "Current labour agreement",
  sponsorship_historical_explicit: "Historical explicit evidence",
};

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending review",
  active: "Active",
  disabled: "Disabled",
  merged: "Merged",
};

function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M10 1.944A11.954 11.954 0 012.166 5C2.056 5.649 2 6.319 2 7c0 5.225 3.34 9.67 8 11.317C14.66 16.67 18 12.225 18 7c0-.682-.057-1.35-.166-2.001A11.954 11.954 0 0110 1.944zm3.707 6.763a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
        clipRule="evenodd"
      />
    </svg>
  );
}

async function loadCompany(slug: string): Promise<CompanyProfileRow | null> {
  const { rows } = await getPool().query<CompanyProfileRow>(
    `SELECT
       c.id, c.slug, c.display_name, c.domain, c.careers_url, c.status,
       c.disabled_reason, c.verified_at, c.created_at,
       m.slug AS merged_into_slug,
       COALESCE(loc.locations, '[]'::json) AS locations,
       COALESCE(cat.categories, '[]'::json) AS categories,
       research.claim_value AS research_claim,
       research.confidence AS research_confidence,
       research.observed_at AS research_observed_at,
       research.source_name AS research_source_name,
       COALESCE(sponsorship.items, '[]'::json) AS sponsorship_evidence,
       COALESCE(jobs_data.items, '[]'::json) AS open_jobs
     FROM companies c
     LEFT JOIN companies m ON m.id = c.merged_into_company_id
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object(
                'locationType', cl.location_type,
                'lat', ST_Y(rl.point), 'lng', ST_X(rl.point),
                'inputText', rl.input_text
              )) AS locations
       FROM company_locations cl
       JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
       WHERE cl.company_id = c.id AND rl.status = 'accepted' AND rl.point IS NOT NULL
     ) loc ON true
     LEFT JOIN LATERAL (
       SELECT json_agg(json_build_object('key', cg.key, 'label', cg.label)) AS categories
       FROM company_category_links ccl JOIN categories cg ON cg.id = ccl.category_id
       WHERE ccl.company_id = c.id
     ) cat ON true
     LEFT JOIN LATERAL (
       SELECT e.claim_value, e.confidence, e.observed_at, ds.name AS source_name
       FROM evidence e JOIN data_sources ds ON ds.id = e.source_id
       WHERE e.entity_type = 'company' AND e.entity_id = c.id::text
         AND e.claim_type = 'employer_seed_research'
       ORDER BY e.observed_at DESC LIMIT 1
     ) research ON true
     LEFT JOIN LATERAL (
       SELECT json_agg(
                json_build_object(
                  'claimType', e.claim_type,
                  'claimValue', e.claim_value,
                  'observedAt', e.observed_at
                ) ORDER BY e.observed_at DESC
              ) AS items
       FROM evidence e
       WHERE e.entity_type = 'company' AND e.entity_id = c.id::text
         AND e.claim_type IN (
               'sponsorship_current_explicit',
               'sponsorship_historical_explicit',
               'sponsorship_labour_agreement'
             )
     ) sponsorship ON true
     -- No LIMIT here: the largest current employer has 44 real open roles,
     -- trivial to render on one page at today's data scale. Revisit with a
     -- cap once ATS coverage grows enough for a company's list to actually
     -- get unwieldy -- don't add one preemptively against data that doesn't
     -- exist yet.
     LEFT JOIN LATERAL (
       SELECT json_agg(
                json_build_object(
                  'title', j.title,
                  'roleFamily', rf.label,
                  'seniority', j.seniority,
                  'remoteType', j.remote_type,
                  'sourceUrl', j.source_url,
                  'postedAt', j.posted_at
                ) ORDER BY j.posted_at DESC NULLS LAST, j.first_seen_at DESC
              ) AS items
       FROM jobs j
       LEFT JOIN role_families rf ON rf.id = j.role_family_id
       WHERE j.company_id = c.id AND j.expired_at IS NULL
     ) jobs_data ON true
     WHERE c.slug = $1`,
    [slug],
  );
  return rows[0] ?? null;
}

function locationsToBbox(locations: LocationEntry[]): Bbox {
  if (locations.length === 0) {
    return { west: 96, south: -45, east: 168, north: -9 };
  }
  const padding = 0.05;
  const lats = locations.map((location) => location.lat);
  const lngs = locations.map((location) => location.lng);
  return {
    west: Math.min(...lngs) - padding,
    south: Math.min(...lats) - padding,
    east: Math.max(...lngs) + padding,
    north: Math.max(...lats) + padding,
  };
}

function locationsToPoints(company: CompanyProfileRow): MapCompanyPoint[] {
  return company.locations.map((location) => ({
    slug: company.slug,
    name: company.display_name,
    lat: location.lat,
    lng: location.lng,
    locationType: location.locationType,
    careersUrl: company.careers_url,
    city: null,
    primaryCategory: null,
    hasSponsorshipEvidence: false,
  }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  let company: CompanyProfileRow | null = null;
  try {
    company = await loadCompany(slug);
  } catch {
    return { title: "Australia Tech Map" };
  }
  if (!company) return { title: "Australia Tech Map" };

  const description = company.research_claim?.reason
    ? company.research_claim.reason.slice(0, 150)
    : `${company.display_name} on Australia Tech Map.`;

  return {
    title: company.display_name,
    description,
    alternates: { canonical: `/companies/${company.slug}` },
    robots: company.status === "disabled" ? { index: false } : undefined,
  };
}

export default async function CompanyProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  let company: CompanyProfileRow | null;
  try {
    company = await loadCompany(slug);
  } catch (caught) {
    const message =
      caught instanceof DatabaseNotConfiguredError
        ? "DATABASE_URL is not configured for this deployment."
        : `Could not load this company: ${String(caught)}`;
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8 sm:px-10 sm:py-12">
        <p className="rounded-xl border border-red-600/40 bg-red-50 p-4 text-sm text-red-900">
          {message}
        </p>
      </main>
    );
  }

  if (!company) notFound();

  if (company.status === "merged" && company.merged_into_slug) {
    permanentRedirect(`/companies/${company.merged_into_slug}`);
  }

  trackEvent("company_profile_viewed", { slug: company.slug });

  const lastCheckedLabel = company.research_observed_at
    ? "Last checked"
    : "Added";
  const lastCheckedDate = company.research_observed_at ?? company.created_at;
  const confidenceScore = company.research_confidence
    ? Number(company.research_confidence)
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-8 sm:px-10 sm:py-12">
      <header className="flex flex-col gap-4 border-b border-surface-border pb-6">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-ochre-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 focus-visible:ring-offset-2"
          >
            ← Back to directory
          </Link>
          <span className="font-mono text-xs text-slate-500 tabular-nums">
            {lastCheckedLabel.toUpperCase()}:{" "}
            {new Date(lastCheckedDate).toLocaleDateString("en-AU")}
          </span>
        </div>
        <h1 className="font-heading text-3xl font-bold tracking-tight text-navy-900 sm:text-4xl text-balance">
          {company.display_name}
        </h1>
        <dl className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-xs text-slate-600 tabular-nums">
          <div className="flex items-center gap-1.5">
            <dt className="text-slate-400">STATUS</dt>
            <dd className="font-medium text-navy-900">
              {STATUS_LABELS[company.status] ?? company.status}
            </dd>
          </div>
          {company.domain && (
            <div className="flex items-center gap-1.5">
              <dt className="text-slate-400">DOMAIN</dt>
              <dd className="font-medium text-navy-900">{company.domain}</dd>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <dt className="text-slate-400">REGISTERED</dt>
            <dd className="font-medium text-navy-900">
              {new Date(company.created_at).toLocaleDateString("en-AU")}
            </dd>
          </div>
          {company.verified_at && (
            <div className="flex items-center gap-1.5">
              <dt className="text-slate-400">VERIFIED</dt>
              <dd className="font-medium text-navy-900">
                {new Date(company.verified_at).toLocaleDateString("en-AU")}
              </dd>
            </div>
          )}
        </dl>
      </header>

      {company.status === "disabled" && (
        <p className="rounded-lg border border-red-600/40 bg-red-50 p-4 text-sm text-red-900">
          This employer record has been disabled: {company.disabled_reason}
        </p>
      )}

      <section className="flex flex-wrap items-center gap-3">
        {company.categories.map((category) => (
          <span
            key={category.key}
            className="rounded bg-slate-100 px-2.5 py-1 font-mono text-xs text-slate-700"
          >
            {category.label}
          </span>
        ))}
        {company.careers_url && (
          <CareersLink slug={company.slug} careersUrl={company.careers_url} />
        )}
      </section>

      {company.research_claim?.reason && (
        <section className="rounded-lg border border-surface-border bg-slate-50 p-4 text-sm text-navy-900">
          <p>
            According to our research
            {confidenceScore !== null &&
              ` (confidence: ${company.research_claim.confidence_tier ?? "unknown"})`}
            , {company.research_claim.reason}
          </p>
          {company.research_claim.confidence_note && (
            <p className="mt-2 text-xs text-slate-600">
              {company.research_claim.confidence_note}
            </p>
          )}
          {company.research_source_name && (
            <p className="mt-2 text-xs text-slate-600">
              Source: {company.research_source_name}
            </p>
          )}
        </section>
      )}

      {company.locations.length > 0 && (
        <section>
          <h2 className="mb-4 font-heading text-lg font-semibold text-navy-900">
            Locations
          </h2>
          <div className="h-72 overflow-hidden rounded-xl border border-surface-border">
            <MapCanvas
              points={locationsToPoints(company)}
              initialBbox={locationsToBbox(company.locations)}
              interactive={false}
            />
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 font-heading text-lg font-semibold text-navy-900">
          Sponsorship evidence
        </h2>
        {company.sponsorship_evidence.length === 0 ? (
          <p className="rounded-lg border border-surface-border bg-slate-50 p-4 text-sm text-slate-600">
            No evidence found. This is not proof the employer does not sponsor.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {company.sponsorship_evidence.map((entry, index) => (
              <li
                key={`${entry.claimType}-${entry.observedAt}-${index}`}
                className="rounded-lg border border-forest-600/25 bg-forest-50 p-4 text-sm"
              >
                <div className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2 font-semibold text-forest-900">
                    <ShieldCheckIcon className="h-4 w-4 shrink-0 text-forest-700" />
                    {SPONSORSHIP_CLAIM_LABELS[entry.claimType] ??
                      entry.claimType}
                  </span>
                  <span className="font-mono text-xs text-slate-600">
                    {new Date(entry.observedAt).toLocaleDateString("en-AU")}
                  </span>
                </div>
                {entry.claimType === "sponsorship_labour_agreement" ? (
                  <p className="mt-2 text-xs text-forest-900/80">
                    {[
                      entry.claimValue.agreement_type,
                      entry.claimValue.start_date
                        ? `from ${String(entry.claimValue.start_date)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}{" "}
                    · Source:{" "}
                    <span className="font-medium">
                      Department of Home Affairs
                    </span>
                    , current labour agreements list
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-forest-900/80">
                    {String(entry.claimValue.job_title ?? "")}
                    {typeof entry.claimValue.source_url === "string" && (
                      <>
                        {" · "}
                        <a
                          href={entry.claimValue.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          View source
                        </a>
                      </>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-600">
          Important: evidence does not guarantee sponsorship for a specific role
          or applicant. Always confirm with the employer and official Home
          Affairs guidance.
        </p>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold text-navy-900">
            Open roles
            {company.open_jobs.length > 0
              ? ` (${company.open_jobs.length})`
              : ""}
          </h2>
          {company.careers_url && (
            <a
              href={company.careers_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-ochre-700 hover:underline"
            >
              Careers page ↗
            </a>
          )}
        </div>

        {company.open_jobs.length === 0 ? (
          <p className="rounded-lg border border-surface-border p-4 text-sm text-slate-600">
            No open roles currently indexed for this employer.
            {company.careers_url && (
              <>
                {" "}
                Check their{" "}
                <a
                  href={company.careers_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-ochre-700 underline hover:text-ochre-800"
                >
                  careers page
                </a>{" "}
                directly for current openings.
              </>
            )}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {company.open_jobs.map((job, index) => (
              <li
                key={`${job.title}-${job.postedAt ?? index}-${index}`}
                className="flex flex-col gap-2 rounded-lg border border-surface-border bg-white p-4 shadow-2xs transition-colors duration-150 motion-reduce:transition-none hover:border-ochre-600/40"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  {job.sourceUrl ? (
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-center gap-1.5 rounded text-sm font-semibold text-navy-900 hover:text-ochre-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ochre-600 focus-visible:ring-offset-2"
                    >
                      <span className="group-hover:underline">{job.title}</span>
                      <span
                        aria-hidden="true"
                        className="text-xs text-slate-400 group-hover:text-ochre-700"
                      >
                        ↗
                      </span>
                    </a>
                  ) : (
                    <span className="text-sm font-semibold text-navy-900">
                      {job.title}
                    </span>
                  )}
                  {job.postedAt && (
                    <span className="font-mono text-xs text-slate-500 tabular-nums">
                      {new Date(job.postedAt).toLocaleDateString("en-AU")}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {job.roleFamily && (
                    <span className="rounded bg-slate-100 px-2.5 py-0.5 font-mono text-[11px] text-slate-700">
                      {job.roleFamily}
                    </span>
                  )}
                  {SENIORITY_LABELS[job.seniority] && (
                    <span className="rounded bg-slate-100 px-2.5 py-0.5 font-mono text-[11px] text-slate-700">
                      {SENIORITY_LABELS[job.seniority]}
                    </span>
                  )}
                  {REMOTE_TYPE_LABELS[job.remoteType] && (
                    <span className="rounded bg-ochre-50 px-2.5 py-0.5 font-mono text-[11px] font-medium text-ochre-800">
                      {REMOTE_TYPE_LABELS[job.remoteType]}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
