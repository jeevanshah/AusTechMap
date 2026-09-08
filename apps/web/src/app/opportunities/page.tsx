import type { Metadata } from "next";
import type { OpportunityMatchPreferences } from "@austechmap/contracts";

import { auth } from "../../auth";
import { getPool } from "../../lib/db";
import { matchOpportunities } from "../../lib/opportunity/matcher";
import { listWatchlist } from "../../lib/queries/watchlists";
import { OpportunityMatcherShell } from "../../components/opportunity/OpportunityMatcherShell";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Opportunity Match · Australia Tech Map",
  description:
    "Evidence-based Opportunity Matching across Australian technology employers. Sourced role, skill, location, and visa sponsorship alignment.",
};

const DEFAULT_PREFERENCES: OpportunityMatchPreferences = {
  roleFamily: "software-engineering",
  skills: ["TypeScript", "React"],
  experienceBand: "any",
  locations: [],
  locationRequired: false,
  workStyle: "any",
  workStyleRequired: false,
  requiresSponsorship: false,
  prefersRegional: false,
  limit: 25,
};

export default async function OpportunitiesPage() {
  const pool = getPool();
  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;

  let watchedCompanyIds: string[] = [];
  if (userId) {
    try {
      const watchlist = await listWatchlist(pool, userId);
      watchedCompanyIds = watchlist
        .filter((w) => w.entityType === "company" && w.companyId)
        .map((w) => w.companyId as string);
    } catch {
      watchedCompanyIds = [];
    }
  }

  const initialResponse = await matchOpportunities(pool, DEFAULT_PREFERENCES);

  const safeUser = session?.user?.id
    ? {
        id: Number(session.user.id),
        email: session.user.email ?? "",
      }
    : null;

  return (
    <OpportunityMatcherShell
      initialResponse={initialResponse}
      initialPreferences={DEFAULT_PREFERENCES}
      user={safeUser}
      watchedCompanyIds={watchedCompanyIds}
    />
  );
}
