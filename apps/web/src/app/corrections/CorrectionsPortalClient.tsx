"use client";

import { useState } from "react";
import { CheckCircle2, FileText, Loader2 } from "lucide-react";
import type { DataCorrectionType } from "@austechmap/contracts";

import {
  submitDataCorrectionAction,
  type CorrectionSubmissionResponse,
} from "./actions";

interface CompanyOption {
  id: string;
  name: string;
}

export function CorrectionsPortalClient({
  companies,
}: {
  companies: CompanyOption[];
}) {
  const [companyId, setCompanyId] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [correctionType, setCorrectionType] =
    useState<DataCorrectionType>("location_incorrect");
  const [details, setDetails] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<CorrectionSubmissionResponse | null>(
    null,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setResult(null);

    const response = await submitDataCorrectionAction({
      companyId: companyId || undefined,
      submitterName: submitterName.trim() || undefined,
      submitterEmail,
      correctionType,
      details,
      evidenceUrl: evidenceUrl.trim() || undefined,
    });

    setIsSubmitting(false);
    setResult(response);
  }

  return (
    <section className="rounded-2xl border border-surface-border bg-white p-6 shadow-2xs sm:p-8">
      <header className="space-y-2 border-b border-surface-border pb-5">
        <div className="flex items-center gap-2 text-navy-900">
          <FileText className="h-5 w-5 text-sky-700" />
          <h2 className="font-heading text-xl font-bold">
            Report a data issue
          </h2>
        </div>
        <p className="text-sm leading-relaxed text-slate-600">
          Tell us about a company we should add or an inaccurate location,
          careers link, category, or sponsorship record. We review supporting
          evidence before changing a public company record.
        </p>
      </header>

      {result?.ok && (
        <div className="mt-6 space-y-1 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            <span>Data issue submitted</span>
          </div>
          <p>
            Ticket ID: <code className="font-mono">{result.correctionId}</code>
          </p>
          <p className="text-emerald-800">
            Thank you. A staff reviewer will assess the evidence before any
            change is published.
          </p>
        </div>
      )}

      {result?.error && (
        <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-900">
          {result.error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4 text-xs">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor="corr-type" className="font-semibold text-slate-800">
              Type of issue
            </label>
            <select
              id="corr-type"
              value={correctionType}
              onChange={(e) =>
                setCorrectionType(e.target.value as DataCorrectionType)
              }
              required
              className="w-full rounded-xl border border-surface-border bg-slate-50 px-3 py-2 font-sans text-xs text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
            >
              <option value="location_incorrect">
                Office or regional location is incorrect
              </option>
              <option value="careers_url_broken">
                Careers portal or ATS link is broken
              </option>
              <option value="sponsorship_dispute">
                Sponsorship evidence needs correction
              </option>
              <option value="category_mismatch">
                Industry category is incorrect
              </option>
              <option value="other">
                Suggest a missing company or another data issue
              </option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="corr-company"
              className="font-semibold text-slate-800"
            >
              Affected company{" "}
              <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <select
              id="corr-company"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="w-full rounded-xl border border-surface-border bg-slate-50 px-3 py-2 font-sans text-xs text-slate-900 focus:border-sky-600 focus:bg-white focus:outline-none"
            >
              <option value="">General or not company-specific</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
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
              Your name{" "}
              <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="submitter-name"
              type="text"
              placeholder="e.g. Alex Smith"
              value={submitterName}
              onChange={(e) => setSubmitterName(e.target.value)}
              className="w-full rounded-xl border border-surface-border px-3 py-2 text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="submitter-email"
              className="font-semibold text-slate-800"
            >
              Email address
            </label>
            <input
              id="submitter-email"
              type="email"
              placeholder="e.g. alex@example.com"
              value={submitterEmail}
              onChange={(e) => setSubmitterEmail(e.target.value)}
              required
              className="w-full rounded-xl border border-surface-border px-3 py-2 text-slate-900 focus:border-sky-600 focus:outline-none"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="details" className="font-semibold text-slate-800">
            What needs correcting or adding?{" "}
            <span className="font-normal text-slate-500">
              (minimum 10 characters)
            </span>
          </label>
          <textarea
            id="details"
            rows={4}
            placeholder="For a new company, include its name, website, and why it belongs in the directory..."
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            required
            minLength={10}
            className="w-full rounded-xl border border-surface-border p-3 text-slate-900 focus:border-sky-600 focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="corr-evidence-url"
            className="font-semibold text-slate-800"
          >
            Official supporting link{" "}
            <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id="corr-evidence-url"
            type="url"
            placeholder="https://example.com/official-announcement"
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            className="w-full rounded-xl border border-surface-border px-3 py-2 text-slate-900 focus:border-sky-600 focus:outline-none"
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-navy-900 px-6 py-2.5 font-semibold text-white transition-colors hover:bg-navy-950 disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Submitting report...</span>
            </>
          ) : (
            <span>Submit data issue</span>
          )}
        </button>
      </form>
    </section>
  );
}
