/* Hallmark · macrostructure: long-document · theme: National Registry · system: DESIGN.md */
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Award,
  Calendar,
  CheckCircle2,
  Download,
  ExternalLink,
  Globe,
  MapPin,
  Share2,
  ShieldCheck,
  User,
  Zap,
} from "lucide-react";

import type { MapCompanyPoint } from "@austechmap/contracts";

import { auth } from "../../../auth";
import { CareersLink } from "./CareersLink";
import { WatchCompanyButton } from "./WatchCompanyButton";
import { ClaimProfileModal } from "./ClaimProfileModal";
import { CompanyBrandMark } from "../../../components/ui/CompanyBrandMark";
import { GlobalNavbar } from "../../../components/ui/GlobalNavbar";
import { getCategoryIconPath } from "../../../lib/category-icons";
import { MapCanvas, type Bbox } from "../../../components/map/MapCanvas";
import { trackEvent } from "../../../lib/analytics";
import { DatabaseNotConfiguredError, getPool } from "../../../lib/db";
import type { EvidenceStatus } from "../../../lib/evidence";
import { isWatchingCompany } from "../../../lib/queries/watchlists";

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
  confidence: number;
  status: Exclude<EvidenceStatus, "rejected" | "needs_review">;
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

interface RoleSignalEntry {
  roleFamily: string;
  activeJobs: number;
  newJobs: number;
  momentum: number | null;
  sufficient: boolean;
}

interface SkillSignalEntry {
  skillName: string;
  evidenceCount: number;
  confidence: number;
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
  role_signals: RoleSignalEntry[];
  skill_signals: SkillSignalEntry[];
  is_claimed?: boolean;
  claimed_at?: string | null;
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

const EVIDENCE_STATUS_LABELS: Record<
  Exclude<EvidenceStatus, "rejected" | "needs_review">,
  string
> = {
  active: "Active evidence",
  stale: "Stale evidence",
  superseded: "Superseded evidence",
};

const STATUS_LABELS: Record<string, string> = {
  pending_review: "Pending review",
  active: "Active",
  disabled: "Disabled",
  merged: "Merged",
};

async function loadCompany(slug: string): Promise<CompanyProfileRow | null> {
  const { rows } = await getPool().query<CompanyProfileRow>(
    `SELECT
       c.id, c.slug, c.display_name, c.domain, c.careers_url, c.status,
       c.disabled_reason, c.verified_at, c.created_at, c.is_claimed, c.claimed_at,
       m.slug AS merged_into_slug,
       COALESCE(loc.locations, '[]'::json) AS locations,
       COALESCE(cat.categories, '[]'::json) AS categories,
       research.claim_value AS research_claim,
       research.confidence AS research_confidence,
       research.observed_at AS research_observed_at,
       research.source_name AS research_source_name,
       COALESCE(sponsorship.items, '[]'::json) AS sponsorship_evidence,
       COALESCE(jobs_data.items, '[]'::json) AS open_jobs,
       COALESCE(role_signals_data.items, '[]'::json) AS role_signals,
       COALESCE(skill_signals_data.items, '[]'::json) AS skill_signals
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
         AND e.status = 'active'
       ORDER BY e.observed_at DESC LIMIT 1
     ) research ON true
     LEFT JOIN LATERAL (
       SELECT json_agg(
                json_build_object(
                  'claimType', e.claim_type,
                  'claimValue', e.claim_value,
                  'confidence', e.confidence,
                  'status', e.status,
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
         AND e.status IN ('active', 'stale', 'superseded')
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
     LEFT JOIN LATERAL (
       SELECT json_agg(
                json_build_object(
                  'roleFamily', rf.label,
                  'activeJobs', ers.active_jobs,
                  'newJobs', ers.new_jobs,
                  'momentum', ers.momentum,
                  'sufficient', ers.sufficient
                ) ORDER BY ers.active_jobs DESC
              ) AS items
       FROM employer_role_signals ers
       JOIN role_families rf ON rf.id = ers.role_family_id
       WHERE ers.company_id = c.id
     ) role_signals_data ON true
     LEFT JOIN LATERAL (
       SELECT json_agg(
                json_build_object(
                  'skillName', s.label,
                  'evidenceCount', ess.evidence_count,
                  'confidence', ess.confidence
                ) ORDER BY ess.evidence_count DESC
              ) AS items
       FROM employer_skill_signals ess
       JOIN skills s ON s.id = ess.skill_id
       WHERE ess.company_id = c.id
     ) skill_signals_data ON true
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
    isRegional: false,
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

  const ogImageUrl = `/api/og/company/${company.slug}`;

  return {
    title: company.display_name,
    description,
    alternates: { canonical: `/companies/${company.slug}` },
    robots: company.status === "disabled" ? { index: false } : undefined,
    openGraph: {
      title: `${company.display_name} — Australian Tech Intelligence`,
      description,
      url: `/companies/${company.slug}`,
      siteName: "Australia Tech Map",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: company.display_name,
        },
      ],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${company.display_name} — Australian Tech Intelligence`,
      description,
      images: [ogImageUrl],
    },
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

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;
  const userEmail = session?.user?.email ?? null;
  const isWatching = userId
    ? await isWatchingCompany(getPool(), userId, company.id)
    : false;

  const hasSponsorship = company.sponsorship_evidence.length > 0;

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      {/* 1. Global Brand Header */}
      <GlobalNavbar
        currentPage="companies"
        userEmail={userEmail}
        subtitle="National Employer Dossier"
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
          <span>Companies</span>
          <span className="text-slate-300">•</span>
          <span className="font-bold text-navy-900 truncate max-w-[200px] sm:max-w-none">
            {company.display_name}
          </span>
        </div>
        <span
          suppressHydrationWarning
          className="font-mono text-[11px] text-slate-400 hidden sm:inline"
        >
          {lastCheckedLabel.toUpperCase()}:{" "}
          {new Date(lastCheckedDate).toLocaleDateString("en-AU")}
        </span>
      </div>

      {/* 3. Elevated Company Hero Dossier Card */}
      <section className="relative overflow-hidden rounded-2xl border border-surface-border bg-white p-6 sm:p-8 shadow-2xs">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 opacity-[0.06] mix-blend-multiply bg-center bg-cover [mask-image:radial-gradient(ellipse_at_center,black_50%,transparent_95%)]"
          style={{ backgroundImage: "url('/brand/hero_cartography.jpg')" }}
        />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-start gap-4 sm:gap-5 min-w-0">
            <CompanyBrandMark
              slug={company.slug}
              name={company.display_name}
              domain={company.domain}
              careersUrl={company.careers_url}
              size="xl"
              className="shadow-sm border-slate-200"
            />
            <div className="space-y-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-navy-900 truncate">
                  {company.display_name}
                </h1>
                {company.is_claimed ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-900 shadow-2xs">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
                    Verified Employer Profile
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/90 bg-slate-50 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 shadow-2xs">
                    <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                    Registry Indexed
                  </span>
                )}
              </div>

