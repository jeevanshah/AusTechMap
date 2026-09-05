import type { MapCompanyPoint } from "@austechmap/contracts";

import { HomeMapShell } from "./_components/HomeMapShell";
import { DatabaseNotConfiguredError, getPool } from "../lib/db";
import { fetchMapCompanies } from "../lib/queries/mapCompanies";

export const dynamic = "force-dynamic";

// Matches resolved_locations' own Australian-bounds CHECK constraint
// (db/migrations/0006) -- the initial viewport before the user pans.
const AUSTRALIA_BBOX = { west: 96, south: -45, east: 168, north: -9 };

interface HomeData {
  count: number;
  points: MapCompanyPoint[];
}

async function loadHomeData(): Promise<HomeData> {
  const pool = getPool();
  const [{ rows }, mapResult] = await Promise.all([
    pool.query<{ count: string }>(
      "SELECT count(*) FROM companies WHERE status NOT IN ('merged', 'disabled')",
    ),
    fetchMapCompanies(pool, {
      bbox: AUSTRALIA_BBOX,
      category: null,
      sponsorship: false,
    }),
  ]);
  return { count: Number(rows[0]?.count ?? 0), points: mapResult.points };
}

export default async function Home() {
  let count = 0;
  let points: MapCompanyPoint[] = [];
  let error: string | null = null;
  try {
    const data = await loadHomeData();
    count = data.count;
    points = data.points;
  } catch (caught) {
    error =
      caught instanceof DatabaseNotConfiguredError
        ? "DATABASE_URL is not configured for this deployment."
        : `Could not load employers: ${String(caught)}`;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-8 sm:px-10 sm:py-12">
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

      <section>
        <p className="mb-3 font-mono text-xs font-semibold tracking-wider text-ochre-700 uppercase">
          Australian Technology Opportunity Intelligence
        </p>
        <h1 className="max-w-4xl font-heading text-4xl leading-[1.08] font-bold tracking-tight text-navy-900 sm:text-6xl">
          A clearer map of employers, regions, and real opportunity.
        </h1>
        <p className="mt-4 font-mono text-sm font-medium text-slate-600">
          <span className="font-semibold text-navy-900">{count}</span> verified
          Australian tech employers indexed
        </p>
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
