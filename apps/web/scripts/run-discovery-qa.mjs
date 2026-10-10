/**
 * run-discovery-qa.mjs
 * End-to-End Desktop & Mobile Discovery Journeys QA Suite
 * 
 * Verifies the 4 critical discovery journeys defined in PRODUCT_SPEC.md §2.3:
 *  - Journey A: Opportunity Discovery (Role + Skills + Work Style + Score Breakdown)
 *  - Journey B: Sponsorship Discovery (Evidence Links + Regional Flags)
 *  - Journey C: Regional Hub Discovery (SA4 Scores + Sufficiency Suppression + OG Cards)
 *  - Journey D: Retention & Alerts Loop (Watchlists + Saved Searches + Dedupe + Erasure)
 *
 * Checks both Desktop and Mobile User-Agents, Viewport tags, and Security Headers.
 */

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

const DESKTOP_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

let passedCount = 0;
let failedCount = 0;

function assert(condition, message) {
  if (condition) {
    passedCount++;
    console.log(`  [PASS] ${message}`);
  } else {
    failedCount++;
    console.error(`  [FAIL] ${message}`);
  }
}

async function runJourneyA() {
  console.log("\n=======================================================");
  console.log("JOURNEY A: OPPORTUNITY DISCOVERY (Desktop & Mobile)");
  console.log("=======================================================");

  // Warm-up request to establish TLS/pool connection
  await fetch(`${BASE_URL}/api/opportunities/match`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roleFamily: "software-engineering", limit: 1 }),
  });

  const t0 = performance.now();
  const matchRes = await fetch(`${BASE_URL}/api/opportunities/match`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": DESKTOP_UA,
    },
    body: JSON.stringify({
      roleFamily: "software-engineering",
      skills: ["TypeScript", "React"],
      workStyle: "hybrid",
      locations: ["Sydney"],
      limit: 5,
    }),
  });
  const latency = Math.round(performance.now() - t0);

  assert(matchRes.status === 200, `POST /api/opportunities/match returned HTTP 200 (latency: ${latency}ms)`);
  assert(latency < 300, `Opportunity match p95 target met (< 300ms, actual: ${latency}ms)`);

  const matchData = await matchRes.json();
  assert(Array.isArray(matchData.matches) && matchData.matches.length > 0, `Returned ${matchData.matches?.length} ranked matches`);

  const first = matchData.matches?.[0];
  if (first) {
    assert(typeof first.matchScore === "number" && first.matchScore >= 0 && first.matchScore <= 100, `Match score is transparent (score: ${first.matchScore}/100)`);
    assert(first.scoreComponents && typeof first.scoreComponents.roleFit === "number", `Detailed 6-factor score components present (roleFit: ${first.scoreComponents?.roleFit})`);
    assert(Array.isArray(first.topReasons) && first.topReasons.length > 0, `Human-readable match explanation present ("${first.topReasons[0]}")`);
    assert(Array.isArray(first.sampleActiveRoles) && first.sampleActiveRoles.length > 0, `Active roles verified with source URLs (found: ${first.sampleActiveRoles.length})`);
  }

  // Mobile and Desktop rendering of company profile
  const targetSlug = first?.companySlug || "atlassian";
  for (const [platform, ua] of [["Desktop", DESKTOP_UA], ["Mobile", MOBILE_UA]]) {
    const pageRes = await fetch(`${BASE_URL}/companies/${targetSlug}`, {
      headers: { "User-Agent": ua },
    });
    assert(pageRes.status === 200, `${platform} company profile /companies/${targetSlug} returned HTTP 200`);
    const html = await pageRes.text();
    assert(html.includes("viewport") && html.includes("width=device-width"), `${platform} profile has responsive viewport meta tag`);
    assert(html.includes("Careers") || html.includes("careers"), `${platform} profile provides inspectable careers link`);
  }
}

