export { auth as proxy } from "./auth";

/**
 * Next.js 16 renamed `middleware.ts` -> `proxy.ts` (verified against
 * node_modules/next/dist/docs, not assumed from training data). This is a
 * thin, non-authoritative UX redirect for anonymous /admin visits only --
 * the vendored docs' own proxy.md warns "a matcher change... can silently
 * remove Proxy coverage; always verify authentication and authorization
 * inside each Server Function rather than relying on Proxy alone," which
 * matches ARCHITECTURE_DECISIONS.md §4.1's "hiding navigation is not
 * access control" line exactly. Real enforcement is
 * lib/auth/require-role.ts, called independently from every /admin page,
 * layout, and server action.
 */
export const config = {
  matcher: ["/admin/:path*"],
};
