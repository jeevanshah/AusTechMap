"use client";

import { useMemo, useState } from "react";
import { ExternalLink, Search, X, Briefcase, Filter } from "lucide-react";

export interface CompanyJobItem {
  title: string;
  roleFamily: string | null;
  seniority: string;
  remoteType: string;
  sourceUrl: string | null;
  postedAt: string | null;
}

interface CompanyRolesListProps {
  jobs: CompanyJobItem[];
  companyName: string;
  careersUrl?: string | null;
}

const SENIORITY_LABELS: Record<string, string> = {
  junior: "Junior",
  mid: "Mid-level",
  senior: "Senior",
  staff_principal: "Staff / Principal",
  management: "Management",
  unknown: "Seniority unstated",
};

const REMOTE_TYPE_LABELS: Record<string, string> = {
  onsite: "On-site",
  hybrid: "Hybrid",
  remote: "Remote",
  flexible_mixed: "Flexible",
  unknown: "Work style unstated",
};

export function CompanyRolesList({
  jobs,
  companyName,
  careersUrl,
}: CompanyRolesListProps) {
  const [query, setQuery] = useState("");
  const [selectedRoleFamily, setSelectedRoleFamily] = useState<string>("all");

  // Derive distinct role families present in this company's jobs
  const roleFamilies = useMemo(() => {
    const map = new Map<string, number>();
    for (const job of jobs) {
      if (job.roleFamily) {
        map.set(job.roleFamily, (map.get(job.roleFamily) ?? 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [jobs]);

  // Filter jobs by query and selected role family
  const filteredJobs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return jobs.filter((job) => {
      if (selectedRoleFamily !== "all" && job.roleFamily !== selectedRoleFamily) {
        return false;
      }
      if (q) {
        const matchesTitle = job.title.toLowerCase().includes(q);
        const matchesFamily = job.roleFamily?.toLowerCase().includes(q) ?? false;
        const matchesSeniority =
          (SENIORITY_LABELS[job.seniority] ?? "").toLowerCase().includes(q);
        const matchesRemote =
          (REMOTE_TYPE_LABELS[job.remoteType] ?? "").toLowerCase().includes(q);
        if (!matchesTitle && !matchesFamily && !matchesSeniority && !matchesRemote) {
          return false;
        }
      }
      return true;
    });
  }, [jobs, query, selectedRoleFamily]);

  if (jobs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center">
        <Briefcase className="mx-auto h-7 w-7 text-slate-400 mb-2" />
        <p className="text-sm font-medium text-slate-700">
          No active job postings currently indexed for {companyName}.
        </p>
        {careersUrl && (
          <p className="text-xs text-slate-500 mt-1.5">
            Check their{" "}
            <a
              href={careersUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-terracotta-700 hover:underline"
            >
              official careers portal
            </a>{" "}
            for unlisted or directly advertised opportunities.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search & Filter Controls (Rendered if company has 3+ positions) */}
      {jobs.length >= 3 && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50/70 p-3">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Filter ${jobs.length} positions by title, discipline, or seniority...`}
              className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pr-8 pl-8 text-xs font-medium text-navy-900 placeholder:text-slate-400 focus:border-navy-900 focus:outline-none focus:ring-2 focus:ring-navy-900/15"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {roleFamilies.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-mono text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                Discipline:
              </span>
              <button
                type="button"
                onClick={() => setSelectedRoleFamily("all")}
                className={`rounded-md px-2 py-0.5 font-medium transition-colors ${
                  selectedRoleFamily === "all"
                    ? "bg-navy-900 text-white font-bold"
                    : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                All ({jobs.length})
              </button>
              {roleFamilies.map(([family, count]) => (
                <button
                  key={family}
                  type="button"
                  onClick={() => setSelectedRoleFamily(family)}
                  className={`rounded-md px-2 py-0.5 font-medium transition-colors ${
                    selectedRoleFamily === family
                      ? "bg-navy-900 text-white font-bold"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {family} ({count})
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filter status note */}
      {(query || selectedRoleFamily !== "all") && (
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>
            Showing <strong className="text-navy-900">{filteredJobs.length}</strong> of{" "}
            {jobs.length} positions
          </span>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSelectedRoleFamily("all");
            }}
            className="text-terracotta-700 font-semibold hover:underline"
          >
            Reset filters
          </button>
        </div>
      )}

      {/* Role list */}
      {filteredJobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center">
          <p className="text-xs font-semibold text-slate-700">
            No positions match &quot;{query}&quot;
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setSelectedRoleFamily("all");
            }}
            className="mt-2 text-xs font-bold text-terracotta-700 hover:underline"
          >
            View all {jobs.length} open positions
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filteredJobs.map((job, index) => (
            <li
              key={`${job.title}-${job.postedAt ?? index}-${index}`}
              className="group rounded-xl border border-slate-200/90 bg-white p-4 shadow-2xs hover:border-slate-300 hover:shadow-xs transition-all"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1.5 flex-1">
                  {job.sourceUrl ? (
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-heading text-base font-bold text-navy-900 hover:text-terracotta-700 transition-colors group"
                    >
                      <span className="group-hover:underline">{job.title}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400 group-hover:text-terracotta-700 transition-colors" />
                    </a>
                  ) : (
                    <h3 className="font-heading text-base font-bold text-navy-900">
                      {job.title}
                    </h3>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    {job.roleFamily && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                        {job.roleFamily}
                      </span>
                    )}
                    {SENIORITY_LABELS[job.seniority] && (
                      <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-medium text-slate-600">
                        {SENIORITY_LABELS[job.seniority]}
                      </span>
                    )}
                    {REMOTE_TYPE_LABELS[job.remoteType] && (
                      <span className="rounded bg-sky-50 text-sky-700 border border-sky-200/70 px-2 py-0.5 font-mono text-[10px] font-semibold">
                        {REMOTE_TYPE_LABELS[job.remoteType]}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
                  {job.postedAt && (
                    <span
                      suppressHydrationWarning
                      className="font-mono text-[11px] text-slate-400"
                    >
                      {new Date(job.postedAt).toLocaleDateString("en-AU")}
                    </span>
                  )}
                  {job.sourceUrl && (
                    <a
                      href={job.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-50 border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-navy-900 transition-colors"
                    >
                      <span>Apply</span>
                      <ExternalLink className="h-3 w-3 text-slate-400" />
                    </a>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
