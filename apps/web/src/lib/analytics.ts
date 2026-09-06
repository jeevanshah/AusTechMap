/**
 * Thin, provider-agnostic instrumentation seam. No PostHog account exists
 * yet (ARCHITECTURE_DECISIONS.md §3.9 names PostHog, but nothing is wired
 * up) -- rather than add the posthog-js dependency and force a signup
 * decision now, this logs to the console (opt-in, via
 * NEXT_PUBLIC_ANALYTICS_DEBUG) so the real call sites exist and are
 * exercised today. Swapping the body for a real posthog-js `.capture()`
 * call later is a small, isolated change once an account exists.
 */

export type AnalyticsEvent =
  | "search_submitted"
  | "map_company_clicked"
  | "company_profile_viewed"
  | "careers_link_clicked"
  | "regional_hub_selected";

export function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
): void {
  if (process.env.NEXT_PUBLIC_ANALYTICS_DEBUG !== "true") return;
  console.debug(`[analytics] ${event}`, properties ?? {});
}
