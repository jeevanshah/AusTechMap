import type { Metadata } from "next";
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
}

const SPONSORSHIP_CLAIM_LABELS: Record<SponsorshipClaimType, string> = {
  sponsorship_current_explicit: "Current explicit evidence",
  sponsorship_labour_agreement: "Current labour agreement",
  sponsorship_historical_explicit: "Historical explicit evidence",
};

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
       COALESCE(sponsorship.items, '[]'::json) AS sponsorship_evidence
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
      <header className="flex items-center justify-between border-b border-emerald-950/15 pb-5">
        <span className="text-sm font-semibold tracking-[0.18em] uppercase">
          {company.display_name}
        </span>
        <span className="text-xs text-emerald-950/50">
          {lastCheckedLabel}:{" "}
          {new Date(lastCheckedDate).toLocaleDateString("en-AU")}
        </span>
      </header>

      {company.status === "disabled" && (
        <p className="rounded-xl border border-red-600/40 bg-red-50 p-4 text-sm text-red-900">
          This employer record has been disabled: {company.disabled_reason}
        </p>
      )}

      <section className="flex flex-wrap items-center gap-3">
        {company.domain && (
          <span className="rounded-full bg-emerald-950/5 px-3 py-1 text-xs">
            {company.domain}
          </span>
        )}
        {company.categories.map((category) => (
          <span
            key={category.key}
            className="rounded-full bg-emerald-950/5 px-3 py-1 text-xs"
          >
            {category.label}
          </span>
        ))}
        {company.careers_url && (
          <CareersLink slug={company.slug} careersUrl={company.careers_url} />
        )}
      </section>

      {company.research_claim?.reason && (
        <section className="rounded-xl border border-emerald-950/15 bg-emerald-950/5 p-4 text-sm">
          <p>
            According to our research
            {confidenceScore !== null &&
              ` (confidence: ${company.research_claim.confidence_tier ?? "unknown"})`}
            , {company.research_claim.reason}
          </p>
          {company.research_claim.confidence_note && (
            <p className="mt-2 text-xs text-emerald-950/60">
              {company.research_claim.confidence_note}
            </p>
          )}
          {company.research_source_name && (
            <p className="mt-2 text-xs text-emerald-950/50">
              Source: {company.research_source_name}
            </p>
          )}
        </section>
      )}

      {company.locations.length > 0 && (
        <section>
          <h2 className="mb-4 font-mono text-xs tracking-[0.18em] text-emerald-700 uppercase">
            Locations
          </h2>
          <div className="h-72 overflow-hidden rounded-2xl border border-emerald-950/15">
            <MapCanvas
              points={locationsToPoints(company)}
              initialBbox={locationsToBbox(company.locations)}
              interactive={false}
            />
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-4 font-mono text-xs tracking-[0.18em] text-emerald-700 uppercase">
          Sponsorship evidence
        </h2>
        {company.sponsorship_evidence.length === 0 ? (
          <p className="rounded-xl border border-emerald-950/15 p-4 text-sm text-emerald-950/60">
            No evidence found. This is not proof the employer does not sponsor.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {company.sponsorship_evidence.map((entry, index) => (
              <li
                key={`${entry.claimType}-${entry.observedAt}-${index}`}
                className="rounded-xl border border-emerald-950/15 p-4 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">
                    {SPONSORSHIP_CLAIM_LABELS[entry.claimType] ??
                      entry.claimType}
                  </span>
                  <span className="text-xs text-emerald-950/50">
                    {new Date(entry.observedAt).toLocaleDateString("en-AU")}
                  </span>
                </div>
                <p className="mt-1 text-xs text-emerald-950/60">
                  {entry.claimType === "sponsorship_labour_agreement"
                    ? [
                        entry.claimValue.agreement_type,
                        entry.claimValue.start_date
                          ? `from ${String(entry.claimValue.start_date)}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : String(entry.claimValue.job_title ?? "")}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-emerald-950/50">
          Important: evidence does not guarantee sponsorship for a specific role
          or applicant. Always confirm with the employer and official Home
          Affairs guidance.
        </p>
      </section>

      <p className="text-xs text-emerald-950/50">
        Hiring activity and technology-stack data will appear here once those
        pipelines are built (Phase 5).
      </p>
    </main>
  );
}
