import Image from "next/image";
import { Building2, Compass, MapPin, ShieldCheck } from "lucide-react";
import type { MapCompanyPoint, RegionalHub } from "@austechmap/contracts";

import { AnimatedCounter } from "../components/ui/AnimatedCounter";
import { HomeMapShell } from "./_components/HomeMapShell";
import { DatabaseNotConfiguredError, getPool } from "../lib/db";
import { fetchMapCompanies } from "../lib/queries/mapCompanies";
import { listRegionalHubs } from "../lib/queries/listRegionalHubs";

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
  hubs: RegionalHub[];
}

async function loadHomeData(): Promise<HomeData> {
  const pool = getPool();
  const [{ rows }, mapResult, hubs] = await Promise.all([
    pool.query<{
      total_employers: string;
      total_cities: string;
      regional_employers: string;
      sponsorship_employers: string;
    }>(
      `SELECT 
        count(DISTINCT c.id) as total_employers,
        count(DISTINCT research.claim_value ->> 'city') as total_cities,
        count(DISTINCT CASE WHEN EXISTS (
          SELECT 1 FROM company_locations cl2
          JOIN resolved_locations rl2 ON rl2.id = cl2.resolved_location_id
          WHERE cl2.company_id = c.id AND rl2.migration_category IS NOT NULL
        ) THEN c.id END) as regional_employers,
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
      regional: false,
    }),
    listRegionalHubs(pool),
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
    hubs,
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
  let hubs: RegionalHub[] = [];
  let error: string | null = null;
  try {
    const data = await loadHomeData();
    stats = data.stats;
    points = data.points;
    hubs = data.hubs;
  } catch (caught) {
    error =
      caught instanceof DatabaseNotConfiguredError
        ? "DATABASE_URL is not configured for this deployment."
        : `Could not load employers: ${String(caught)}`;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <a
        href="#directory-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:rounded-md focus:bg-navy-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:outline-none focus:ring-2 focus:ring-ochre-600 focus:ring-offset-2"
      >
        Skip to directory content
      </a>

      {/* Global Brand Header with Terracotta CTA */}
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-border pb-4">
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 overflow-hidden rounded-xl border border-surface-border shadow-2xs bg-white">
            <Image
              src="/brand/logo.jpg"
              alt="Australia Tech Map Logo"
              width={40}
              height={40}
              className="h-full w-full object-cover"
              priority
            />
          </div>
          <div className="flex flex-col">
            <span className="font-heading text-base font-bold tracking-tight text-navy-900 leading-none">
              Australia Tech Map
            </span>
            <span className="text-xs text-slate-500 font-medium mt-1">
              People. Companies. Opportunities.
            </span>
          </div>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <span className="text-navy-900 font-semibold cursor-default border-b-2 border-terracotta-700 pb-0.5">
            Map
          </span>
          <a
            href="#directory-content"
            className="hover:text-navy-900 transition-colors"
          >
            Companies
          </a>
          <a
            href="#directory-content"
            className="hover:text-navy-900 transition-colors"
          >
            Regions
          </a>
          <span className="text-slate-400 cursor-not-allowed">Insights</span>
          <span className="text-slate-400 cursor-not-allowed">About</span>
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-surface-border bg-white px-3 py-1 font-mono text-[11px] font-semibold text-slate-800 shadow-2xs">
            <span className="h-2 w-2 rounded-full bg-emerald-600" />
            Verified Registry
          </span>
          <a
            href="https://github.com/jeevanshah/AusTechMap"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-terracotta-700 hover:bg-terracotta-800 active:scale-95 text-white px-3.5 py-1.5 text-xs font-semibold shadow-xs transition-all"
          >
            + Add your company
          </a>
        </div>
      </header>

      {/* Compact Studio Masthead: Headline Left, 4 Stat Cards Right */}
      <section className="relative overflow-hidden rounded-2xl border border-surface-border bg-white p-6 sm:p-7 shadow-2xs">
        {/* Subtle Topographical Surveyor Texture */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 opacity-[0.09] mix-blend-multiply bg-center bg-cover [mask-image:radial-gradient(ellipse_at_center,black_60%,transparent_95%)]"
          style={{
            backgroundImage: "url('/brand/hero_cartography.jpg')",
          }}
        />

        <div className="relative z-10 grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center">
          {/* Left: Headline & Narrative */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-terracotta-700" />
              <p className="font-mono text-xs font-bold tracking-wider text-terracotta-700 uppercase">
                Explore Australia’s Tech Ecosystem
              </p>
              <div className="relative hidden md:inline-block h-5 w-24 overflow-hidden mix-blend-multiply opacity-80">
                <Image
                  src="/assets/annotations/cities_to_regions.png"
                  alt="From cities to regions"
                  width={96}
                  height={20}
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-navy-900 sm:text-4xl text-balance">
              See where opportunity lives.
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-slate-600">
              Discover verified tech employers, substantiated subclass 482 visa
              sponsors, and regional innovation hubs across Australia — all
              indexed from official registry and G-NAF premises data.
            </p>
          </div>

          {/* Right: Elevated 4-Stat Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4">
            <div className="rounded-xl border border-surface-border bg-slate-50/90 p-3.5 shadow-2xs hover:border-slate-400 hover:bg-white transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-navy-900 border border-slate-200/90 shadow-2xs">
                  <Building2 className="h-3.5 w-3.5" />
                </span>
                <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Index
                </span>
              </div>
              <span className="font-mono text-xl font-bold tracking-tight text-navy-900 tabular-nums">
                <AnimatedCounter target={stats.totalEmployers} />
              </span>
              <span className="mt-0.5 block font-mono text-[11px] text-slate-500">
                verified companies
              </span>
            </div>

            <div className="rounded-xl border border-surface-border bg-slate-50/90 p-3.5 shadow-2xs hover:border-slate-400 hover:bg-white transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-navy-900 border border-slate-200/90 shadow-2xs">
                  <MapPin className="h-3.5 w-3.5" />
                </span>
                <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Hubs
                </span>
              </div>
              <span className="font-mono text-xl font-bold tracking-tight text-navy-900 tabular-nums">
                <AnimatedCounter target={stats.totalCities} />
              </span>
              <span className="mt-0.5 block font-mono text-[11px] text-slate-500">
                cities &amp; regions
              </span>
            </div>

            <div className="rounded-xl border border-surface-border bg-slate-50/90 p-3.5 shadow-2xs hover:border-slate-400 hover:bg-white transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-navy-900 border border-slate-200/90 shadow-2xs">
                  <Compass className="h-3.5 w-3.5" />
                </span>
                <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Regional
                </span>
              </div>
              <span className="font-mono text-xl font-bold tracking-tight text-navy-900 tabular-nums">
                <AnimatedCounter target={stats.regionalEmployers} />
              </span>
              <span className="mt-0.5 block font-mono text-[11px] text-slate-500">
                regional tech employers
              </span>
            </div>

            <div className="rounded-xl border border-surface-border bg-slate-50/90 p-3.5 shadow-2xs hover:border-slate-400 hover:bg-white transition-all">
              <div className="flex items-center justify-between mb-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-navy-900 border border-slate-200/90 shadow-2xs">
                  <ShieldCheck className="h-3.5 w-3.5" />
                </span>
                <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Visas
                </span>
              </div>
              <span className="font-mono text-xl font-bold tracking-tight text-navy-900 tabular-nums">
                <AnimatedCounter target={stats.sponsorshipEmployers} />
              </span>
              <span className="mt-0.5 block font-mono text-[11px] text-slate-500">
                subclass 482 sponsors
              </span>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <p className="rounded-xl border border-red-600/40 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </p>
      )}

      {!error && (
        <HomeMapShell
          initialPoints={points}
          initialBbox={AUSTRALIA_BBOX}
          initialHubs={hubs}
        />
      )}
    </main>
  );
}
