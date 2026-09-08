import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Building2, FileText, MapPin, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Data Corrections, Claims & Employer Updates — Australia Tech Map",
  description:
    "Official workflow for Australian technology employers and workforce organizations to claim, correct, or update company profiles and evidence.",
  alternates: { canonical: "/corrections" },
};

import { getPool } from "../../lib/db";
import { CorrectionsPortalClient } from "./CorrectionsPortalClient";

export const dynamic = "force-dynamic";

async function loadActiveCompanies() {
  try {
    const { rows } = await getPool().query<{
      id: string;
      slug: string;
      name: string;
      domain: string | null;
    }>(
      `SELECT id, slug, display_name AS name, domain
       FROM companies
       WHERE status = 'active'
       ORDER BY display_name ASC`,
    );
    return rows;
  } catch {
    return [];
  }
}

export default async function CorrectionsPage() {
  const companies = await loadActiveCompanies();

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-6 py-10 sm:px-10 sm:py-16">
      {/* Navigation Header */}
      <nav className="flex items-center justify-between border-b border-surface-border pb-5">
        <Link
          href="/"
          className="inline-flex items-center text-sm font-semibold text-slate-700 hover:text-navy-900 transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Map
        </Link>
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-400">
          Data Integrity & Corrections
        </span>
      </nav>

      <article className="mt-10 space-y-12">
        {/* Title */}
        <header className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 font-mono text-xs font-semibold text-sky-800">
            <FileText className="h-3.5 w-3.5" />
            <span>Employer Integrity Portal</span>
          </div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-navy-900 sm:text-5xl">
            Profile Corrections & Employer Claims
          </h1>
          <p className="text-lg leading-relaxed text-slate-600">
            We are committed to maintaining the most accurate graph of Australian technology employment. If your organization’s profile requires updates to office locations, careers portals, or visa sponsorship status, we provide a rapid, human-reviewed verification process.
          </p>
        </header>

        {/* Categories of Updates */}
        <section className="grid gap-6 sm:grid-cols-3">
          <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-2xs space-y-3">
            <MapPin className="h-5 w-5 text-terracotta-700" />
            <h2 className="font-heading text-base font-bold text-navy-900">Office Locations</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Add newly opened regional tech hubs, update corporate headquarters, or clarify remote-only operational policies.
            </p>
          </div>

          <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-2xs space-y-3">
            <Building2 className="h-5 w-5 text-sky-700" />
            <h2 className="font-heading text-base font-bold text-navy-900">Careers & ATS Portals</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Connect official Greenhouse, Lever, Workday, or custom careers feeds to ensure active roles appear within 24 hours.
            </p>
          </div>

          <div className="rounded-2xl border border-surface-border bg-white p-5 shadow-2xs space-y-3">
            <ShieldCheck className="h-5 w-5 text-emerald-700" />
            <h2 className="font-heading text-base font-bold text-navy-900">Sponsorship Evidence</h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Submit proof of official Department of Home Affairs Accredited Sponsor status or Minister-negotiated Labour Agreements.
            </p>
          </div>
        </section>

        {/* Interactive Claims & Corrections Submission Portal */}
        <CorrectionsPortalClient companies={companies} />

        {/* Verification Standards */}
        <section className="space-y-4 rounded-2xl border border-surface-border bg-white p-7 shadow-2xs">
          <h2 className="font-heading text-2xl font-bold text-navy-900">Verification & Review Standards</h2>
          <p className="text-sm leading-relaxed text-slate-600">
            To prevent spam and maintain data provenance (PRODUCT_SPEC.md §11), all modifications undergo review by staff researchers before publication:
          </p>
          <ul className="list-disc pl-5 text-xs text-slate-600 space-y-2 leading-relaxed">
            <li><strong>Authorised Domain Email:</strong> Submissions must originate from an email address matching the company’s primary operating domain (e.g. <code>jane@atlassian.com</code>).</li>
            <li><strong>Official Address Corroboration:</strong> Premises modifications must correspond to a valid physical G-NAF Australian address.</li>
            <li><strong>Evidence Trail:</strong> Every approved edit is recorded in an immutable audit ledger with the approving staff reviewer’s ID and timestamp.</li>
            <li><strong>Separation Guarantee:</strong> Employer-provided claims never overwrite independent platform observations; both are displayed with distinct provenance tags.</li>
          </ul>
        </section>
      </article>
    </main>
  );
}
