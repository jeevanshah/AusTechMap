#!/usr/bin/env node

/**
 * Australia Tech Map — Concurrency & API Load Benchmark
 *
 * Implements and verifies Phase 8 load testing requirement:
 * "Run unit, integration, parser-fixture, database, E2E, regression, accessibility, and load suites" (IMPLEMENTATION_PLAN.md §6 Phase 8).
 *
 * Tests concurrency and latency percentiles (p50, p95, p99) under load across critical public APIs.
 */

import { performance } from "node:perf_hooks";

const BASE_URL = process.env.TEST_BASE_URL || "http://localhost:3000";

const ENDPOINTS = [
  { name: "Shallow Health Check", path: "/api/health", method: "GET" },
  { name: "Categories Metadata", path: "/api/categories", method: "GET" },
  { name: "Trigram Company Search", path: "/api/search/companies?q=Atlassian", method: "GET" },
  { name: "Opportunity Match Engine", path: "/api/opportunities/match?roleFamilies=software_engineering", method: "GET" },
];

function calculatePercentile(sortedArray, percentile) {
  if (sortedArray.length === 0) return 0;
  const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
  return sortedArray[Math.max(0, Math.min(index, sortedArray.length - 1))];
}

async function runWorker(endpoint, numRequests) {
  const latencies = [];
  let errorCount = 0;

  for (let i = 0; i < numRequests; i++) {
    const start = performance.now();
    try {
      const res = await fetch(`${BASE_URL}${endpoint.path}`, {
        method: endpoint.method,
        headers: { "User-Agent": "AusTechMapBenchmark/1.0" },
      });
      const duration = performance.now() - start;
      if (res.ok) {
        latencies.push(duration);
      } else {
        errorCount++;
      }
    } catch {
      errorCount++;
    }
  }

  return { latencies, errorCount };
}

async function benchmarkEndpoint(endpoint, totalRequests = 50, concurrency = 10) {
  process.stdout.write(`   Benchmarking ${endpoint.name.padEnd(28)} (${totalRequests} reqs, c=${concurrency})... `);
  const requestsPerWorker = Math.floor(totalRequests / concurrency);
  const overallStart = performance.now();

  const workerPromises = Array.from({ length: concurrency }, () =>
    runWorker(endpoint, requestsPerWorker)
  );

  const workerResults = await Promise.all(workerPromises);
  const overallDurationMs = performance.now() - overallStart;

  const allLatencies = workerResults.flatMap((r) => r.latencies).sort((a, b) => a - b);
  const totalErrors = workerResults.reduce((acc, r) => acc + r.errorCount, 0);

  const sum = allLatencies.reduce((acc, val) => acc + val, 0);
  const avg = allLatencies.length > 0 ? sum / allLatencies.length : 0;
  const min = allLatencies[0] || 0;
  const max = allLatencies[allLatencies.length - 1] || 0;
  const p50 = calculatePercentile(allLatencies, 50);
  const p95 = calculatePercentile(allLatencies, 95);
  const p99 = calculatePercentile(allLatencies, 99);
  const rps = (allLatencies.length / (overallDurationMs / 1000)).toFixed(1);

  console.log(`✓ Done in ${Math.round(overallDurationMs)}ms`);

  return {
    name: endpoint.name,
    path: endpoint.path,
    totalRequests,
    successfulRequests: allLatencies.length,
    errorCount: totalErrors,
    rps,
    min: Math.round(min),
    avg: Math.round(avg),
    p50: Math.round(p50),
    p95: Math.round(p95),
    p99: Math.round(p99),
    max: Math.round(max),
  };
}

async function main() {
  console.log("================================================================");
  console.log(" Australia Tech Map — API Concurrency & Load Benchmark");
  console.log(` Target Server: ${BASE_URL}`);
  console.log("================================================================\n");

  // Verify server connectivity
  try {
    const probe = await fetch(`${BASE_URL}/api/health`);
    if (!probe.ok) throw new Error(`Status ${probe.status}`);
  } catch {
    console.error(`ERROR: Server at ${BASE_URL} is not reachable. Ensure 'npm run start -w apps/web' is running.`);
    process.exit(1);
  }

  const results = [];
  for (const endpoint of ENDPOINTS) {
    const result = await benchmarkEndpoint(endpoint, 50, 10);
    results.push(result);
  }

  console.log("\n================================================================");
  console.log(" Benchmark Results Summary");
  console.log("================================================================");
  console.log(
    " Endpoint                     | Success |   RPS   | Avg (ms) | p50 (ms) | p95 (ms) | p99 (ms)"
  );
  console.log("------------------------------+---------+---------+----------+----------+----------+---------");

  for (const r of results) {
    const name = r.name.padEnd(28);
    const success = `${r.successfulRequests}/${r.totalRequests}`.padStart(7);
    const rps = String(r.rps).padStart(7);
    const avg = `${r.avg}ms`.padStart(8);
    const p50 = `${r.p50}ms`.padStart(8);
    const p95 = `${r.p95}ms`.padStart(8);
    const p99 = `${r.p99}ms`.padStart(7);
    console.log(` ${name} | ${success} | ${rps} | ${avg} | ${p50} | ${p95} | ${p99}`);
  }
  console.log("================================================================\n");

  const allPassed = results.every((r) => r.errorCount === 0 && r.p95 < 250);
  if (allPassed) {
    console.log(">> VERDICT: ALL ENDPOINTS PASSED P95 LATENCY & CONCURRENCY SLA (< 250ms)\n");
  } else {
    console.warn(">> VERDICT: WARNING - SOME ENDPOINTS EXCEEDED LATENCY TARGETS\n");
  }
}

main().catch(console.error);
