import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle2,
  Lock,
  Shield,
  Trash2,
  UserCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Privacy Policy & APP 11 Data Protection — Australia Tech Map",
  description:
    "Australian Privacy Principles (APP) compliance, zero-tracking browsing, and automated account deletion policy.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
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
          Privacy Policy • Privacy Act 1988 (Cth)
        </span>
      </nav>

      <article className="mt-10 space-y-12">
        {/* Title */}
        <header className="space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-mono text-xs font-semibold text-emerald-800">
            <Shield className="h-3.5 w-3.5" />
            <span>Australian Privacy Principles (APPs) Compliant</span>
          </div>
          <h1 className="font-heading text-4xl font-extrabold tracking-tight text-navy-900 sm:text-5xl">
            Privacy Policy & Data Protection Standards
          </h1>
          <p className="text-lg leading-relaxed text-slate-600">
            Australia Tech Map is dedicated to transparency, radical data
            minimisation, and respect for user sovereignty. We believe
            technology opportunity intelligence should never require personal
            surveillance.
          </p>
        </header>

        {/* Core Principles */}
        <section className="grid gap-6 sm:grid-cols-2">
          <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-2xs space-y-3">
            <div className="flex items-center gap-2.5 text-navy-900">
              <UserCheck className="h-5 w-5 text-emerald-700" />
              <h2 className="font-heading text-lg font-bold">
                Default Anonymous Browsing
              </h2>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              Exploring the national map, filtering companies, searching roles,
              and viewing regional opportunity scores requires no account and
              collects no personally identifiable information. We use no
              invasive third-party ad pixels or behavioral tracking networks.
            </p>
          </div>

          <div className="rounded-2xl border border-surface-border bg-white p-6 shadow-2xs space-y-3">
            <div className="flex items-center gap-2.5 text-navy-900">
              <Lock className="h-5 w-5 text-sky-700" />
              <h2 className="font-heading text-lg font-bold">
                Radical Account Minimisation
              </h2>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              When creating an account to save searches or watch companies, we
              collect only your verified email address via passwordless magic
              links. We never request passwords, personal phone numbers, or
              social media links.
            </p>
          </div>
        </section>

        {/* APP 11 Account Erasure */}
        <section className="space-y-4 rounded-2xl border border-surface-border bg-white p-7 shadow-2xs">
          <div className="flex items-center gap-3 text-navy-900">
            <Trash2 className="h-5 w-5 text-terracotta-700" />
            <h2 className="font-heading text-2xl font-bold">
              APP 11 Automated Account Deletion
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            Under Australian Privacy Principle 11 (Security of Personal
            Information), you possess an absolute right to have your personal
            data permanently destroyed when no longer needed.
          </p>
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-5 space-y-3 text-xs leading-relaxed text-slate-700">
            <p className="font-bold text-slate-900">
              When you delete your account from your Account Hub (
              <Link href="/account" className="text-terracotta-700 underline">
                /account
              </Link>
              ):
            </p>
            <ul className="list-disc pl-5 space-y-1.5 text-slate-600">
              <li>
                Your user record and email address are immediately and
                permanently erased from the PostgreSQL database.
              </li>
              <li>
                All associated MFA credentials, encryption keys, and active
                sessions are terminated instantly.
              </li>
              <li>
                Your saved search queries, customized alert frequencies, and
                company/regional watchlists are irreversibly deleted.
              </li>
              <li>
                A cryptographically sealed, recipient-encrypted tombstone
                receipt is produced to satisfy statutory audit requirements
                without retaining identifiable email text.
              </li>
            </ul>
          </div>
        </section>

        {/* Employer & Candidate Data Policy */}
        <section className="space-y-4 rounded-2xl border border-surface-border bg-white p-7 shadow-2xs">
          <h2 className="font-heading text-2xl font-bold text-navy-900">
            Candidate & Employer Data Boundaries
          </h2>
          <p className="text-sm leading-relaxed text-slate-600">
            Australia Tech Map indexes public, organizational technology
            employment data — not individuals:
          </p>
          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                <strong>No Candidate Resumes:</strong> We do not store or
                process candidate CVs or job applications. All job links direct
                users directly to the employer’s official ATS application
                system.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Public Registry Attribution:</strong> Company legal
                names, ABNs, and premises coordinates are acquired under
                official Australian Government open data licences (Geoscape
                G-NAF and ABR).
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Correction Rights:</strong> Verified employer
                representatives may claim or request corrections to their
                company records at any time via our{" "}
                <Link
                  href="/corrections"
                  className="text-terracotta-700 underline"
                >
                  Corrections Center
                </Link>
                .
              </span>
            </div>
          </div>
        </section>

        {/* Contact Information */}
        <section className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-xs text-slate-600 space-y-2">
          <p className="font-bold text-slate-900">Privacy Officer Contact</p>
          <p>
            For any questions regarding our compliance with the Privacy Act 1988
            (Cth) or to exercise your rights, contact our team at
            privacy@austechmap.com.
          </p>
        </section>
      </article>
    </main>
  );
}