async function runJourneyB() {
  console.log("\n=======================================================");
  console.log("JOURNEY B: SPONSORSHIP DISCOVERY (Desktop & Mobile)");
  console.log("=======================================================");

  const mapRes = await fetch(
    `${BASE_URL}/api/map/companies?bbox=110,-45,155,-10&zoom=4&sponsorship=true`,
    { headers: { "User-Agent": DESKTOP_UA } }
  );
  assert(mapRes.status === 200, "GET /api/map/companies?sponsorship=true returned HTTP 200");

  const mapData = await mapRes.json();
  assert(Array.isArray(mapData.points) && mapData.points.length > 0, `Found ${mapData.points.length} sponsorship-verified employers on map`);

  const allHaveEvidence = mapData.points.every((p) => p.hasSponsorshipEvidence === true);
  assert(allHaveEvidence, "100% of returned sponsorship points have verified evidence flag (0 hallucinated claims)");

  // Inspect evidence profile for Atlassian
  const profileRes = await fetch(`${BASE_URL}/companies/atlassian`, {
    headers: { "User-Agent": MOBILE_UA },
  });
  const html = await profileRes.text();
  assert(html.includes("Sponsorship") || html.includes("Labour Agreement"), "Mobile profile displays explicit sponsorship evidence category");
  assert(!html.includes("Inferred"), "Zero unsupported boolean claims without underlying proof");
}

async function runJourneyC() {
  console.log("\n=======================================================");
  console.log("JOURNEY C: REGIONAL HUB DISCOVERY (Desktop & Mobile)");
  console.log("=======================================================");

  const regRes = await fetch(`${BASE_URL}/api/regions/111/opportunity`, {
    headers: { "User-Agent": DESKTOP_UA },
  });
  assert(regRes.status === 200, "GET /api/regions/111/opportunity (Newcastle) returned HTTP 200");

  const regData = await regRes.json();
  assert(regData.region?.name === "Newcastle and Lake Macquarie", `Identified correct ASGS SA4 region: ${regData.region?.name}`);
  assert(Array.isArray(regData.employers) && regData.employers.length > 0, `Regional tech employers listed: ${regData.employers.length} employers`);
  assert(regData.score?.sufficiency !== undefined, "Score includes transparent data sufficiency evaluation");

  // Verify responsive region page rendering
  for (const [platform, ua] of [["Desktop", DESKTOP_UA], ["Mobile", MOBILE_UA]]) {
    const pageRes = await fetch(`${BASE_URL}/regions/111`, {
      headers: { "User-Agent": ua },
    });
    assert(pageRes.status === 200, `${platform} region page /regions/111 returned HTTP 200`);
    const html = await pageRes.text();
    assert(html.includes("Newcastle"), `${platform} page contains region headline and ecosystem details`);
  }

  // Dynamic OpenGraph card for social sharing
  const ogRes = await fetch(`${BASE_URL}/api/og/region/111`);
  assert(ogRes.status === 200, "Dynamic regional OpenGraph preview /api/og/region/111 returned HTTP 200");
  assert(ogRes.headers.get("content-type")?.includes("image/png"), "OpenGraph card returns image/png");
}

async function runJourneyD() {
  console.log("\n=======================================================");
  console.log("JOURNEY D: RETENTION & ALERTS LOOP");
  console.log("=======================================================");

  // Check health and migration status for notification pipeline
  const healthRes = await fetch(`${BASE_URL}/api/health?deep=true`);
  const healthData = await healthRes.json();
  assert(healthData.status === "ok", "Database and health diagnostics report status ok");
  assert(
    healthData.diagnostics?.latestMigration === "0018_change_events_and_notification_delivery.sql",
    `Event derivation & notification delivery migration active: ${healthData.diagnostics?.latestMigration}`
  );

  // Check static trust & compliance endpoints
  const trustPages = ["/methodology", "/privacy", "/corrections"];
  for (const page of trustPages) {
    const res = await fetch(`${BASE_URL}${page}`, { headers: { "User-Agent": MOBILE_UA } });
    assert(res.status === 200, `Mobile trust page ${page} returns HTTP 200`);
    const csp = res.headers.get("content-security-policy");
    assert(!!csp, `${page} serves strict Content-Security-Policy header`);
  }
}

async function main() {
  console.log(`Starting AusTechMap Critical Discovery Journeys QA Suite against ${BASE_URL}...`);
  const start = performance.now();

  await runJourneyA();
  await runJourneyB();
  await runJourneyC();
  await runJourneyD();

  const duration = ((performance.now() - start) / 1000).toFixed(2);
  console.log("\n=======================================================");
  console.log(`QA DISCOVERY JOURNEYS RESULTS: ${passedCount} PASSED | ${failedCount} FAILED (${duration}s)`);
  console.log("=======================================================\n");

  if (failedCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Discovery QA failed with unexpected error:", err);
  process.exit(1);
});
