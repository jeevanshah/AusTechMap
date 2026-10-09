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
              APP 11-Aligned Account Deletion
            </h2>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">
            Australia Tech Map follows an APP 11-aligned process for destroying
            or de-identifying personal information when it is no longer needed.
            This describes our technical policy; it is not legal advice or a
            claim that the business is necessarily an APP entity.
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
                Your account is immediately disabled, active sessions are
                revoked, and unused sign-in verification links are invalidated.
              </li>
              <li>
                Within 24 hours, the erasure job removes direct identifiers and
                user-owned product data. A de-identified user row remains only
                where required for audit attribution.
              </li>
              <li>
                Your private Job Vault snapshots, tracker statuses, notes,
                candidate profile, saved search queries, customised alert
                frequencies, and company/regional watchlists are irreversibly
                deleted.
              </li>
              <li>
                Encrypted backups expire within 35 days. Any restore must replay
                the external deletion ledger before traffic resumes.
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
            Australia Tech Map primarily indexes public organisational
            technology employment data. Signed-in users may also choose to keep
            a private Job Vault and application tracker, and a private candidate
            profile that pre-fills Opportunity Match.
          </p>
          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                <strong>No Resume Upload or Application Submission:</strong> We
                never receive or store candidate CVs. If you choose to analyse a
                PDF CV to pre-fill Opportunity Match, it is read entirely in
                your own browser to suggest your role, skills, and experience
                level — the file and its text are never uploaded to our servers.
                We do not receive application answers or submit applications.
                Employer application links open the employer’s official ATS in a
                separate action.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Optional Private Job Vault:</strong> If a signed-in user
                explicitly saves a role, we retain a private snapshot of that
                public listing, their chosen progress status, and any notes they
                add. This data is not shared with employers and is purged when
                the entry or account is deleted.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>
                <strong>Optional Candidate Profile:</strong> If you review and
                confirm the suggestions from a CV analysis, only those
                structured details — role family, experience level, skills,
                work-style, and location preferences — are sent to us and kept
                to pre-fill Opportunity Match. Nothing is sent or saved until
                you press Confirm &amp; Save. It is private to you, never shared
                with employers, and purged when you delete the profile or your
                account.
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
