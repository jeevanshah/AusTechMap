"use client";

import { useState } from "react";
import {
  CheckCircle2,
  FileText,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type { DataCorrectionType } from "@austechmap/contracts";
import {
  submitDataCorrectionAction,
  submitEmployerClaimAction,
  type ClaimSubmissionResponse,
  type CorrectionSubmissionResponse,
} from "./actions";

interface CompanyOption {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
}

export function CorrectionsPortalClient({
  companies,
}: {
  companies: CompanyOption[];
}) {
  const [activeTab, setActiveTab] = useState<"claim" | "correction">("claim");

  // Claim Form State
  const [claimCompanyId, setClaimCompanyId] = useState(companies[0]?.id ?? "");
  const [claimantName, setClaimantName] = useState("");
  const [claimantEmail, setClaimantEmail] = useState("");
  const [claimantRole, setClaimantRole] = useState("");
  const [officialCareersUrl, setOfficialCareersUrl] = useState("");
  const [claimEvidenceUrl, setClaimEvidenceUrl] = useState("");
  const [isClaimSubmitting, setIsClaimSubmitting] = useState(false);
  const [claimResult, setClaimResult] = useState<ClaimSubmissionResponse | null>(
    null,
  );

  // Correction Form State
  const [corrCompanyId, setCorrCompanyId] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [correctionType, setCorrectionType] =
    useState<DataCorrectionType>("location_incorrect");
  const [details, setDetails] = useState("");
  const [corrEvidenceUrl, setCorrEvidenceUrl] = useState("");
  const [isCorrSubmitting, setIsCorrSubmitting] = useState(false);
  const [corrResult, setCorrResult] =
    useState<CorrectionSubmissionResponse | null>(null);

  const selectedClaimCompany = companies.find((c) => c.id === claimCompanyId);

  async function handleClaimSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsClaimSubmitting(true);
    setClaimResult(null);

    const res = await submitEmployerClaimAction({
      companyId: claimCompanyId,
      claimantName,
      claimantEmail,
      claimantRole,
      claimType: "profile_verification",
      claimedData: {
        officialCareersUrl: officialCareersUrl.trim() || undefined,
      },
      evidenceUrl: claimEvidenceUrl.trim() || undefined,
    });

    setIsClaimSubmitting(false);
    setClaimResult(res);
  }

  async function handleCorrSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsCorrSubmitting(true);
    setCorrResult(null);

    const res = await submitDataCorrectionAction({
      companyId: corrCompanyId ? corrCompanyId : undefined,
      submitterName: submitterName.trim() || undefined,
      submitterEmail,
      correctionType,
      details,
      evidenceUrl: corrEvidenceUrl.trim() || undefined,
    });

    setIsCorrSubmitting(false);
    setCorrResult(res);
  }

  return (
    <div className="space-y-8">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-surface-border pb-px">
        <button
          type="button"
          onClick={() => setActiveTab("claim")}
          className={`flex items-center gap-2 rounded-t-xl px-5 py-3 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === "claim"
              ? "border-b-2 border-emerald-800 bg-white text-emerald-950 shadow-2xs"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <ShieldCheck className="h-4 w-4 text-emerald-700" />
          <span>Claim Employer Profile</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("correction")}
          className={`flex items-center gap-2 rounded-t-xl px-5 py-3 text-sm font-semibold transition-colors cursor-pointer ${
            activeTab === "correction"
              ? "border-b-2 border-emerald-800 bg-white text-emerald-950 shadow-2xs"
              : "text-slate-500 hover:text-slate-900"
          }`}
        >
          <FileText className="h-4 w-4 text-sky-700" />
          <span>Report Data Discrepancy</span>
        </button>
      </div>

      {/* Tab 1: Claim Employer Profile */}
      {activeTab === "claim" && (
        <section className="rounded-2xl border border-surface-border bg-white p-6 sm:p-8 shadow-2xs space-y-6">
          <header className="space-y-2">
            <h2 className="font-heading text-xl font-bold text-navy-900">
              Verify Official Company Ownership
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Claiming your organization allows talent and executive teams to
              verify official office locations, connect active careers feeds, and
              receive direct candidate applications. Submissions from email
              addresses matching your company domain undergo priority automated
              verification.
            </p>
          </header>

          {claimResult?.ok && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950 space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                <span>Verification Request Received</span>
              </div>
              <p>
                Reference ID:{" "}
                <code className="font-mono">{claimResult.claimId}</code>
              </p>
              <p className="text-emerald-800">
                {claimResult.domainMatched
                  ? "✓ Your email domain matches the verified company domain. Fast-track verification in progress."
                  : "ℹ Domain requires manual corroboration. Our verification research team will review your evidence."}
              </p>
            </div>
          )}

          {claimResult?.error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
              {claimResult.error}
            </div>
          )}

          <form onSubmit={handleClaimSubmit} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label
                htmlFor="claim-company"
                className="font-semibold text-slate-800"
              >
                Target Company Profile
              </label>
              <select
                id="claim-company"
                value={claimCompanyId}
                onChange={(e) => setClaimCompanyId(e.target.value)}
                required
                className="w-full rounded-xl border border-surface-border bg-slate-50 px-3 py-2.5 font-sans text-xs text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.domain ?? c.slug})
                  </option>
                ))}
              </select>
              {selectedClaimCompany?.domain && (
                <p className="text-[11px] text-slate-500">
                  Registered domain:{" "}
                  <code className="font-mono text-emerald-800">
                    @{selectedClaimCompany.domain}
                  </code>
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="claimant-name"
                  className="font-semibold text-slate-800"
                >
                  Your Full Name
                </label>
                <input
                  id="claimant-name"
                  type="text"
                  placeholder="e.g. Sarah Connor"
                  value={claimantName}
                  onChange={(e) => setClaimantName(e.target.value)}
                  required
                  className="w-full rounded-xl border border-surface-border px-3 py-2 text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="claimant-email"
                  className="font-semibold text-slate-800"
                >
                  Corporate Email Address
                </label>
                <input
                  id="claimant-email"
                  type="email"
                  placeholder="e.g. sarah@atlassian.com"
                  value={claimantEmail}
                  onChange={(e) => setClaimantEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-surface-border px-3 py-2 text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="claimant-role"
                  className="font-semibold text-slate-800"
                >
                  Your Corporate Role / Title
                </label>
                <input
                  id="claimant-role"
                  type="text"
                  placeholder="e.g. Head of Talent Acquisition, Founder"
                  value={claimantRole}
                  onChange={(e) => setClaimantRole(e.target.value)}
                  required
                  className="w-full rounded-xl border border-surface-border px-3 py-2 text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="official-careers"
                  className="font-semibold text-slate-800"
                >
                  Official Careers / ATS URL (Optional)
                </label>
                <input
                  id="official-careers"
                  type="url"
                  placeholder="https://jobs.lever.co/company or /careers"
                  value={officialCareersUrl}
                  onChange={(e) => setOfficialCareersUrl(e.target.value)}
                  className="w-full rounded-xl border border-surface-border px-3 py-2 text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="evidence-url"
                className="font-semibold text-slate-800"
              >
                Verification Evidence URL (Optional)
              </label>
              <input
                id="evidence-url"
                type="url"
                placeholder="Link to corporate LinkedIn page, ABN lookup, or official press release"
                value={claimEvidenceUrl}
                onChange={(e) => setClaimEvidenceUrl(e.target.value)}
                className="w-full rounded-xl border border-surface-border px-3 py-2 text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isClaimSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-800 hover:bg-emerald-900 px-6 py-2.5 font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {isClaimSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Submitting claim...</span>
                </>
              ) : (
                <span>Submit Profile Claim</span>
              )}
            </button>
          </form>
        </section>
      )}

      {/* Tab 2: Report Data Discrepancy */}
      {activeTab === "correction" && (
        <section className="rounded-2xl border border-surface-border bg-white p-6 sm:p-8 shadow-2xs space-y-6">
          <header className="space-y-2">
            <h2 className="font-heading text-xl font-bold text-navy-900">
              Submit a Data Correction or Dispute
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              Found an inaccurate office location, broken careers link, or
              outdated sponsorship status? Report it here with corroborating
              links to ensure Australia Tech Map remains 100% verifiable.
            </p>
          </header>

          {corrResult?.ok && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950 space-y-1">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                <span>Discrepancy Report Submitted</span>
              </div>
              <p>
                Ticket ID:{" "}
                <code className="font-mono">{corrResult.correctionId}</code>
              </p>
              <p className="text-emerald-800">
                Thank you for contributing to data integrity. A staff reviewer will
                verify this submission.
              </p>
            </div>
          )}

          {corrResult?.error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
              {corrResult.error}
            </div>
          )}

          <form onSubmit={handleCorrSubmit} className="space-y-4 text-xs">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="corr-type"
                  className="font-semibold text-slate-800"
                >
                  Type of Discrepancy
                </label>
                <select
                  id="corr-type"
                  value={correctionType}
                  onChange={(e) =>
                    setCorrectionType(e.target.value as DataCorrectionType)
                  }
                  required
                  className="w-full rounded-xl border border-surface-border bg-slate-50 px-3 py-2 font-sans text-xs text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
                >
                  <option value="location_incorrect">
                    Office / Regional location incorrect
                  </option>
                  <option value="careers_url_broken">
                    Careers portal / ATS URL broken or outdated
                  </option>
                  <option value="sponsorship_dispute">
                    Visa sponsorship status dispute
                  </option>
                  <option value="category_mismatch">
                    Industry category mismatch
                  </option>
                  <option value="other">Other data inconsistency</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="corr-company"
                  className="font-semibold text-slate-800"
                >
                  Affected Company (Optional)
                </label>
                <select
                  id="corr-company"
                  value={corrCompanyId}
                  onChange={(e) => setCorrCompanyId(e.target.value)}
                  className="w-full rounded-xl border border-surface-border bg-slate-50 px-3 py-2 font-sans text-xs text-slate-900 focus:border-emerald-600 focus:bg-white focus:outline-none"
                >
                  <option value="">-- General / Not Company Specific --</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label
                  htmlFor="submitter-name"
                  className="font-semibold text-slate-800"
                >
                  Your Name (Optional)
                </label>
                <input
                  id="submitter-name"
                  type="text"
                  placeholder="e.g. Alex Smith"
                  value={submitterName}
                  onChange={(e) => setSubmitterName(e.target.value)}
                  className="w-full rounded-xl border border-surface-border px-3 py-2 text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="submitter-email"
                  className="font-semibold text-slate-800"
                >
                  Your Email Address
                </label>
                <input
                  id="submitter-email"
                  type="email"
                  placeholder="e.g. alex@example.com"
                  value={submitterEmail}
                  onChange={(e) => setSubmitterEmail(e.target.value)}
                  required
                  className="w-full rounded-xl border border-surface-border px-3 py-2 text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="details" className="font-semibold text-slate-800">
                Discrepancy Details & Requested Correction (min 10 chars)
              </label>
              <textarea
                id="details"
                rows={3}
                placeholder="Explain precisely what is inaccurate and provide the correct details..."
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                required
                minLength={10}
                className="w-full rounded-xl border border-surface-border p-3 text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="corr-evidence-url"
                className="font-semibold text-slate-800"
              >
                Official Corroborating Evidence URL (Optional)
              </label>
              <input
                id="corr-evidence-url"
                type="url"
                placeholder="https://example.com/press-release or official announcement"
                value={corrEvidenceUrl}
                onChange={(e) => setCorrEvidenceUrl(e.target.value)}
                className="w-full rounded-xl border border-surface-border px-3 py-2 text-slate-900 focus:border-emerald-600 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isCorrSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy-900 hover:bg-navy-950 px-6 py-2.5 font-semibold text-white transition-colors cursor-pointer disabled:opacity-50"
            >
              {isCorrSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Submitting report...</span>
                </>
              ) : (
                <span>Submit Discrepancy Report</span>
              )}
            </button>
          </form>
        </section>
      )}
    </div>
  );
}
