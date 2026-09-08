#!/usr/bin/env node

/**
 * Phase 7 Retention Pipeline Runner
 *
 * Usage:
 *   node --env-file=apps/web/.env.local apps/web/scripts/run-retention-pipeline.mjs [--dry-run] [--frequency=daily|weekly|all]
 */

import { Pool } from "pg";
import { deriveChangeEvents } from "../src/lib/retention/eventDeriver.ts";
import { matchEventsToSubscribers } from "../src/lib/retention/alertMatcher.ts";
import { sendEmailDigests } from "../src/lib/retention/digestSender.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Error: DATABASE_URL environment variable is required.");
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const freqArg = args.find((a) => a.startsWith("--frequency="))?.split("=")[1] || "all";

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  console.log("=== Australia Tech Map Retention Pipeline ===");
  console.log(`Mode: ${dryRun ? "DRY RUN (no emails dispatched)" : "LIVE"}`);
  console.log(`Frequency target: ${freqArg}\n`);

  // 1. Derive Change Events
  console.log("1. Deriving change events from observations...");
  const eventStats = await deriveChangeEvents(pool);
  console.log(`   - Jobs derived: ${eventStats.jobsDerived}`);
  console.log(`   - Sponsorship derived: ${eventStats.sponsorshipDerived}`);
  console.log(`   - Locations derived: ${eventStats.locationsDerived}`);
  console.log(`   Total new events: ${eventStats.totalDerived}\n`);

  // 2. Match Events to Subscribers
  console.log("2. Matching events to active watchlists and saved searches...");
  const alertStats = await matchEventsToSubscribers(pool);
  console.log(`   - Watchlist alerts created: ${alertStats.watchlistAlertsCreated}`);
  console.log(`   - Saved search alerts created: ${alertStats.savedSearchAlertsCreated}`);
  console.log(`   Total new in-app alerts: ${alertStats.totalAlertsCreated}\n`);

  // 3. Dispatch Email Digests
  if (freqArg === "daily" || freqArg === "all") {
    console.log("3a. Processing DAILY email digests...");
    const dailyRes = await sendEmailDigests(pool, { frequency: "daily", dryRun });
    console.log(`   - Users processed: ${dailyRes.usersProcessed}`);
    console.log(`   - Emails sent: ${dailyRes.emailsSent}`);
    console.log(`   - Events delivered: ${dailyRes.eventsDelivered}`);
    if (dailyRes.errors.length > 0) {
      console.warn(`   ! Errors: ${dailyRes.errors.join("; ")}`);
    }
  }

  if (freqArg === "weekly" || freqArg === "all") {
    console.log("\n3b. Processing WEEKLY email digests...");
    const weeklyRes = await sendEmailDigests(pool, { frequency: "weekly", dryRun });
    console.log(`   - Users processed: ${weeklyRes.usersProcessed}`);
    console.log(`   - Emails sent: ${weeklyRes.emailsSent}`);
    console.log(`   - Events delivered: ${weeklyRes.eventsDelivered}`);
    if (weeklyRes.errors.length > 0) {
      console.warn(`   ! Errors: ${weeklyRes.errors.join("; ")}`);
    }
  }

  console.log("\n=== Retention Pipeline Complete ===");
  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error in retention pipeline:", err);
  pool.end();
  process.exit(1);
});
