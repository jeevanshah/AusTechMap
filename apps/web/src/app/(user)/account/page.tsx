import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { requireUser } from "../../../lib/auth/require-role";
import { UnauthenticatedError } from "../../../lib/auth/errors";
import { getPool } from "../../../lib/db";
import { listSavedSearches } from "../../../lib/queries/savedSearches";
import { listWatchlist } from "../../../lib/queries/watchlists";
import { listUserAlerts } from "../../../lib/queries/userAlerts";
import { AccountView } from "./AccountView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Account · Australia Tech Map",
  description: "Manage saved searches, employer watchlists, and opportunity alerts.",
  robots: { index: false },
};

export default async function AccountPage() {
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
  const [savedSearches, watchlist, alertsData] = await Promise.all([
    listSavedSearches(pool, actor.id),
    listWatchlist(pool, actor.id),
    listUserAlerts(pool, actor.id),
  ]);

  return (
    <main className="min-h-screen bg-canvas">
      <AccountView
        user={actor}
        initialSavedSearches={savedSearches}
        initialWatchlist={watchlist}
        initialAlerts={alertsData}
      />
    </main>
  );
}
