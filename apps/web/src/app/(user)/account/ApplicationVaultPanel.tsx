"use client";

import type {
  JobApplication,
  JobApplicationStatus,
} from "@austechmap/contracts";
import {
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  FileText,
  LoaderCircle,
  MapPin,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

import {
  deleteJobApplicationAction,
  updateJobApplicationNotesAction,
  updateJobApplicationStatusAction,
} from "../../actions/applicationActions";

interface ApplicationVaultPanelProps {
  initialApplications: JobApplication[];
}

const STATUS_OPTIONS: Array<{
  value: JobApplicationStatus;
  label: string;
}> = [
  { value: "saved", label: "Saved" },
  { value: "applied", label: "Applied" },
  { value: "interviewing", label: "Interviewing" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
  { value: "withdrawn", label: "Withdrawn" },
];

const STATUS_STYLES: Record<JobApplicationStatus, string> = {
  saved: "border-slate-200 bg-slate-50 text-slate-700",
  applied: "border-sky-200 bg-sky-50 text-sky-800",
  interviewing: "border-amber-200 bg-amber-50 text-amber-800",
  offer: "border-emerald-200 bg-emerald-50 text-emerald-800",
  rejected: "border-rose-200 bg-rose-50 text-rose-800",
  withdrawn: "border-slate-200 bg-slate-100 text-slate-600",
};

function formatDate(value: string | null): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Australia/Sydney",
  }).format(new Date(value));
}

function statusLabel(status: JobApplicationStatus): string {
  return (
    STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status
  );
}

function formatSalary(
  minimum: number | null,
  maximum: number | null,
  period: string | null,
): string | null {
  if (minimum === null && maximum === null) return null;
  const currency = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  });
  const amount =
    minimum !== null && maximum !== null
      ? `${currency.format(minimum)}–${currency.format(maximum)}`
      : currency.format(minimum ?? maximum ?? 0);
  return period ? `${amount} / ${period}` : amount;
}

