import Link from "next/link";
import { notFound } from "next/navigation";

import { getPool } from "../../../../lib/db";
import {
  disableCompanyAction,
  mergeCompanyAction,
  updateCompany,
  verifyCompanyAction,
} from "../actions";

export const dynamic = "force-dynamic";

interface CompanyDetail {
  id: string;
  slug: string;
  display_name: string;
  abn: string | null;
  acn: string | null;
  domain: string | null;
  careers_url: string | null;
  status: string;
  merged_into_company_id: string | null;
  merged_into_display_name: string | null;
  disabled_reason: string | null;
  verified_at: string | null;
}

async function loadCompany(id: string): Promise<CompanyDetail | null> {
  const { rows } = await getPool().query<CompanyDetail>(
    `SELECT c.id, c.slug, c.display_name, c.abn, c.acn, c.domain, c.careers_url,
            c.status, c.merged_into_company_id, m.display_name AS merged_into_display_name,
            c.disabled_reason, c.verified_at
     FROM companies c
     LEFT JOIN companies m ON m.id = c.merged_into_company_id
     WHERE c.id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await loadCompany(id);
  if (!company) notFound();

  if (company.status === "merged") {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8 sm:px-10 sm:py-12">
        <header className="border-b border-emerald-950/15 pb-5">
          <span className="text-sm font-semibold tracking-[0.18em] uppercase">
            {company.display_name}
          </span>
        </header>
        <p className="rounded-xl border border-emerald-950/15 bg-emerald-950/5 p-4 text-sm">
          This company has been merged into{" "}
          <Link
            href={`/admin/companies/${company.merged_into_company_id}`}
            className="font-medium underline"
          >
            {company.merged_into_display_name ?? company.merged_into_company_id}
          </Link>
          . Aliases, locations, and evidence recorded against this record are
          preserved and still reachable through this page.
        </p>
      </main>
    );
  }

  const boundUpdate = updateCompany.bind(null, company.id);
  const boundVerify = verifyCompanyAction.bind(null, company.id);
  const boundDisable = disableCompanyAction.bind(null, company.id);
  const boundMerge = mergeCompanyAction.bind(null, company.id);

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-10 px-6 py-8 sm:px-10 sm:py-12">
      <header className="flex items-center justify-between border-b border-emerald-950/15 pb-5">
        <span className="text-sm font-semibold tracking-[0.18em] uppercase">
          {company.display_name}
        </span>
        <span className="rounded-full bg-emerald-950/10 px-3 py-1 text-xs font-medium">
          {company.status}
          {company.verified_at ? " · verified" : ""}
        </span>
      </header>

      {company.status === "disabled" && (
        <p className="rounded-xl border border-red-600/40 bg-red-50 p-4 text-sm text-red-900">
          Disabled: {company.disabled_reason}
        </p>
      )}

      <section>
        <h2 className="mb-4 font-mono text-xs tracking-[0.18em] text-emerald-700 uppercase">
          Details
        </h2>
        <form action={boundUpdate} className="flex flex-col gap-5">
          <label className="flex flex-col gap-1 text-sm">
            Display name
            <input
              name="display_name"
              defaultValue={company.display_name}
              required
              className="rounded-lg border border-emerald-950/20 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            ABN
            <input
              name="abn"
              defaultValue={company.abn ?? ""}
              className="rounded-lg border border-emerald-950/20 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            ACN
            <input
              name="acn"
              defaultValue={company.acn ?? ""}
              className="rounded-lg border border-emerald-950/20 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Domain
            <input
              name="domain"
              defaultValue={company.domain ?? ""}
              className="rounded-lg border border-emerald-950/20 px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Careers URL
            <input
              name="careers_url"
              defaultValue={company.careers_url ?? ""}
              className="rounded-lg border border-emerald-950/20 px-3 py-2"
            />
          </label>
          <button
            type="submit"
            className="self-start rounded-full bg-emerald-900 px-4 py-2 text-sm font-medium text-white"
          >
            Save
          </button>
        </form>
      </section>

      {!company.verified_at && (
        <section>
          <form action={boundVerify}>
            <button
              type="submit"
              className="rounded-full border border-emerald-900 px-4 py-2 text-sm font-medium text-emerald-900"
            >
              Mark verified
            </button>
          </form>
        </section>
      )}

      {company.status !== "disabled" && (
        <section>
          <h2 className="mb-4 font-mono text-xs tracking-[0.18em] text-emerald-700 uppercase">
            Disable
          </h2>
          <form action={boundDisable} className="flex flex-col gap-3">
            <input
              name="reason"
              placeholder="Reason (required)"
              required
              className="rounded-lg border border-emerald-950/20 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="self-start rounded-full border border-red-700 px-4 py-2 text-sm font-medium text-red-700"
            >
              Disable company
            </button>
          </form>
        </section>
      )}

      <section>
        <h2 className="mb-4 font-mono text-xs tracking-[0.18em] text-emerald-700 uppercase">
          Merge into another company
        </h2>
        <form action={boundMerge} className="flex flex-col gap-3">
          <input
            name="target_company_id"
            placeholder="Target company id"
            required
            className="rounded-lg border border-emerald-950/20 px-3 py-2 text-sm"
          />
          <input
            name="reason"
            placeholder="Reason (required)"
            required
            className="rounded-lg border border-emerald-950/20 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="self-start rounded-full border border-emerald-950/40 px-4 py-2 text-sm font-medium"
          >
            Merge this company into target
          </button>
        </form>
      </section>
    </main>
  );
}
