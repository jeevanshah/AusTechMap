/**
 * Job freshness for display ("Posted today", "Posted 3 days ago").
 *
 * Deliberately conservative:
 * - Only the ATS-reported `postedAt` is trusted. `firstSeenAt` is our crawl
 *   time, so a newly onboarded employer's whole backlog would look new; it is
 *   used only to reject impossible data, never as a fallback date.
 * - Day granularity only. Several sources (Workable, Breezy, Pinpoint, static
 *   careers pages) report a date without a time, so an hour-level claim would
 *   be invented precision.
 * - Calendar days in Australia/Sydney, matching how the rest of the product
 *   shows dates.
 * - No applicant-count or "first to apply" claim: no ATS exposes applicant data.
 */

export type JobFreshnessKind = "new" | "recent";

export interface JobFreshness {
  kind: JobFreshnessKind;
  /** Whole Sydney calendar days since posting (0 = today). */
  days: number;
  label: string;
}

export interface FreshnessInput {
  postedAt: string | null | undefined;
  firstSeenAt?: string | null;
}

/** Posted within this many days counts as "new" (emphasised badge). */
export const NEW_JOB_MAX_DAYS = 3;
/** Relative labels stop here; older jobs fall back to an absolute date. */
export const RECENT_JOB_MAX_DAYS = 30;

const DAY_MS = 86_400_000;
const SYDNEY_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Australia/Sydney",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function sydneyDayNumber(date: Date): number {
  const [year = 0, month = 1, day = 1] = SYDNEY_DAY.format(date)
    .split("-")
    .map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

function parse(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function jobFreshness(
  job: FreshnessInput,
  now: Date = new Date(),
): JobFreshness | null {
  const posted = parse(job.postedAt);
  if (!posted) return null;

  // A posting cannot predate our first sight of it by more than we crawl
  // late, nor follow it: a posted date after first sight is bad data.
  const firstSeen = parse(job.firstSeenAt);
  if (firstSeen && posted.getTime() > firstSeen.getTime() + DAY_MS) return null;

  // Date-only sources are read as midnight UTC, which can land a few hours
  // ahead of "now" in Sydney. Tolerate a day of skew, reject anything beyond.
  if (posted.getTime() > now.getTime() + DAY_MS) return null;

  const days = Math.max(0, sydneyDayNumber(now) - sydneyDayNumber(posted));
  if (days > RECENT_JOB_MAX_DAYS) return null;

  const label =
    days === 0
      ? "Posted today"
      : days === 1
        ? "Posted yesterday"
        : `Posted ${days} days ago`;

  return { kind: days <= NEW_JOB_MAX_DAYS ? "new" : "recent", days, label };
}