export function ApplicationVaultPanel({
  initialApplications,
}: ApplicationVaultPanelProps) {
  const [applications, setApplications] =
    useState<JobApplication[]>(initialApplications);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      initialApplications.map((application) => [
        application.id,
        application.notes ?? "",
      ]),
    ),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const replaceApplication = (updated: JobApplication) => {
    setApplications((current) =>
      current.map((application) =>
        application.id === updated.id ? updated : application,
      ),
    );
  };

  const run = (applicationId: string, operation: () => Promise<void>) => {
    setError(null);
    setMessage(null);
    setActiveId(applicationId);
    startTransition(async () => {
      try {
        await operation();
      } finally {
        setActiveId(null);
      }
    });
  };

  const updateStatus = (
    applicationId: string,
    status: JobApplicationStatus,
  ) => {
    run(applicationId, async () => {
      const result = await updateJobApplicationStatusAction(
        applicationId,
        status,
      );
      if (result.success && result.application) {
        replaceApplication(result.application);
        setMessage(`Status updated to ${statusLabel(status)}.`);
      } else {
        setError(result.error ?? "Could not update this application");
      }
    });
  };

  const saveNotes = (applicationId: string) => {
    run(applicationId, async () => {
      const result = await updateJobApplicationNotesAction(
        applicationId,
        noteDrafts[applicationId] ?? "",
      );
      if (result.success && result.application) {
        replaceApplication(result.application);
        setMessage("Private notes saved.");
      } else {
        setError(result.error ?? "Could not save these notes");
      }
    });
  };

  const removeApplication = (application: JobApplication) => {
    if (
      !window.confirm(
        `Remove ${application.snapshot.jobTitle} at ${application.snapshot.companyName} from your Job Vault?`,
      )
    ) {
      return;
    }
    run(application.id, async () => {
      const result = await deleteJobApplicationAction(application.id);
      if (result.success) {
        setApplications((current) =>
          current.filter((item) => item.id !== application.id),
        );
        setMessage("Job Vault entry permanently removed.");
      } else {
        setError(result.error ?? "Could not remove this application");
      }
    });
  };

  return (
    <div className="space-y-5">
      <section className="flex flex-col gap-3 rounded-xl border border-sky-200 bg-sky-50/70 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
          <div>
            <h3 className="font-heading text-sm font-bold text-navy-900">
              Your private Job Vault
            </h3>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-slate-600">
              Each entry is an immutable snapshot of the verified employer
              listing at the moment you saved it. Australia Tech Map never
              submits an application or shares your tracker status and notes
              with employers.
            </p>
          </div>
        </div>
        <Link
          href="/jobs"
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-navy-900 px-3 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-slate-800"
        >
          Browse live roles
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-800"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800"
        >
          {message}
        </p>
      )}

      {applications.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-surface-border bg-white p-12 text-center">
          <BriefcaseBusiness className="mx-auto h-9 w-9 text-slate-400" />
          <h3 className="mt-3 font-heading text-base font-bold text-navy-900">
            Your Job Vault is empty
          </h3>
          <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-slate-500">
            Save a role to preserve its description and requirements, then track
            your progress without relying on an ATS link remaining live.
          </p>
          <Link
            href="/jobs"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-navy-900 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-slate-800"
          >
            Explore live jobs
          </Link>
        </section>
      ) : (
        <div className="space-y-4">
          {applications.map((application) => {
            const snapshot = application.snapshot;
            const busy = isPending && activeId === application.id;
            const salary = formatSalary(
              snapshot.salaryMin,
              snapshot.salaryMax,
              snapshot.salaryPeriod,
            );
            return (
              <article
                key={application.id}
                className="rounded-2xl border border-surface-border bg-white p-5 shadow-2xs sm:p-6"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wide ${STATUS_STYLES[application.status]}`}
                      >
                        {statusLabel(application.status)}
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono text-[10px] text-slate-500">
                        <CalendarDays className="h-3 w-3" />
                        Saved {formatDate(application.savedAt)}
                      </span>
                    </div>
                    <h3 className="mt-3 font-heading text-lg font-bold text-navy-900">
                      {snapshot.jobTitle}
                    </h3>
                    <Link
                      href={`/companies/${snapshot.companySlug}`}
                      className="mt-1 inline-block text-xs font-bold text-terracotta-700 hover:underline"
                    >
                      {snapshot.companyName}
                    </Link>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                      {snapshot.locationText && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-1">
                          <MapPin className="h-3 w-3" />
                          {snapshot.locationText}
                        </span>
                      )}
                      <span className="rounded-md bg-slate-100 px-2 py-1">
                        {snapshot.workStyle.replaceAll("_", " ")}
                      </span>
                      {snapshot.roleFamily && (
                        <span className="rounded-md bg-slate-100 px-2 py-1">
                          {snapshot.roleFamily}
                        </span>
                      )}
                      {snapshot.employmentType && (
                        <span className="rounded-md bg-slate-100 px-2 py-1">
                          {snapshot.employmentType}
                        </span>
                      )}
                      {salary && (
                        <span className="rounded-md bg-slate-100 px-2 py-1">
                          {salary}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <label className="text-[11px] font-bold text-slate-600">
                      <span className="mb-1 block">Application status</span>
                      <select
                        value={application.status}
                        disabled={busy}
                        onChange={(event) =>
                          updateStatus(
                            application.id,
                            event.target.value as JobApplicationStatus,
                          )
                        }
                        className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-navy-900 focus:border-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/15 disabled:opacity-60"
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <a
                      href={snapshot.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-terracotta-700 px-3 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-terracotta-800"
                    >
                      Open employer application
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => removeApplication(application)}
                      aria-label={`Remove ${snapshot.jobTitle} from Job Vault`}
                      className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-2.5 text-slate-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 border-t border-slate-100 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500">
                        Snapshot provenance
                      </h4>
                      <p className="mt-1 text-xs text-slate-600">
                        Captured {formatDate(snapshot.capturedAt)} · first
                        observed {formatDate(snapshot.firstSeenAt)} · last
                        verified {formatDate(snapshot.lastSeenAt)}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        Tracker updated{" "}
                        {formatDate(application.statusChangedAt)}
                        {application.appliedAt
                          ? ` · applied ${formatDate(application.appliedAt)}`
                          : ""}
                        {application.interviewingAt
                          ? ` · interviewing ${formatDate(application.interviewingAt)}`
                          : ""}
                        {application.offerAt
                          ? ` · offer ${formatDate(application.offerAt)}`
                          : ""}
                      </p>
                    </div>
                    {snapshot.skills.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {snapshot.skills.map((skill) => (
                          <span
                            key={skill.key}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-800"
                          >
                            {skill.label}
                          </span>
                        ))}
                      </div>
                    )}
                    <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-xs font-bold text-navy-900">
                        <FileText className="h-4 w-4 text-slate-500" />
                        Saved job description
                      </summary>
                      <div className="mt-3 whitespace-pre-wrap border-t border-slate-200 pt-3 text-xs leading-relaxed text-slate-700">
                        {snapshot.descriptionText ||
                          "The source did not provide a job description when this snapshot was captured."}
                      </div>
                    </details>
                  </div>

                  <div>
                    <label
                      htmlFor={`notes-${application.id}`}
                      className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-500"
                    >
                      Private notes
                    </label>
                    <textarea
                      id={`notes-${application.id}`}
                      value={noteDrafts[application.id] ?? ""}
                      maxLength={5000}
                      rows={5}
                      onChange={(event) =>
                        setNoteDrafts((current) => ({
                          ...current,
                          [application.id]: event.target.value,
                        }))
                      }
                      placeholder="Interview preparation and follow-up notes…"
                      className="mt-1.5 w-full resize-y rounded-xl border border-slate-300 bg-white p-3 text-xs leading-relaxed text-navy-900 placeholder:text-slate-400 focus:border-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/15"
                    />
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-[10px] text-slate-400">
                        {(noteDrafts[application.id] ?? "").length}/5,000
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => saveNotes(application.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition-colors hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                      >
                        {busy ? (
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                        Save notes
                      </button>
                    </div>
                    <p className="mt-2 text-[10px] leading-relaxed text-amber-800">
                      Do not enter sensitive personal information such as health
                      details, immigration status, or another person&apos;s
                      private salary or contact information.
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
