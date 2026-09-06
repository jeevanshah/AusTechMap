import Link from "next/link";

import { DatabaseNotConfiguredError, getPool } from "../../../lib/db";

export const dynamic = "force-dynamic";

interface CompanyRow {
  id: string;
  slug: string;
  display_name: string;
  status: string;
  abn: string | null;
  domain: string | null;
  verified_at: string | null;
}

async function loadCompanies(): Promise<CompanyRow[]> {
  const { rows } = await getPool().query<CompanyRow>(
    `SELECT id, slug, display_name, status, abn, domain, verified_at
     FROM companies
     ORDER BY created_at DESC
     LIMIT 200`,
  );
  return rows;
}

export default async function CompaniesAdminPage() {
  let companies: CompanyRow[] = [];
  let error: string | null = null;
  try {
    companies = await loadCompanies();
  } catch (caught) {
    error =
      caught instanceof DatabaseNotConfiguredError
        ? "DATABASE_URL is not configured for this deployment."
        : `Could not load companies: ${String(caught)}`;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-10 px-6 py-8 sm:px-10 sm:py-12">
      <header className="flex items-center justify-between border-b border-emerald-950/15 pb-5">
        <span className="text-sm font-semibold tracking-[0.18em] uppercase">
          Companies
        </span>
      </header>

      <p className="rounded-xl border border-amber-600/40 bg-amber-50 p-4 text-sm text-amber-900">
        This page has no access control and every action here is currently
        attributed to a fixed placeholder account, not a real signed-in person —
        see ARCHITECTURE_DECISIONS.md §4.1. Safe only because no real employer
        or user data exists yet.
      </p>

      {error && (
        <p className="rounded-xl border border-red-600/40 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </p>
      )}

      <div>
        <Link
          href="/admin/companies/new"
          className="inline-block rounded-full bg-emerald-900 px-4 py-2 text-sm font-medium text-white"
        >
          + New company
        </Link>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-emerald-950/15">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-emerald-950/5 text-xs tracking-wide uppercase">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">ABN</th>
              <th className="px-4 py-3">Domain</th>
              <th className="px-4 py-3">Verified</th>
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && !error && (
              <tr>
                <td className="px-4 py-3 text-emerald-950/60" colSpan={5}>
                  No companies yet.
                </td>
              </tr>
            )}
            {companies.map((company) => (
              <tr key={company.id} className="border-t border-emerald-950/10">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/companies/${company.id}`}
                    className="font-medium underline decoration-emerald-900/30 underline-offset-2"
                  >
                    {company.display_name}
                  </Link>
                </td>
                <td className="px-4 py-3">{company.status}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  {company.abn ?? "—"}
                </td>
                <td className="px-4 py-3">{company.domain ?? "—"}</td>
                <td className="px-4 py-3">
                  {company.verified_at ? "yes" : "no"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
