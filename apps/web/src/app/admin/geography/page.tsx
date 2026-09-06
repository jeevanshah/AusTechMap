import { DatabaseNotConfiguredError, getPool } from "../../../lib/db";

// Queries live data on every request; never statically prerendered, since
// DATABASE_URL is not available at build time and this data is only ever
// meaningful fresh.
export const dynamic = "force-dynamic";

interface GeographyReleaseRow {
  dataset: string;
  release_version: string;
  is_active: boolean;
  effective_from: string;
  effective_to: string | null;
  row_count: number | null;
  activated_at: string | null;
  source_name: string;
}

interface ImportRunRow {
  id: string;
  run_type: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  created_at: string;
  finished_at: string | null;
  terminal_error_code: string | null;
  terminal_error_message: string | null;
  source_name: string | null;
}

async function loadGeographyReleases(): Promise<GeographyReleaseRow[]> {
  const { rows } = await getPool().query<GeographyReleaseRow>(
    `SELECT gr.dataset, gr.release_version, gr.is_active, gr.effective_from,
            gr.effective_to, gr.row_count, gr.activated_at, ds.name AS source_name
     FROM geography_releases gr
     JOIN data_sources ds ON ds.id = gr.source_id
     ORDER BY gr.dataset, gr.is_active DESC, gr.created_at DESC`,
  );
  return rows;
}

async function loadRecentImportRuns(): Promise<ImportRunRow[]> {
  const { rows } = await getPool().query<ImportRunRow>(
    `SELECT ir.id, ir.run_type, ir.status, ir.attempt_count, ir.max_attempts,
            ir.created_at, ir.finished_at, ir.terminal_error_code,
            ir.terminal_error_message, ds.name AS source_name
     FROM import_runs ir
     LEFT JOIN data_sources ds ON ds.id = ir.source_id
     ORDER BY ir.created_at DESC
     LIMIT 50`,
  );
  return rows;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toISOString().replace("T", " ").replace("Z", " UTC");
}

export default async function GeographyStatusPage() {
  let releases: GeographyReleaseRow[] = [];
  let runs: ImportRunRow[] = [];
  let error: string | null = null;

  try {
    [releases, runs] = await Promise.all([
      loadGeographyReleases(),
      loadRecentImportRuns(),
    ]);
  } catch (caught) {
    error =
      caught instanceof DatabaseNotConfiguredError
        ? "DATABASE_URL is not configured for this deployment."
        : `Could not load geography status: ${String(caught)}`;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-8 sm:px-10 sm:py-12">
      <header className="flex items-center justify-between border-b border-emerald-950/15 pb-5">
        <span className="text-sm font-semibold tracking-[0.18em] uppercase">
          Geography &amp; import status
        </span>
      </header>

      <p className="rounded-xl border border-amber-600/40 bg-amber-50 p-4 text-sm text-amber-900">
        This page has no access control. It is safe only because no real
        employer or user data exists yet — it must not be relied on as
        production-ready before an auth gate is added (see
        ARCHITECTURE_DECISIONS.md §4.1).
      </p>

      {error && (
        <p className="rounded-xl border border-red-600/40 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </p>
      )}

      <section>
        <h2 className="mb-4 font-mono text-xs tracking-[0.18em] text-emerald-700 uppercase">
          Geography releases
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-emerald-950/15">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-emerald-950/5 text-xs tracking-wide uppercase">
              <tr>
                <th className="px-4 py-3">Dataset</th>
                <th className="px-4 py-3">Release</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Effective from</th>
                <th className="px-4 py-3">Effective to</th>
                <th className="px-4 py-3">Rows</th>
                <th className="px-4 py-3">Source</th>
              </tr>
            </thead>
            <tbody>
              {releases.length === 0 && !error && (
                <tr>
                  <td className="px-4 py-3 text-emerald-950/60" colSpan={7}>
                    No geography releases recorded yet.
                  </td>
                </tr>
              )}
              {releases.map((release) => (
                <tr
                  key={`${release.dataset}-${release.release_version}`}
                  className="border-t border-emerald-950/10"
                >
                  <td className="px-4 py-3 font-mono text-xs">
                    {release.dataset}
                  </td>
                  <td className="px-4 py-3">{release.release_version}</td>
                  <td className="px-4 py-3">
                    {release.is_active ? (
                      <span className="rounded-full bg-emerald-900 px-2 py-0.5 text-xs font-medium text-white">
                        active
                      </span>
                    ) : (
                      <span className="text-emerald-950/40">superseded</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{release.effective_from}</td>
                  <td className="px-4 py-3">{release.effective_to ?? "—"}</td>
                  <td className="px-4 py-3">{release.row_count ?? "—"}</td>
                  <td className="px-4 py-3">{release.source_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-mono text-xs tracking-[0.18em] text-emerald-700 uppercase">
          Recent import runs
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-emerald-950/15">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-emerald-950/5 text-xs tracking-wide uppercase">
              <tr>
                <th className="px-4 py-3">Run type</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Attempts</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Finished</th>
                <th className="px-4 py-3">Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.length === 0 && !error && (
                <tr>
                  <td className="px-4 py-3 text-emerald-950/60" colSpan={7}>
                    No import runs recorded yet.
                  </td>
                </tr>
              )}
              {runs.map((run) => (
                <tr key={run.id} className="border-t border-emerald-950/10">
                  <td className="px-4 py-3 font-mono text-xs">
                    {run.run_type}
                  </td>
                  <td className="px-4 py-3">{run.source_name ?? "—"}</td>
                  <td className="px-4 py-3">{run.status}</td>
                  <td className="px-4 py-3">
                    {run.attempt_count}/{run.max_attempts}
                  </td>
                  <td className="px-4 py-3">
                    {formatTimestamp(run.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    {formatTimestamp(run.finished_at)}
                  </td>
                  <td className="px-4 py-3 text-red-800">
                    {run.terminal_error_code
                      ? `${run.terminal_error_code}: ${run.terminal_error_message ?? ""}`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
