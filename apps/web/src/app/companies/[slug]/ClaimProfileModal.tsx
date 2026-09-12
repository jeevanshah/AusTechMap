"use client";

import { useState, useTransition, useEffect } from "react";
import {
  CheckCircle2,
  X,
  ShieldCheck,
  Building2,
  Sparkles,
  Database,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { submitEmployerClaimAction } from "../../corrections/actions";

interface ClaimProfileModalProps {
  companyId: string;
  companyName: string;
  companySlug: string;
  companyDomain: string | null;
  isClaimed?: boolean;
  triggerClassName?: string;
  triggerLabel?: string;
}

type ClaimTypeOption = "profile_verification" | "employer_pro" | "data_partnership";

export function ClaimProfileModal({
  companyId,
  companyName,
  companySlug,
  companyDomain,
  isClaimed,
  triggerClassName,
  triggerLabel,
}: ClaimProfileModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [claimType, setClaimType] = useState<ClaimTypeOption>("profile_verification");
  const [claimantName, setClaimantName] = useState("");
  const [claimantEmail, setClaimantEmail] = useState("");
  const [claimantRole, setClaimantRole] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{
    claimId: string;
    domainMatched: boolean;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  // Close modal on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  const cleanCompanyDomain = companyDomain
    ? companyDomain.toLowerCase().replace(/^www\./, "").trim()
    : null;

  const emailDomain = claimantEmail.includes("@")
    ? claimantEmail.split("@")[1]?.toLowerCase().trim()
    : "";

  const isDomainMatch = Boolean(
    cleanCompanyDomain &&
      emailDomain &&
      (emailDomain === cleanCompanyDomain || emailDomain.endsWith("." + cleanCompanyDomain))
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await submitEmployerClaimAction({
        companyId,
        claimantName,
        claimantEmail,
        claimantRole,
        claimType,
        claimedData: {
          inquiryType: claimType,
          companyName,
          companySlug,
          companyDomain,
          notes: notes.trim() || undefined,
          domainMatched: isDomainMatch,
        },
        evidenceUrl: evidenceUrl.trim() || undefined,
      });

      if (res.ok && res.claimId) {
        setSuccessData({
          claimId: res.claimId,
          domainMatched: Boolean(res.domainMatched),
        });
      } else {
        setError(res.error ?? "Failed to submit request. Please try again.");
      }
    });
  };

  const handleResetAndClose = () => {
    setIsOpen(false);
    setError(null);
    setSuccessData(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={
          triggerClassName ??
          "inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 hover:text-navy-900 hover:border-slate-300 transition-colors cursor-pointer shadow-2xs"
        }
        title={`Claim or partner with ${companyName}`}
      >
        <ShieldCheck className="h-3 w-3 text-emerald-600" />
        <span>{triggerLabel ?? "Claim Profile & Partner"}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-navy-950/60 backdrop-blur-xs transition-opacity"
            onClick={handleResetAndClose}
            aria-hidden="true"
          />

          {/* Modal Card */}
          <div className="relative w-full max-w-xl rounded-2xl border border-surface-border bg-white p-6 sm:p-8 shadow-2xl transition-all z-10 my-8">
            {/* Close Button */}
            <button
              type="button"
              onClick={handleResetAndClose}
              className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>

            {successData ? (
              <div className="space-y-6 text-center py-4">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div className="space-y-2">
                  <h3 className="font-heading text-2xl font-bold text-navy-900">
                    Inquiry Received
                  </h3>
                  <p className="text-sm text-slate-600 max-w-md mx-auto">
                    Your request for <strong>{companyName}</strong> has been logged in our verification queue.
                  </p>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-left text-xs space-y-2 max-w-md mx-auto">
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Claim ID:</span>
                    <span className="font-mono text-slate-700">{successData.claimId.slice(0, 8)}...</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500 font-medium">Work Domain:</span>
                    {successData.domainMatched ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-100/60 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="h-3 w-3" />
                        Verified @{cleanCompanyDomain}
                      </span>
                    ) : (
                      <span className="text-amber-700 font-medium">Manual review required</span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-medium">Status:</span>
                    <span className="text-slate-700 font-medium">Pending Staff Review (~24–48h)</span>
                  </div>
                </div>

                <p className="text-xs text-slate-500">
                  Our talent team will verify your role and reach out to {claimantEmail}.
                </p>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleResetAndClose}
                    className="w-full rounded-xl bg-navy-900 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-navy-800 transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      <ShieldCheck className="h-3 w-3" />
                      Official Employer Portal
                    </span>
                  </div>
                  <h2 className="font-heading text-xl sm:text-2xl font-bold text-navy-900">
                    Claim Profile & Partner With Us
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600">
                    Verify this profile for <strong>{companyName}</strong>, upgrade to Employer Pro, or inquire about workforce data partnerships.
                  </p>
                </div>

                {/* Inquiry Type Segmented Control */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Inquiry Category
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setClaimType("profile_verification")}
                      className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        claimType === "profile_verification"
                          ? "border-emerald-600 bg-emerald-50/50 text-emerald-950 ring-1 ring-emerald-500 shadow-2xs"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-xs">
                        <Building2 className="h-3.5 w-3.5 text-emerald-700" />
                        <span>Verify Profile</span>
                      </div>
                      <span className="text-[11px] text-slate-500 mt-1 leading-tight">
                        Claim verified employer badge & manage hiring signals.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setClaimType("employer_pro")}
                      className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        claimType === "employer_pro"
                          ? "border-emerald-600 bg-emerald-50/50 text-emerald-950 ring-1 ring-emerald-500 shadow-2xs"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-xs">
                        <Sparkles className="h-3.5 w-3.5 text-terracotta-600" />
                        <span>Employer Pro</span>
                      </div>
                      <span className="text-[11px] text-slate-500 mt-1 leading-tight">
                        Featured placement & talent brand promotion.
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setClaimType("data_partnership")}
                      className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        claimType === "data_partnership"
                          ? "border-emerald-600 bg-emerald-50/50 text-emerald-950 ring-1 ring-emerald-500 shadow-2xs"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-semibold text-xs">
                        <Database className="h-3.5 w-3.5 text-sky-700" />
                        <span>Data Partner</span>
                      </div>
                      <span className="text-[11px] text-slate-500 mt-1 leading-tight">
                        Custom skills feeds, API access, & market insights.
                      </span>
                    </button>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Your Full Name <span className="text-terracotta-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Sarah Jenkins"
                      value={claimantName}
                      onChange={(e) => setClaimantName(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-700">
                      Work Role / Title <span className="text-terracotta-600">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Head of People & Talent"
                      value={claimantRole}
                      onChange={(e) => setClaimantRole(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700">
                      Work Email <span className="text-terracotta-600">*</span>
                    </label>
                    {isDomainMatch && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        Matches @{cleanCompanyDomain} (Fast-track)
                      </span>
                    )}
                  </div>
                  <input
                    type="email"
                    required
                    placeholder={
                      cleanCompanyDomain
                        ? `you@${cleanCompanyDomain}`
                        : "you@company.com"
                    }
                    value={claimantEmail}
                    onChange={(e) => setClaimantEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                  {cleanCompanyDomain && !isDomainMatch && claimantEmail.includes("@") && (
                    <p className="text-[11px] text-amber-700">
                      Note: Using your corporate email (@{cleanCompanyDomain}) enables faster verification.
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    LinkedIn or Verification Link <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="url"
                    placeholder="https://linkedin.com/in/your-profile"
                    value={evidenceUrl}
                    onChange={(e) => setEvidenceUrl(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Notes or Requested Changes <span className="text-slate-400 font-normal">(Optional)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Tell us about hiring plans, ATS integrations, or features you want enabled..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-emerald-600 focus:outline-none focus:ring-1 focus:ring-emerald-600 resize-none"
                  />
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={handleResetAndClose}
                    className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-navy-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-navy-800 disabled:opacity-50 transition-colors cursor-pointer"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Submitting...</span>
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-3.5 w-3.5" />
                        <span>
                          {claimType === "profile_verification"
                            ? "Submit Verification Claim"
                            : claimType === "employer_pro"
                            ? "Request Employer Pro"
                            : "Submit Partnership Inquiry"}
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
