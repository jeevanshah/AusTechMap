import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireUser } from "../../../lib/auth/require-role";
import { UnauthenticatedError } from "../../../lib/auth/errors";
import { getPool } from "../../../lib/db";
import { listJobApplications } from "../../../lib/queries/jobApplications";
import { listSavedSearches } from "../../../lib/queries/savedSearches";
import { listWatchlist } from "../../../lib/queries/watchlists";
import { listUserAlerts } from "../../../lib/queries/userAlerts";
import { getCandidateProfile } from "../../../lib/queries/candidateProfiles";
import { getEmailSuppression } from "../../../lib/queries/emailSuppressions";
import {
  listActiveSkills,
  listRoleFamilies,
} from "../../../lib/queries/taxonomy";
import { AccountView } from "./AccountView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Account · Australia Tech Map",
  description:
    "Manage your candidate profile, private Job Vault, application progress, saved searches, employer watchlists, and opportunity alerts.",
  robots: { index: false },
};

const ACCOUNT_TABS = [
  "profile",
  "applications",
  "searches",
  "watchlist",
  "alerts",
  "security",
] as const;

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tab } = await searchParams;
  const initialTab = ACCOUNT_TABS.find((t) => t === tab);
  let actor;
  try {
    actor = await requireUser();
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/sign-in?callbackUrl=/account");
    }
    throw error;
  }

  const pool = getPool();
  const [
    applications,
    savedSearches,
    watchlist,
    alertsData,
    candidateProfile,
    roleFamilies,
    taxonomySkills,
    emailSuppression,
  ] = await Promise.all([
    listJobApplications(pool, actor.id),
    listSavedSearches(pool, actor.id),
    listWatchlist(pool, actor.id),
    listUserAlerts(pool, actor.id),
    // The profile panel is an add-on: if its table is unavailable (e.g. a
    // deploy that lands before migration 0027), don't take down the Job
    // Vault, alerts, and everything else on this page.
    getCandidateProfile(pool, actor.id).catch((error: unknown) => {
      console.error(
        "getCandidateProfile failed:",
        error instanceof Error ? error.name : "unknown error",
      );
      return null;
    }),
    listRoleFamilies(pool),
    listActiveSkills(pool),
    // Like the profile, tolerate a deploy that lands before migration 0028.
    getEmailSuppression(pool, actor.id).catch((error: unknown) => {
      console.error(
        "getEmailSuppression failed:",
        error instanceof Error ? error.name : "unknown error",
      );
      return null;
    }),
  ]);

  return (
    <main className="min-h-screen bg-canvas">
      <AccountView
        user={actor}
        initialApplications={applications}
        initialSavedSearches={savedSearches}
        initialWatchlist={watchlist}
        initialAlerts={alertsData}
        initialCandidateProfile={candidateProfile}
        roleFamilies={roleFamilies}
        taxonomySkills={taxonomySkills}
        initialTab={initialTab}
        emailUnsubscribed={emailSuppression === "unsubscribed"}
      />
    </main>
  );
}
