import Image from "next/image";
import { Building2, Compass, MapPin, ShieldCheck } from "lucide-react";
import type { MapCompanyPoint } from "@austechmap/contracts";

import { AnimatedCounter } from "../components/ui/AnimatedCounter";
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
        <div className="flex items-center gap-3">
          <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-slate-200/90 shadow-2xs bg-white">
            <Image
              src="/brand/logo.jpg"
              alt="Australia Tech Map Logo"
              width={36}
              height={36}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <div className="flex flex-col">
            <span className="font-heading text-sm font-bold tracking-wider text-navy-900 uppercase leading-none">
              Australia Tech Map
            </span>
            <span className="font-mono text-[10px] text-slate-500 uppercase tracking-wider mt-1">
              National Tech Opportunity Registry
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-50/80 px-3 py-1 text-xs font-medium text-emerald-800 shadow-2xs">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-600" />
          </span>
          <span className="font-mono font-semibold tracking-wider uppercase text-[11px]">
            Live Registry • Neon DB Synced
          </span>
        </div>
      </header>

      <section className="relative flex flex-col gap-6 rounded-2xl border border-surface-border bg-white p-6 sm:p-8 shadow-2xs">
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
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 rounded bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-600 border border-slate-200 shadow-2xs">
              <kbd className="font-semibold text-navy-900">⌘K</kbd> or{" "}
              <kbd className="font-semibold text-navy-900">Ctrl+K</kbd> to
              search
            </span>
            <span>•</span>
            <span>Click any regional hub to fly &amp; filter</span>
          </div>
        </div>

        {/* Hero Stat Strip with Kinetic Number Counters */}
        <div className="relative z-10 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <div className="group rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-xs transition-all duration-150">
            <div className="flex items-center justify-between mb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-navy-900 border border-slate-200/80 shadow-2xs group-hover:bg-navy-900 group-hover:text-white transition-colors duration-200">
                <Building2 className="h-4.5 w-4.5" />
              </span>
              <span className="font-mono text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Index
              </span>
            </div>
            <span className="font-mono text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl tabular-nums">
              <AnimatedCounter target={stats.totalEmployers} />
            </span>
            <span className="mt-1 block font-mono text-xs text-slate-500 font-medium">
              verified employers
            </span>
          </div>

          <div className="group rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-xs transition-all duration-150">
            <div className="flex items-center justify-between mb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-navy-900 border border-slate-200/80 shadow-2xs group-hover:bg-navy-900 group-hover:text-white transition-colors duration-200">
                <MapPin className="h-4.5 w-4.5" />
              </span>
              <span className="font-mono text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Coverage
              </span>
            </div>
            <span className="font-mono text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl tabular-nums">
              <AnimatedCounter target={stats.totalCities} />
            </span>
            <span className="mt-1 block font-mono text-xs text-slate-500 font-medium">
              cities &amp; regions
            </span>
          </div>

          <div className="group rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-xs transition-all duration-150">
            <div className="flex items-center justify-between mb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-navy-900 border border-slate-200/80 shadow-2xs group-hover:bg-navy-900 group-hover:text-white transition-colors duration-200">
                <Compass className="h-4.5 w-4.5" />
              </span>
              <span className="font-mono text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Regional
              </span>
            </div>
            <span className="font-mono text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl tabular-nums">
              <AnimatedCounter target={stats.regionalEmployers} />
            </span>
            <span className="mt-1 block font-mono text-xs text-slate-500 font-medium">
              regional employers
            </span>
          </div>

          <div className="group rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-xs transition-all duration-150">
            <div className="flex items-center justify-between mb-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-navy-900 border border-slate-200/80 shadow-2xs group-hover:bg-navy-900 group-hover:text-white transition-colors duration-200">
                <ShieldCheck className="h-4.5 w-4.5" />
              </span>
              <span className="font-mono text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Sponsors
              </span>
            </div>
            <span className="font-mono text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl tabular-nums">
              <AnimatedCounter target={stats.sponsorshipEmployers} />
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
