/* Hallmark · macrostructure: map-diagram · theme: National Registry · system: DESIGN.md */

import type { MapCompanyPoint } from "@austechmap/contracts";

import { HomeMapShell } from "./_components/HomeMapShell";
import { DatabaseNotConfiguredError, getPool } from "../lib/db";
import { fetchMapCompanies } from "../lib/queries/mapCompanies";

export const dynamic = "force-dynamic";

// Matches resolved_locations' own Australian-bounds CHECK constraint
// (db/migrations/0006) -- the initial viewport before the user pans.
const AUSTRALIA_BBOX = { west: 96, south: -45, east: 168, north: -9 };

const SPONSORSHIP_CLAIM_TYPES = [
  "sponsorship_current_explicit",
  "sponsorship_historical_explicit",
  "sponsorship_labour_agreement",
];

export interface HomeStats {
  totalEmployers: number;
  totalCities: number;
  regionalEmployers: number;
  sponsorshipEmployers: number;
}

interface HomeData {
  stats: HomeStats;
  points: MapCompanyPoint[];
}

async function loadHomeData(): Promise<HomeData> {
  const pool = getPool();
  const [{ rows }, mapResult] = await Promise.all([
    pool.query<{
      total_employers: string;
      total_cities: string;
      regional_employers: string;
      sponsorship_employers: string;
    }>(
      `SELECT 
        count(DISTINCT c.id) as total_employers,
        count(DISTINCT research.claim_value ->> 'city') as total_cities,
        count(DISTINCT CASE WHEN (research.claim_value ->> 'city') NOT IN ('Sydney', 'Melbourne') AND (research.claim_value ->> 'city') IS NOT NULL THEN c.id END) as regional_employers,
        count(DISTINCT CASE WHEN EXISTS (
          SELECT 1 FROM evidence e2
          WHERE e2.entity_type = 'company' AND e2.entity_id = c.id::text
            AND e2.claim_type = ANY($1::text[])
        ) THEN c.id END) as sponsorship_employers
      FROM companies c
      LEFT JOIN LATERAL (
        SELECT e.claim_value
        FROM evidence e
        WHERE e.entity_type = 'company' AND e.entity_id = c.id::text
          AND e.claim_type = 'employer_seed_research'
        ORDER BY e.observed_at DESC LIMIT 1
      ) research ON true
      WHERE c.status NOT IN ('merged', 'disabled')`,
      [SPONSORSHIP_CLAIM_TYPES],
    ),
    fetchMapCompanies(pool, {
      bbox: AUSTRALIA_BBOX,
      category: null,
      sponsorship: false,
    }),
  ]);

  const row = rows[0];
  return {
    stats: {
      totalEmployers: Number(row?.total_employers ?? 0),
      totalCities: Number(row?.total_cities ?? 0),
      regionalEmployers: Number(row?.regional_employers ?? 0),
      sponsorshipEmployers: Number(row?.sponsorship_employers ?? 0),
    },
    points: mapResult.points,
  };
}

export default async function Home() {
  let stats: HomeStats = {
    totalEmployers: 0,
    totalCities: 0,
    regionalEmployers: 0,
    sponsorshipEmployers: 0,
  };
  let points: MapCompanyPoint[] = [];
  let error: string | null = null;
  try {
    const data = await loadHomeData();
    stats = data.stats;
    points = data.points;
  } catch (caught) {
    error =
      caught instanceof DatabaseNotConfiguredError
        ? "DATABASE_URL is not configured for this deployment."
        : `Could not load employers: ${String(caught)}`;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-8 sm:px-10 sm:py-12">
      <a
        href="#directory-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-navy-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-ochre-600 focus:ring-offset-2"
      >
        Skip to directory content
      </a>

      <header className="flex items-center justify-between border-b border-surface-border pb-5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 items-center justify-center rounded bg-navy-900 text-white font-mono text-xs font-bold shadow-2xs">
            AU
          </span>
          <span className="font-heading text-sm font-semibold tracking-wider text-navy-900 uppercase">
            Australia Tech Map
          </span>
        </div>
        <span className="rounded bg-slate-100 px-2.5 py-1 font-mono text-xs font-medium text-slate-600 border border-surface-border">
          National Registry
        </span>
      </header>

      <section className="relative flex flex-col gap-6 overflow-hidden rounded-2xl border border-surface-border bg-gradient-to-br from-white via-slate-50/80 to-blue-50/30 p-6 sm:p-8 shadow-2xs">
        {/* Subtle oceanic aura in top right */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 -right-16 h-64 w-64 rounded-full bg-blue-100/30 blur-3xl"
        />

        <div className="relative z-10 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-ochre-600" />
            <p className="font-mono text-xs font-semibold tracking-wider text-ochre-700 uppercase">
              Australian Technology Opportunity Intelligence
            </p>
          </div>
          <h1 className="max-w-4xl font-heading text-4xl leading-[1.08] font-bold tracking-tight text-navy-900 sm:text-5xl text-balance">
            Explore Australia’s tech landscape.
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
            Find tech employers by location, industry, hiring activity, and
            sponsorship evidence — from Sydney and Melbourne to Australia&apos;s
            regional tech hubs.
          </p>
        </div>

        {/* Hero Stat Strip */}
        <div className="relative z-10 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-xl border border-surface-border/90 bg-white/95 p-4 shadow-2xs hover:border-slate-300 transition-colors">
            <span className="font-mono text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl tabular-nums">
              {stats.totalEmployers}
            </span>
            <span className="mt-1 block font-mono text-xs text-slate-500 font-medium">
              verified employers
            </span>
          </div>
          <div className="rounded-xl border border-surface-border/90 bg-white/95 p-4 shadow-2xs hover:border-slate-300 transition-colors">
            <span className="font-mono text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl tabular-nums">
              {stats.totalCities}
            </span>
            <span className="mt-1 block font-mono text-xs text-slate-500 font-medium">
              cities &amp; regions
            </span>
          </div>
          <div className="rounded-xl border border-surface-border/90 bg-white/95 p-4 shadow-2xs hover:border-slate-300 transition-colors">
            <span className="font-mono text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl tabular-nums">
              {stats.regionalEmployers}
            </span>
            <span className="mt-1 block font-mono text-xs text-slate-500 font-medium">
              regional employers
            </span>
          </div>
          <div className="rounded-xl border border-surface-border/90 bg-white/95 p-4 shadow-2xs hover:border-slate-300 transition-colors">
            <span className="font-mono text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl tabular-nums">
              {stats.sponsorshipEmployers}
            </span>
            <span className="mt-1 block font-mono text-xs text-slate-500 font-medium">
              with sponsorship evidence
            </span>
          </div>
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-red-600/40 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </p>
      )}

      {!error && (
        <HomeMapShell initialPoints={points} initialBbox={AUSTRALIA_BBOX} />
      )}
    </main>
  );
}
