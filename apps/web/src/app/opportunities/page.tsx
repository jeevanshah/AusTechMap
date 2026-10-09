import type { Metadata } from "next";
import type {
  CandidateProfile,
  OpportunityMatchPreferences,
} from "@austechmap/contracts";

import { auth } from "../../auth";
import { getPool } from "../../lib/db";
import { matchOpportunities } from "../../lib/opportunity/matcher";
import { getActiveSponsoredPlacements } from "../../lib/commercial/sponsored";
import { listWatchlist } from "../../lib/queries/watchlists";
import { applyCandidateProfile } from "../../lib/profile/preferences";
import { getCandidateProfile } from "../../lib/queries/candidateProfiles";
import {
  listActiveSkills,
  listRoleFamilies,
  type RoleFamilyRow,
  type SkillRow,
} from "../../lib/queries/taxonomy";
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
  let initialPreferences = DEFAULT_PREFERENCES;
  let candidateProfile: CandidateProfile | null = null;
  // Only signed-in users see the CV card, so only they need the taxonomy.
  let roleFamilies: RoleFamilyRow[] = [];
  let taxonomySkills: SkillRow[] = [];
  if (userId) {
    try {
      const watchlist = await listWatchlist(pool, userId);
      watchedCompanyIds = watchlist
        .filter((w) => w.entityType === "company" && w.companyId)
        .map((w) => w.companyId as string);
    } catch {
      watchedCompanyIds = [];
    }

    try {
      candidateProfile = await getCandidateProfile(pool, userId);
      if (candidateProfile) {
        initialPreferences = applyCandidateProfile(
          DEFAULT_PREFERENCES,
          candidateProfile,
        );
      }
    } catch {
      // Fall back to DEFAULT_PREFERENCES if the profile can't be loaded.
    }

    try {
      [roleFamilies, taxonomySkills] = await Promise.all([
        listRoleFamilies(pool),
        listActiveSkills(pool),
      ]);
    } catch {
      // The page works without the CV card if the taxonomy can't be loaded.
    }
  }

  const [initialResponse, initialPromotedPlacements] = await Promise.all([
    matchOpportunities(pool, initialPreferences),
    getActiveSponsoredPlacements(pool, {
      roleFamily: initialPreferences.roleFamily,
    }),
  ]);

  const safeUser = session?.user?.id
    ? {
        id: Number(session.user.id),
        email: session.user.email ?? "",
      }
    : null;

  return (
    <OpportunityMatcherShell
      initialResponse={initialResponse}
      initialPreferences={initialPreferences}
      initialPromotedPlacements={initialPromotedPlacements}
      user={safeUser}
      watchedCompanyIds={watchedCompanyIds}
      initialCandidateProfile={candidateProfile}
      roleFamilies={roleFamilies}
      taxonomySkills={taxonomySkills}
    />
  );
}