              {/* Company Badges & Tags */}
              <div className="flex flex-wrap items-center gap-2">
                {company.domain && (
                  <a
                    href={`https://${company.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-navy-900 hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5 text-slate-400" />
                    <span>{company.domain}</span>
                    <ExternalLink className="h-3 w-3 text-slate-400" />
                  </a>
                )}
                {hasSponsorship && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/90 bg-slate-50 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-slate-800 shadow-2xs">
                    <Award className="h-3 w-3 text-slate-600" />
                    Subclass 482 Sponsor
                  </span>
                )}
                {company.open_jobs.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 font-mono text-[11px] font-bold text-emerald-800 shadow-2xs">
                    <Zap className="h-3 w-3 fill-emerald-600 text-emerald-600" />
                    {company.open_jobs.length} Live{" "}
                    {company.open_jobs.length === 1 ? "Role" : "Roles"}
                  </span>
                )}
                {company.categories.map((cat) => (
                  <span
                    key={cat.key}
                    className="inline-flex items-center gap-1 rounded-full bg-slate-100/90 px-2.5 py-0.5 text-[11px] font-medium text-slate-600"
                  >
                    {cat.label}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            {company.careers_url && (
              <CareersLink
                slug={company.slug}
                careersUrl={company.careers_url}
                label="Careers Portal"
              />
            )}
            <WatchCompanyButton
              companyId={company.id}
              companySlug={company.slug}
              initialWatching={isWatching}
              isSignedIn={Boolean(userId)}
            />
            <a
              href={`/api/og/company/${company.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
              title="View high-resolution shareable card"
            >
              <Share2 className="h-3.5 w-3.5 text-slate-500" />
              <span>Share Card</span>
            </a>
            <a
              href="/api/export/companies"
              download
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition-colors"
              title="Download verified employer CSV dataset"
            >
              <Download className="h-3.5 w-3.5 text-slate-500" />
              <span>Export</span>
            </a>
            {!company.is_claimed && (
              <ClaimProfileModal
                companyId={company.id}
                companyName={company.display_name}
                companySlug={company.slug}
                companyDomain={company.domain}
                isClaimed={company.is_claimed}
                triggerLabel="Claim Profile"
                triggerClassName="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50/80 px-3 py-1.5 text-xs font-semibold text-emerald-900 shadow-2xs hover:bg-emerald-100/80 transition-colors cursor-pointer"
              />
            )}
          </div>
        </div>
      </section>

      {/* 4. Two-Column Dossier Body */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left / Main Column (8 of 12) */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          {/* Active Open Roles Section */}
          <section className="rounded-2xl border border-surface-border bg-white p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-5 border-b border-surface-border pb-4">
              <div>
                <h2 className="font-heading text-lg font-bold text-navy-900">
                  Open Positions
                  {company.open_jobs.length > 0 && (
                    <span className="ml-2 font-mono text-xs font-normal text-slate-500">
                      ({company.open_jobs.length} indexed)
                    </span>
                  )}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Real-time vacancies indexed from official monitored careers
                  infrastructure.
                </p>
              </div>
              {company.careers_url && (
                <a
                  href={company.careers_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-terracotta-700 hover:text-terracotta-800 hover:underline"
                >
                  <span>All openings</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            {company.open_jobs.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
                <p className="text-sm font-medium text-slate-700">
                  No active job postings currently indexed for this employer.
                </p>
                {company.careers_url && (
                  <p className="text-xs text-slate-500 mt-1">
                    Check their{" "}
                    <a
                      href={company.careers_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-terracotta-700 hover:underline"
                    >
                      official careers portal
                    </a>{" "}
                    for unlisted or directly advertised opportunities.
                  </p>
                )}
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {company.open_jobs.map((job, index) => (
                  <li
                    key={`${job.title}-${job.postedAt ?? index}-${index}`}
                    className="group rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5 flex-1">
                        {job.sourceUrl ? (
                          <a
                            href={job.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 font-heading text-base font-bold text-navy-900 hover:text-terracotta-700 transition-colors group"
                          >
                            <span className="group-hover:underline">
                              {job.title}
                            </span>
                            <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-terracotta-700 transition-colors" />
                          </a>
                        ) : (
                          <h3 className="font-heading text-base font-bold text-navy-900">
                            {job.title}
                          </h3>
                        )}

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
                          {REMOTE_TYPE_LABELS[job.remoteType] && (
                            <span className="rounded bg-sky-50 text-sky-700 border border-sky-200/70 px-2 py-0.5 font-mono text-[10px] font-semibold">
                              {REMOTE_TYPE_LABELS[job.remoteType]}
                            </span>
                          )}
                        </div>
                      </div>

                      {job.postedAt && (
                        <span
                          suppressHydrationWarning
                          className="font-mono text-[11px] text-slate-400 shrink-0"
                        >
                          {new Date(job.postedAt).toLocaleDateString("en-AU")}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Hiring Demand & Skills Landscape */}
          {(company.role_signals.length > 0 ||
            company.skill_signals.length > 0) && (
            <section className="rounded-2xl border border-surface-border bg-slate-50/60 p-6 shadow-2xs">
              <div className="flex items-center gap-2.5 mb-5 border-b border-surface-border pb-4">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                  <Zap className="h-4 w-4 fill-emerald-700 text-emerald-700" />
                </span>
                <div>
                  <h2 className="font-heading text-lg font-bold text-navy-900">
                    Hiring Demand &amp; Skills Landscape
                  </h2>
                  <p className="text-xs text-slate-500">
                    Empirical recruitment signals derived from observed job
                    postings and ATS tracking.
                  </p>
                </div>
              </div>

              {/* Role Disciplines */}
              {company.role_signals.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono mb-2.5">
                    Active Role Disciplines &amp; Velocity
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {company.role_signals.map((signal) => (
                      <div
                        key={signal.roleFamily}
                        className="flex items-center justify-between rounded-xl border border-surface-border bg-white px-3.5 py-2.5 text-xs shadow-2xs"
                      >
                        <div>
                          <span className="font-bold text-navy-900 block">
                            {signal.roleFamily}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {signal.activeJobs} live{" "}
                            {signal.activeJobs === 1 ? "role" : "roles"}
                          </span>
                        </div>
                        <div>
                          {signal.sufficient && signal.momentum !== null ? (
                            <span
                              className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${
                                signal.momentum > 0
                                  ? "bg-emerald-100 text-emerald-800"
                                  : signal.momentum < 0
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {signal.momentum > 0
                                ? `+${Math.round(signal.momentum * 100)}%`
                                : `${Math.round(signal.momentum * 100)}%`}
                            </span>
                          ) : (
                            <span className="rounded-full bg-slate-100 border border-slate-200 px-2 py-0.5 font-mono text-[10px] text-slate-600">
                              Baseline
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Skills Chips */}
              {company.skill_signals.length > 0 && (
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono mb-2.5">
                    Top Required Technologies &amp; Competencies
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {company.skill_signals.slice(0, 16).map((skill) => (
                      <span
                        key={skill.skillName}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/90 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-2xs"
                      >
                        <span>{skill.skillName}</span>
                        <span className="rounded bg-slate-100 px-1.5 py-0.2 font-mono text-[10px] text-slate-500 font-bold">
                          {skill.evidenceCount}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}

          {/* Subclass 482 Visa Sponsorship Evidence Dossier */}
          <section className="rounded-2xl border border-surface-border bg-white p-6 shadow-2xs">
            <div className="flex items-center gap-2.5 mb-5 border-b border-surface-border pb-4">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
                <ShieldCheck className="h-4 w-4 text-amber-700" />
              </span>
              <div>
                <h2 className="font-heading text-lg font-bold text-navy-900">
                  Subclass 482 Visa Sponsorship Evidence
                </h2>
                <p className="text-xs text-slate-500">
                  Official registry records, Department of Home Affairs data,
                  and substantiated historical claims.
                </p>
              </div>
            </div>

            {company.sponsorship_evidence.length === 0 ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-5 text-sm text-slate-600">
                <p>
                  No active sponsorship evidence indexed for this employer.
                  Absence of evidence does not mean the employer cannot or will
                  not sponsor qualified applicants.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {company.sponsorship_evidence.map((entry, index) => (
                  <li
                    key={`${entry.claimType}-${entry.observedAt}-${index}`}
                    className="rounded-xl border border-surface-border bg-slate-50/70 p-4 text-sm shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-2 font-bold text-navy-900">
                        <ShieldCheck className="h-4 w-4 shrink-0 text-terracotta-700" />
                        {SPONSORSHIP_CLAIM_LABELS[entry.claimType] ??
                          entry.claimType}
                      </span>
                      <span
                        suppressHydrationWarning
                        className="font-mono text-xs text-slate-500"
                      >
                        {new Date(entry.observedAt).toLocaleDateString("en-AU")}
                      </span>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-2 font-mono text-[11px]">
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-bold text-slate-700">
                        {Math.round(Number(entry.confidence) * 100)}% Confidence
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 font-medium text-slate-600">
                        {EVIDENCE_STATUS_LABELS[entry.status]}
                      </span>
                    </div>

                    {entry.claimType === "sponsorship_labour_agreement" ? (
                      <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                        {[
                          entry.claimValue.agreement_type,
                          entry.claimValue.start_date
                            ? `from ${String(entry.claimValue.start_date)}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}{" "}
                        · Source:{" "}
                        <span className="font-semibold text-navy-900">
                          Department of Home Affairs Labour Agreement Register
                        </span>
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-600">
                        {String(entry.claimValue.job_title ?? "")}
                        {typeof entry.claimValue.source_url === "string" && (
                          <>
                            {" · "}
                            <a
                              href={entry.claimValue.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-terracotta-700 font-semibold hover:underline inline-flex items-center gap-0.5"
                            >
                              <span>Inspect Source</span>
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </>
                        )}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <p className="mt-4 text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
              Disclaimer: Verification reflects documented evidence at the
              observed date. Sponsorship terms, occupational lists, and visa
              eligibility are subject to employer discretion and Department of
              Home Affairs regulations.
            </p>
          </section>

          {/* Research Claim & Provenance Notes */}
          {company.research_claim?.reason && (
            <section className="rounded-2xl border border-surface-border bg-white p-6 shadow-2xs">
              <h2 className="font-heading text-sm font-bold uppercase tracking-wider text-slate-400 font-mono mb-2">
                Registry Indexing Notes
              </h2>
              <p className="text-sm text-navy-900 leading-relaxed">
                {company.research_claim.reason}
              </p>
              {company.research_claim.confidence_note && (
                <p className="mt-2 text-xs text-slate-600">
                  {company.research_claim.confidence_note}
                </p>
              )}
              {company.research_source_name && (
                <p className="mt-2 text-xs text-slate-400 font-mono">
                  Primary Source: {company.research_source_name}
                </p>
              )}
            </section>
          )}
        </div>

        {/* Right / Sidebar Column (4 of 12) */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          {/* Factsheet Card */}
          <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-2xs space-y-4">
            <h3 className="font-heading text-sm font-bold text-navy-900 uppercase tracking-wider font-mono border-b border-surface-border pb-3">
              Company Dossier
            </h3>

            <dl className="space-y-3 text-xs">
              <div>
                <dt className="text-slate-400 font-mono text-[10px] uppercase">
                  Registry Status
                </dt>
                <dd className="font-bold text-navy-900 mt-0.5">
                  {STATUS_LABELS[company.status] ?? company.status}
                </dd>
              </div>

              {company.domain && (
                <div>
                  <dt className="text-slate-400 font-mono text-[10px] uppercase">
                    Official Website
                  </dt>
                  <dd className="font-medium text-navy-900 mt-0.5">
                    <a
                      href={`https://${company.domain}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-terracotta-700 hover:underline inline-flex items-center gap-1 font-semibold"
                    >
                      <span>{company.domain}</span>
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </dd>
                </div>
              )}

              <div>
                <dt className="text-slate-400 font-mono text-[10px] uppercase">
                  Initial Registration
                </dt>
                <dd
                  suppressHydrationWarning
                  className="font-medium text-navy-900 mt-0.5 inline-flex items-center gap-1"
                >
                  <Calendar className="h-3 w-3 text-slate-400" />
                  {new Date(company.created_at).toLocaleDateString("en-AU")}
                </dd>
              </div>

              {company.verified_at && (
                <div>
                  <dt className="text-slate-400 font-mono text-[10px] uppercase">
                    Last Verified
                  </dt>
                  <dd
                    suppressHydrationWarning
                    className="font-bold text-emerald-700 mt-0.5 inline-flex items-center gap-1"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    {new Date(company.verified_at).toLocaleDateString("en-AU")}
                  </dd>
                </div>
              )}

              {company.categories.length > 0 && (
                <div>
                  <dt className="text-slate-400 font-mono text-[10px] uppercase mb-1">
                    Sectors &amp; Disciplines
                  </dt>
                  <dd className="flex flex-wrap gap-1">
                    {company.categories.map((cat) => {
                      const iconPath = getCategoryIconPath(cat.label);
                      return (
                        <span
                          key={cat.key}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200/90 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 shadow-2xs"
                        >
                          {iconPath && (
                            <span className="relative inline-block h-3 w-3 shrink-0 overflow-hidden rounded-full">
                              <Image
                                src={iconPath}
                                alt={`${cat.label} icon`}
                                width={12}
                                height={12}
                                className="h-full w-full object-cover"
                              />
                            </span>
                          )}
                          <span>{cat.label}</span>
                        </span>
                      );
                    })}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {/* Locations & Premises Map Card */}
          {company.locations.length > 0 && (
            <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-2xs space-y-4">
              <div className="flex items-center justify-between border-b border-surface-border pb-3">
                <h3 className="font-heading text-sm font-bold text-navy-900 uppercase tracking-wider font-mono">
                  Premises &amp; Geography
                </h3>
                <span className="font-mono text-xs text-slate-500">
                  {company.locations.length}{" "}
                  {company.locations.length === 1 ? "site" : "sites"}
                </span>
              </div>

              <div className="h-48 overflow-hidden rounded-xl border border-slate-200/90 shadow-2xs">
                <MapCanvas
                  points={locationsToPoints(company)}
                  initialBbox={locationsToBbox(company.locations)}
                  interactive={false}
                />
              </div>

              <div className="space-y-2">
                {company.locations.map((loc, i) => (
                  <div
                    key={`${loc.lat}-${loc.lng}-${i}`}
                    className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100"
                  >
                    <MapPin className="h-3.5 w-3.5 text-terracotta-700 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-navy-900 block truncate">
                        {loc.inputText || "Australian Premises"}
                      </span>
                      <span className="text-[10px] font-mono uppercase text-slate-400">
                        {loc.locationType.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Claim / Employer Partnership Card */}
          {!company.is_claimed && (
            <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/50 to-white p-6 shadow-2xs space-y-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                  <ShieldCheck className="h-4 w-4 text-emerald-700" />
                </span>
                <h3 className="font-heading text-sm font-bold text-navy-900">
                  Are you with {company.display_name}?
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Claim your profile to update company coordinates, manage
                recruitment feeds, and verify subclass 482 sponsorship status.
              </p>
              <div className="pt-1">
                <ClaimProfileModal
                  companyId={company.id}
                  companyName={company.display_name}
                  companySlug={company.slug}
                  companyDomain={company.domain}
                  isClaimed={company.is_claimed}
                  triggerLabel="Claim Profile & Partner"
                  triggerClassName="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-navy-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-slate-800 transition-colors cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
