/**
 * Safety limits for change events and notifications (PRODUCT_SPEC §18.5,
 * Appendix D.3). Alerts must be sparse and fresh: a brand-new saved search or
 * a freshly onboarded employer must never produce an alert storm from history.
 */

/** Change events (and the alerts built from them) older than this are ignored. */
export const ALERT_EVENT_MAX_AGE_HOURS = 48;

/** A repost with an old ATS posted date is not "new": skip if older than this. */
export const DERIVE_POSTED_MAX_AGE_DAYS = 14;

/**
 * Jobs first seen within this window of their source's earliest job belong to
 * the onboarding/baseline crawl, not to "a new role appeared".
 */
export const BASELINE_GRACE_MINUTES = 30;

/** In-app alerts created per user per pipeline run. */
export const IN_APP_ALERTS_PER_USER_PER_RUN = 20;

/** How far back each email frequency may look for undelivered events. */
export const DIGEST_LOOKBACK_HOURS = {
  daily: 48,
  weekly: 8 * 24,
  instant: ALERT_EVENT_MAX_AGE_HOURS,
} as const;

/** Employer groups shown in one email; the rest wait for the next one. */
export const DIGEST_MAX_ITEMS = 25;

/** Separate instant emails a user can receive per rolling 24 hours. */
export const INSTANT_EMAILS_PER_DAY = 3;

/**
 * The slice of a pg Pool / PoolClient the retention pipeline needs. Lets the
 * dry run use a rolled-back transaction client and tests use an in-process
 * Postgres.
 */
export interface Queryable {
  query<R extends import("pg").QueryResultRow = import("pg").QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: R[] }>;
}
