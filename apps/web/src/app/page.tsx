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
    fetchMapCompanies(pool, { bbox: AUSTRALIA_BBOX, category: null }),
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
      <header className="flex items-center justify-between border-b border-emerald-950/15 pb-5">
        <span className="text-sm font-semibold tracking-[0.18em] uppercase">
          Australia Tech Map
        </span>
      </header>

      <section>
        <p className="mb-5 text-sm font-semibold tracking-[0.2em] text-emerald-800 uppercase">
          Where can your tech career take you?
        </p>
        <h1 className="max-w-4xl text-5xl leading-[0.98] font-semibold tracking-[-0.05em] sm:text-7xl">
          A clearer map of employers, regions, and real opportunity.
        </h1>
        <p className="mt-4 text-base text-emerald-950/70">{count} employers</p>
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
