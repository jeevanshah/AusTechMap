#!/usr/bin/env node

/**
 * Golden Query Relevance & Constraint Evaluation Suite
 *
 * Runs the Phase 7 Golden Queries against the live database and Opportunity Match engine.
 *
 * Usage:
 *   node --env-file=apps/web/.env.local apps/web/scripts/evaluate-golden-queries.mjs
 */

import { Pool } from "pg";
import { evaluateAllGoldenQueries } from "../src/lib/evaluation/goldenQueries.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Error: DATABASE_URL environment variable is required.");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  console.log("================================================================================");
  console.log("             AUSTRALIA TECH MAP — GOLDEN QUERY EVALUATION SUITE                 ");
  console.log("               Phase 7 Exit Gate: docs/golden-queries.md                        ");
  console.log("================================================================================\n");

  const start = performance.now();
  const report = await evaluateAllGoldenQueries(pool);
  const duration = Math.round(performance.now() - start);

  console.log("--------------------------------------------------------------------------------");
  console.log("| ID     | Query Name                                | Latency | Grade | Status ");
  console.log("--------------------------------------------------------------------------------");

  for (const r of report.results) {
    const paddedId = r.id.padEnd(6);
    const paddedName = r.name.slice(0, 41).padEnd(41);
    const paddedLat = `${r.latencyMs}ms`.padStart(7);
    const gradeStr = `G${r.grade}`.padStart(5);
    const statusStr = r.passed ? " \x1b[32mPASS\x1b[0m" : " \x1b[31mFAIL\x1b[0m";
    console.log(`| ${paddedId} | ${paddedName} | ${paddedLat} | ${gradeStr} |${statusStr}  |`);
    if (!r.passed || r.violations > 0) {
      console.log(`|        └─> [Violation] ${r.reason}`);
    }
  }

  console.log("--------------------------------------------------------------------------------\n");
  console.log("EVALUATION SUMMARY:");
  console.log(`• Total Golden Queries:     ${report.totalQueries}`);
  console.log(`• Passed:                   ${report.passedCount} / ${report.totalQueries} (${Math.round((report.passedCount / report.totalQueries) * 100)}%)`);
  console.log(`• Hard Constraint Violations: ${report.totalViolations} (Target: 0)`);
  console.log(`• Average Query Latency:    ${report.avgLatencyMs}ms`);
  console.log(`• Total Suite Duration:     ${duration}ms\n`);

  if (report.totalViolations === 0 && report.failedCount === 0) {
    console.log("\x1b[32m✔ PHASE 7 GOLDEN QUERY RELEASE GATE PASSED.\x1b[0m\n");
  } else {
    console.log("\x1b[31m✘ PHASE 7 GOLDEN QUERY RELEASE GATE FAILED.\x1b[0m\n");
    process.exit(1);
  }

  await pool.end();
}

main().catch((err) => {
  console.error("Fatal error running golden query evaluation:", err);
  pool.end();
  process.exit(1);
});
