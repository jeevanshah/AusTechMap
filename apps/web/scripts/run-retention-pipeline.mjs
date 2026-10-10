#!/usr/bin/env node

/**
 * Phase 7 Retention Pipeline Runner
 *
 * Usage:
 *   node --env-file=apps/web/.env.local apps/web/scripts/run-retention-pipeline.mjs [--dry-run] [--frequency=instant|daily|weekly|all]
 *
 * --dry-run runs every step inside one transaction that is always rolled
 * back: it reports what WOULD be derived, alerted and emailed, writes nothing
 * and sends nothing. Scheduled runs pass a single --frequency so each email
 * window is processed once; "all" runs instant, daily and weekly.
 */

import { Pool } from "pg";
import { deriveChangeEvents } from "../src/lib/retention/eventDeriver.ts";
import { matchEventsToSubscribers } from "../src/lib/retention/alertMatcher.ts";
import { matchEventsToProfiles } from "../src/lib/retention/profileAlertMatcher.ts";
import { sendEmailDigests } from "../src/lib/retention/digestSender.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Error: DATABASE_URL environment variable is required.");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const freqArg =
  args.find((a) => a.startsWith("--frequency="))?.split("=")[1] || "all";
const FREQUENCIES = ["instant", "daily", "weekly"];

if (freqArg !== "all" && !FREQUENCIES.includes(freqArg)) {
  console.error(
    `Error: unknown --frequency=${freqArg} (use instant, daily, weekly or all).`,
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function run(db) {
  // 1. Derive Change Events
  console.log("1. Deriving change events from observations...");
  const eventStats = await deriveChangeEvents(db);
  console.log(`   - Jobs derived: ${eventStats.jobsDerived}`);
  console.log(`   - Sponsorship derived: ${eventStats.sponsorshipDerived}`);
  console.log(`   - Locations derived: ${eventStats.locationsDerived}`);
  console.log(`   Total new events: ${eventStats.totalDerived}\n`);

  // 2. Match Events to Subscribers
  console.log("2. Matching events to active watchlists and saved searches...");
  const alertStats = await matchEventsToSubscribers(db);
  console.log(
    `   - Watchlist alerts created: ${alertStats.watchlistAlertsCreated}`,
  );
  console.log(
    `   - Saved search alerts created: ${alertStats.savedSearchAlertsCreated}`,
  );
  console.log(`   Total new in-app alerts: ${alertStats.totalAlertsCreated}\n`);

  console.log("2b. Matching new roles to opted-in candidate profiles...");
  const profileStats = await matchEventsToProfiles(db);
  console.log(`   - Profiles considered: ${profileStats.profilesConsidered}`);
  console.log(`   - Profile alerts created: ${profileStats.alertsCreated}
`);

  // 3. Email digests
  let failed = false;
  const frequencies = freqArg === "all" ? FREQUENCIES : [freqArg];
  for (const frequency of frequencies) {
    console.log(`3. Processing ${frequency.toUpperCase()} email digests...`);
    const res = await sendEmailDigests(db, { frequency, dryRun });
    console.log(`   - Users processed: ${res.usersProcessed}`);
    console.log(`   - Emails sent: ${res.emailsSent}`);
    if (dryRun)
      console.log(`   - Emails that would be sent: ${res.emailsWouldSend}`);
    console.log(`   - Events delivered: ${res.eventsDelivered}`);
    if (res.errors.length > 0) {
      console.warn(`   ! Errors: ${res.errors.join("; ")}`);
      failed = true;
    }
  }
  return failed;
}

async function main() {
  console.log("=== Australia Tech Map Retention Pipeline ===");
  console.log(
    `Mode: ${dryRun ? "DRY RUN (rolled back; nothing written or sent)" : "LIVE"}`,
  );
  console.log(`Frequency target: ${freqArg}\n`);

  let failed;
  if (dryRun) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      failed = await run(client);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  } else {
    failed = await run(pool);
  }

  console.log("\n=== Retention Pipeline Complete ===");
  await pool.end();
  if (failed) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Fatal error in retention pipeline:", err);
  pool.end();
  process.exit(1);
});
