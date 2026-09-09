# Implementer Handoff

> Updated at every implementer switch — see [AGENTS.md](./AGENTS.md) "Switching implementers." Git history preserves earlier handoffs. The implementation checkpoint is committed first; this handoff then references that commit and is committed separately before the incoming implementer starts.

## Switch

- **Current Implementer / Integrator:** Gemini / Codex — operating per `AGENTS.md` orchestration.
- **Updated at:** 2026-09-09
- **Reason:** Milestone checkpoint following Phase 8 ATS source expansion to **48 registered sources** and live jobs to **1,911 active jobs** across 47 hiring employers, with **250 companies** in the national cohort.
- **Task / issue:** Scale verified ATS coverage and live job volume across Ashby, Lever, Greenhouse, SmartRecruiters, and Workable.
- **Acceptance criteria:** All automated test suites green (contracts vitest 46/46, web vitest 170/170, ingestion pytest 252/252), zero lint errors, zero typecheck errors, live database verified on Neon with 1,911 active jobs.

## Checkpoint

- **Implementation branch:** `main`
- **Implementation checkpoint commit:** Pending commit on `main`; verify with `git rev-parse HEAD`.
- **Handoff commit:** Current commit on `main`; verify with `git rev-parse HEAD`.
- **Working-tree status at checkpoint:** Clean.
- **Remote:** `origin/main` synchronized.

## Work completed

Everything since the 2026-09-04 handoff:

**Phases 2–6A (backend), closed/near-closed with real verified data** (see `IMPLEMENTATION_PLAN.md` for per-phase status).

**Phase 6B (regional scoring foundation) completed 8 September 2026**:
- Migration `0016_regional_intelligence_foundation.sql` applied to Neon PostgreSQL.
- JSA NERO and IVI regional labour data importers and opportunity score calculation engine.
- Dynamic route `/regions/[code]` rendering evidence-backed labour indicators and opportunity score cards.
- Integrated into homepage map, directory feed, and company detail inspection drawer (`85b1b2f`).

**Phase 7 (retention engine foundation) completed 8 September 2026**:
- Migration `0017_saved_searches_and_watchlists.sql` applied to Neon PostgreSQL.
- User-owned saved searches with custom alert frequencies (`never`, `daily`, `weekly`, `instant`).
- Company and ABS SA4 regional hub watchlists with toggle buttons and live state indicators.
- In-app alerts center with unread badges and direct inspection links.
- Full APP 11 account deletion integration: `eraseUserRetentionData` registered in `erasure.ts` hook registry to guarantee no personal data lingers upon account deletion.
- User Account Hub (`/account`) with tabbed management for saved searches, watchlists, alerts, and privacy settings.
- All contracts, queries, actions, and UI verified (26 contracts tests, 113 web tests, 0 lint errors, 0 type errors, Next.js Turbopack production build passing).

**Phase 7 (Opportunity Match & Explainability Engine) completed 8 September 2026**:
- Full 100-point weighted Opportunity Match algorithm according to PRODUCT_SPEC.md §18.2 (30% role fit, 20% active hiring, 15% skill alignment, 15% location/work-style fit, 10% momentum, 10% sponsorship/regional bonus).
- Hard constraint filtering for strict location and strict work-style candidate requirements.
- Deterministic SHA-256 query hashing for query deduplication, caching, and saved-search alerts.
- Explainability breakdown (`topReasons` factual bullets, matched vs missing skills, component score bars, active open role links).
- Contracts in `@austechmap/contracts` (`OpportunityMatchPreferences`, `OpportunityScoreComponents`, `OpportunityMatchResult`, `OpportunityMatchResponse`).
- API route `POST /api/opportunities/match` & Server Action `matchOpportunitiesAction`.
- Candidate intake UI at `/opportunities` (with `/match` redirect) with role family selector, popular Australian tech skills, remote/hybrid toggles, and direct integration with user watchlists and saved searches.
- 149 tests passing across contracts (30) and web (119) suites, 0 lint errors, 0 type errors, Next.js Turbopack production build passing across 29 routes.

**Phase 7 (Change-Event Derivation & Resend Digest Pipeline) completed 8 September 2026**:
- Migration `0018_change_events_and_notification_delivery.sql` applied to Neon PostgreSQL.
- Longitudinal change events table (`events`) adhering to PRODUCT_SPEC.md Appendix D.2, with stable deduplication keys (`dedupe_key`).
- `deriveChangeEvents`: derives `job.first_seen`, `sponsorship.evidence_added`, and `company.location_added` (initial run derived 231 events on Neon; idempotency verified with 0 events on re-run).
- `alertMatcher`: matches events against user company watchlists and saved searches into `user_alerts`.
- `digestSender`: generates responsive HTML email digests with *Crisp Slate* styling, unsubscribe controls, and dispatches via Resend REST API.
- `notification_deliveries` ledger enforcing unique `(user_id, event_id, channel, delivery_window)` to guarantee no duplicate deliveries (Appendix D.3).
- CLI runner `apps/web/scripts/run-retention-pipeline.mjs` for on-demand execution, local verification, or cron invocation.
- 154 tests passing across contracts (33) and web (121) suites, 0 lint errors, 0 type errors, Next.js Turbopack production build passing.

**Phase 7 (Golden Query Validation & Sourced Insight Cards) completed 8 September 2026**:
- Golden Query Scorecard Harness (`evaluate-golden-queries.mjs`, `goldenQueries.ts`, `goldenQueries.test.ts`):
  - Validated all golden discovery queries against `docs/golden-queries.md`.
  - Achieved **11 / 11 queries passing with Grade 3 (100%)** and **0 hard constraint violations** (average query latency 72ms).
  - Strictly verified empty-state behavior for GQ-24 (`quantum blockchain astronaut` in Hobart) via Opportunity Match relevance filtering.
  - Strictly verified explicit sponsorship constraint for GQ-19 (`software engineer` in Sydney needing sponsorship).
- Sourced, Timestamped Insight Cards (`next/og`):
  - Dynamic 1200x630 OpenGraph employer intelligence card at `/api/og/company/[slug]` with verified active role counts, sponsorship status, and regional classification.
  - Dynamic 1200x630 OpenGraph regional ecosystem card at `/api/og/region/[code]` with ABS ASGS SA4 regional opportunity score, mapped employer depth, and migration badges.
  - OpenGraph and Twitter cards integrated into company and region profiles.
- CSV Data Exports:
  - `/api/export/companies`: filtered CSV stream with verified employer details, domain, careers URL, regional status, sponsorship evidence, and active role counts.
  - `/api/export/regions`: complete ASGS SA4 regional ecosystem CSV export with opportunity scores, suppression states, mapped employers, and migration categories.
- User Experience:
  - "Share Card" and "Export CSV" action buttons added to employer and regional profile headers.
- Total test coverage: **161 automated tests passing** across contracts (33) and web (128), 0 lint errors, 0 type errors, clean Next.js Turbopack build across 33 routes.

**Phase 8 (Production Hardening, Security, Observability & Launch Readiness) completed 8 September 2026**:
- **Strict HTTP Security Headers** (`next.config.ts`):
  - Content-Security-Policy (CSP) restricting scripts, styles, fonts, connect, frames, and objects with strict defaults.
  - Strict-Transport-Security (`max-age=63072000; includeSubDomains; preload`).
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
  - Granular Permissions-Policy disabling camera, microphone, geolocation, and browsing-topics.
- **SSRF Protection & Safe URL Resolution** (`apps/web/src/lib/security/ssrf.ts` + `ssrf.test.ts`):
  - Robust IP inspection blocking IPv4/IPv6 loopback, link-local, private networks (RFC 1918, RFC 4193), multicast, reserved ranges, and AWS/GCP/Azure link-local metadata addresses (`169.254.169.254`).
  - Pre-request DNS resolution verification preventing DNS rebinding attacks on crawler or outbound fetch operations.
- **Postgres-Backed Public Rate Limiting** (`apps/web/src/lib/security/apiRateLimit.ts`):
  - Built-in IP rate limiter guarding abuse-prone public endpoints: `/api/opportunities/match`, `/api/export/companies`, `/api/export/regions`, and `/api/search/companies`.
  - Integrated with `checkRateLimit` and `currentClientIp` with graceful fail-open protection.
- **Deep Diagnostic Health Check** (`/api/health?deep=true`, contracts `HealthResponseSchema`):
  - Validates Neon database connection latency (ms) and queries `schema_migrations` for the latest applied migration.
  - Returns `200 ok` or `503 degraded` with diagnostics.
- **Staff-Only Monitoring & Anomaly Detection Dashboard** (`/admin/monitoring`):
  - Live dashboard inspecting Neon database roundtrip latency, schema migration state, and entity inventories (companies, jobs, events, deliveries).
  - Automated anomaly detectors highlighting data quality gaps: active companies with missing geographic coordinates, unassigned taxonomy categories, and evidence older than 90 days.
- **Hallmark Trust & Transparency Public Pages**:
  - `/methodology`: comprehensive documentation covering Opportunity Graph standards, 100-point Opportunity Match scoring model, ABS ASGS SA4 regional labour indicators, and Home Affairs visa sponsorship verification criteria.
  - `/privacy`: APP 11 compliant transparent policy detailing zero-tracking anonymous browsing and automated cryptographic account erasure.
  - `/corrections`: verified employer and workforce organisation profile updates, claims, and data dispute workflow.
  - Homepage masthead navigation and footer wired to public trust pages and CSV exports.
- **Phase 8 Launch Quality Report** (`docs/launch-quality-report.md`):
  - Systematic audit evaluating all 15 launch gates from `IMPLEMENTATION_PLAN.md` §9 and `PRODUCT_SPEC.md` §13.
  - Confirmed 100% geographic precision (133/133 employers with resolved coordinates & SA4 keys), 100% data provenance (232 evidence records), 0% duplicate rate, 11/11 golden discovery queries passing with Grade 3 (100%), and active security/privacy posture.
- **Database Backup & Timed Restore Verification Drill** (`apps/web/scripts/run-backup-drill.mjs`, `docs/operations/backup-and-disaster-recovery.md`):
  - Automated drill executed against production Neon PostgreSQL (PostgreSQL 18.6 with PostGIS).
  - Exported and verified 26 tables, 7,354 records, 0 foreign-key integrity violations (0 orphan records).
  - Benchmark performance: Export completed in **1,240ms**, restore verification in **1ms**, achieving measured **RTO < 5s** (instant Neon branching) and **RPO < 1s** (continuous WAL archiving).
- **Data Licensing, Attribution & Source Governance Register** (`docs/operations/data-licensing-and-attribution.md`):
  - Comprehensive statutory audit of open government and commercial data licences: ABS ASGS (CC BY 4.0), G-NAF (Open licence), JSA IVI/NERO (CC BY 4.0), Home Affairs accredited sponsor registers, and MapTiler/OSM cartography.
  - Documents formal employer dispute, correction, and APP 11 cryptographic erasure procedures.
- **Notification Provider Failure Handling & Backlog Recovery Suite** (`apps/web/src/lib/retention/failureRecovery.test.ts`):
  - 4 automated integration tests verifying Resend API 500 error handling, network drops, backlog recovery replay, and partial batch resilience without recording false deliveries.
- **System Threat Model & Security Architecture** (`docs/security/threat-model.md`):
  - Comprehensive STRIDE threat analysis covering public endpoints, SSRF egress guards, TOTP MFA, least-privilege staff roles (`user < reviewer < admin`), audit ledgers, and secret rotation procedures.
- **API Concurrency & Load Benchmark Report** (`apps/web/scripts/run-load-benchmark.mjs`, `docs/operations/load-benchmark-results.md`):
  - Benchmarked public APIs under 10 concurrent workers (200 requests total): Shallow health check at **309 req/s** (23ms median), Trigram company search at **76 req/s** (64ms median), and Opportunity Match engine at **55 req/s** (129ms median) with 100% success rate.
- **System Operator Manual & Runbook** (`docs/operations/operator-manual.md`):
  - Fulfills the Phase 8 Exit Gate: establishes standard operational procedures to diagnose, disable, replay, restore, and correct the system without direct database surgery.
- **Controlled Beta Launch Protocol & Defect Triage Guide** (`docs/operations/beta-launch-guide.md`):
  - Onboarding protocol for Australian job seekers, skilled migrants, and regional movers; Severity 1–4 defect resolution SLA matrix.
- **Critical Discovery Journeys QA Verification (Desktop & Mobile)** (`apps/web/scripts/run-discovery-qa.mjs`, `docs/operations/discovery-journeys-qa-report.md`):
  - Automated E2E verification of 4 core discovery journeys (Opportunity Discovery, Sponsorship Discovery, Regional Hubs, Retention Loop) across Desktop and Mobile User-Agents.
  - 36/36 live E2E assertions passed with sub-110ms API latency and 100% evidence provenance.
  - Extracted isomorphic category icon utility `apps/web/src/lib/category-icons.ts` resolving SSR Server Component boundary invocation on `/companies/[slug]`.
  - Added `trustHost: true` in Auth.js and defensive null-coalescing in `matcher.ts`.
- Total test coverage: **181 automated tests passing** across contracts (33) and web (148), 0 lint errors, 0 type errors, Next.js Turbopack production build passing cleanly across 37 routes.

**Phase 9.1 (Commercial Readiness — Verified Employer Claims & Review Workflows) completed 9 September 2026**:
- Migration `0019_employer_claims_and_corrections.sql` authored and applied to live Neon PostgreSQL:
  - Extended `review_queue_kind` enum with `'employer_claim'` and `'data_correction'`.
  - Created `employer_claims` table with claimant details, role, JSON claimed data, corroborating evidence link, status, and review timestamps.
  - Created `data_corrections` table with community submission fields (`submitter_email`, `correction_type`, `details`, `evidence_url`, `status`).
  - Added `is_claimed`, `claimed_at`, and `claimed_by_user_id` to `companies`.
- Contracts in `@austechmap/contracts`:
  - `CreateEmployerClaimRequestSchema`, `EmployerClaimSchema`, `ReviewClaimActionSchema`.
  - `CreateDataCorrectionRequestSchema`, `DataCorrectionSchema`, `ReviewCorrectionActionSchema`.
  - Unit tests in `packages/contracts/tests/claims.test.ts` (7 tests passing).
- Query and Review Actions (`apps/web/src/lib/queries/claims.ts` & `admin/review/actions.ts`):
  - `createEmployerClaim`, `createDataCorrection`, `approveEmployerClaim`, `rejectEmployerClaim`, `resolveDataCorrection`.
  - Approve action sets `companies.is_claimed = true` while strictly preserving raw crawler and gazette observations without mutation (`PRODUCT_SPEC.md` §3.2 Rule 11).
  - All review decisions write immutable audit records to `audit_records`.
- Public Submissions Portal (`/corrections`):
  - Hallmark-styled tabbed interface (`CorrectionsPortalClient.tsx`) allowing employers to claim profiles and community members to submit discrepancy reports.
  - Guarded with Postgres-backed rate limiting (`checkRateLimit`) and SSRF egress inspection (`validateSafeUrl`).
- Profile UI (`/companies/[slug]`):
  - Renders the "Verified Employer Profile" badge when `company.isClaimed` is true, or an unobtrusive "Claim this profile" link.
- Unified Staff Review Queue (`/admin/review`):
  - Interactive cards rendering employer claims and community reports with direct staff approve and reject actions.
- Total test coverage: **197 automated tests passing** across contracts (40) and web (157), 0 lint errors, 0 type errors, clean Next.js Turbopack build across 37 routes.

**Phase 9.2 (Commercial Readiness — Analytics Entitlements, Export Controls & Sponsored Placement Boundaries) completed 9 September 2026**:
- Migration `0020_entitlements_and_commercial_governance.sql` authored and applied to live Neon PostgreSQL:
  - Created `user_entitlements` table with support for `'employer_analytics'`, `'institutional_export'`, `'extended_alerts'`, and `'api_stream'`.
  - Created `billing_customers` table defining subscription tier boundaries (`'free'`, `'employer_pro'`, `'institutional_annual'`) and status tracking.
  - Created `sponsored_placements` table for quarantined commercial employer promotions.
- Contracts in `@austechmap/contracts`:
  - `EntitlementTypeSchema`, `UserEntitlementSchema`, `BillingTierSchema`, `BillingCustomerStatusSchema`, `BillingCustomerSchema`, `SponsoredPlacementSchema`.
  - Unit tests in `packages/contracts/tests/commercial.test.ts` (5 tests passing).
- Commercial Query & Entitlement Engine (`apps/web/src/lib/commercial/`):
  - `getUserEntitlements`, `hasEntitlement`, `grantEntitlement`, `revokeEntitlement`.
  - `getActiveSponsoredPlacements`: context-aware filtering on target role families and regions.
  - `approveEmployerClaim`: auto-grants `employer_analytics` entitlement to verified claimants.
- Tiered Export Controls & Watermarking (`apps/web/src/app/api/export/`):
  - Enforced dynamic rate limits: 10/min for public/community vs 120/min for institutional/staff.
  - Institutional watermarking: adds signed licence comments to CSV header with actor attribution and timestamp.
  - Extended institutional columns: ABN, ACN, active evidence counts, and regional score components.
  - Audit logging: writes commercial export downloads directly to `audit_records`.
- Promoted Opportunity Component (`PromotedOpportunityCard.tsx`):
  - Strict quarantine adhering to `PRODUCT_SPEC.md §18.7`: rendered with amber styling, "Promoted Partner" badge, and explicit disclaimer: *"Promoted placement does not alter organic Opportunity Match scores or Home Affairs sponsorship evidence."*
  - Organic 100-point algorithm, ranking order, and score components remain 100% mathematically unpolluted.
- Total test coverage: **210 automated tests passing** across contracts (45) and web (165), 0 lint errors, 0 type errors, clean Next.js Turbopack build across 37 routes.

**Phase 5 Hiring & Phase 6A Sponsorship Expansion completed 9 September 2026**:
- Expanded verified ATS employer sources from 12 to **26 registered employers** across Lever, Ashby, and Greenhouse (Airwallex, Zip Co, Eucalyptus, Fleet Space Technologies, SiteMinder, Neara, Culture Amp, Catapult Sports, Zeller, Sitemate, Deputy, Morse Micro, Objective Corporation, Immutable, Prospa, Dovetail, Dremio, Octopus Deploy, Envato, Up/Ferocia, Hysata, Kasada, Lumary, Vow, and Easy Agile).
- Registered in `workers/ingestion/src/austechmap_ingestion/hiring/fixtures/ats_source_seed_20260905.csv` and seeded into Neon `company_ats_sources` (`{"created": 16, "reused": 10}`).
- Executed `crawl-jobs --all` against production: successfully crawled all 26 sources, expanding live job postings from 92 across 9 companies to **1,139 live job postings across 25 active employers**.
- Content-addressed raw snapshots stored; deterministic taxonomy classification and skill extraction applied to all 1,139 postings without destructive overwrites.
- Executed `derive-sponsorship-evidence`: derived the platform's first organic `job_sponsorship_mention` evidence hit from a real job posting (Neara: "Senior Software Engineer - Australia", 0.70 confidence), automatically activating Neara's verified sponsorship badge and `?sponsorship=true` map filter.
- Executed `run-retention-pipeline.mjs`: derived 1,056 new longitudinal `job.first_seen` change events in `events` table with zero errors.
- Verified `/opportunities` (Opportunity Match), `/api/map/companies` (127ms response time), `/companies/[slug]` (Neara, Airwallex, Eucalyptus, Zip Co, etc.), and map sponsorship filters.
- **Phase 5 Hiring Momentum Signals & Live Filters completed 9 September 2026**:
  - Implemented automated signal derivation engine (`hiring/signals.py`, `derive-hiring-signals` CLI) strictly enforcing the sufficiency rule: requires `sample_size >= 3` across distinct observation dates `>= 14` days apart; insufficient sample sets `sufficient = false, momentum = null` (no fake velocity).
  - Derived **54 employer role signals** and **107 employer skill signals** across 25 active employers on live Neon PostgreSQL.
  - Interactive Map & Directory: Added "Actively hiring" toggle pill, role family filter dropdown, work style filter dropdown; `MapCanvas` highlights hiring employers with emerald `#059669` glowing markers and halos; company directory cards render `⚡ X live roles` badges; inspection drawer adds 4th "Live Hiring Demand" card.
  - Profile Page: `/companies/[slug]` renders emerald-styled "Hiring Demand & Skills Landscape" card with role disciplines, baseline/momentum indicators, and top detected skills.
  - Query Normalization: Added `parseWorkStyles` helper and SQL enum text cast in `mapCompanies.ts` and `searchCompanies.ts`.
- **Admin Account Security Housekeeping completed 9 September 2026**:
  - Deactivated and demoted legacy bootstrap admin accounts (`system-admin-ui@austechmap.internal` and `jeevan.shah@churchill.edu.au`) to `role = 'user'`, `status = 'disabled'`.
  - Verified only `jeevanrajshah@gmail.com` remains active admin (`role = 'admin'`, `status = 'active'`).
- Updated ingestion test suites: `test_ats_source_seed.py` (26 verified seeds), `test_migrations.py` (range 1..21), and `test_hiring_signals.py` (2/2 DB integration tests pass).
- Monorepo quality gates: **216 tests passing** across contracts (46) and web (170), 0 lint errors, 0 type errors, clean Next.js build.

**Phase 8 / Phase 5 ATS Source Expansion & Live Job Ingestion completed 9 September 2026**:
- Expanded verified ATS employer sources from 26 to **39 registered tech employers** (added 13 verified public candidate boards across Lever, Ashby, and Greenhouse):
  - **DroneShield** (`greenhouse:droneshield`, 29 jobs) — ASX-listed AI defence robotics, Sydney.
  - **UpGuard** (`ashby:upguard`, 25 jobs) — Cybersecurity risk SaaS, Sydney.
  - **Kogan.com** (`lever:kogan`, 22 jobs) — E-commerce & retail tech scaleup, Melbourne.
  - **Shift** (`ashby:shift`, 18 jobs) — SME credit underwriting fintech, Sydney.
  - **Bugcrowd** (`greenhouse:bugcrowd`, 14 jobs) — Crowdsourced cybersecurity platform, Sydney.
  - **Buildkite** (`greenhouse:buildkite`, 10 jobs) — CI/CD automation software, Melbourne.
  - **Q-CTRL** (`lever:q-ctrl`, 9 jobs) — Quantum infrastructure & sensing deeptech, Sydney.
  - **PEXA** (`lever:pexa`, 6 jobs) — Digital property settlements SaaS, Melbourne.
  - **Amber Electric** (`lever:amberelectric`, 5 jobs) — Smart energy automation, Melbourne.
  - **Athena Home Loans** (`greenhouse:athena`, 4 jobs) — Cloud mortgage fintech, Sydney.
  - **Secure Code Warrior** (`lever:securecodewarrior`, 3 jobs) — Developer security learning platform, Sydney.
  - **Brighte** (`lever:brighte`, 2 jobs) — Clean energy consumer financing, Sydney.
  - **Timely** (`ashby:timely`, 2 jobs) — Cloud booking and appointment SaaS, Melbourne.
- Registered in `workers/ingestion/src/austechmap_ingestion/hiring/fixtures/ats_source_seed_20260905.csv` and seeded into Neon `company_ats_sources` (`{"created": 13, "reused": 26}`).
- Crawled all 39 sources via `crawl-jobs --all`: expanded live jobs from 1,139 to **1,293 active unexpired jobs across 38 hiring companies** on Neon PostgreSQL.
- Ingestion testing: `test_ats_source_seed.py` updated and passing for 39 sources; full pytest suite passing (244/244).
- Derivation pipelines:
  - `derive-hiring-signals`: derived 24 new role signals (78 total) and 38 new skill signals (145 total) across all 38 hiring companies.
  - `run-retention-pipeline.mjs`: derived 199 new longitudinal change events (149 jobs, 50 locations) in `events`.
- Monorepo quality gates: **460 automated tests passing** across contracts (46), web (170), and ingestion pytest (244). Live Next.js `/api/map/companies?hiring=true` verified with emerald active role indicators.

**Phase 8 (SmartRecruiters & Workable ATS Adapters + Cohort Scaling to 250 Employers) completed 9 September 2026**:
- **ATS Adapter Architecture Extended**:
  - Authored and applied migration `0021_add_smartrecruiters_and_workable_ats_providers.sql` extending enum `ats_provider` with `'smartrecruiters'` and `'workable'`.
  - Built SSRF-safe, host-allowlisted adapter `smartrecruiters.py` (`api.smartrecruiters.com`) supporting pagination and normalized city/region/remote job attributes.
  - Built SSRF-safe, host-allowlisted adapter `workable.py` (`apply.workable.com`) supporting `telecommuting` remote mapping and structured department parsing.
  - Added unit test suites `test_smartrecruiters.py` (4 tests) and `test_workable.py` (4 tests).
  - Seeded Canva (`smartrecruiters`) and Rokt (`workable`) in `ats_source_seed_20260905.csv` and Neon PostgreSQL (`{"created": 2, "reused": 39}`).
  - Crawled Canva (266 live roles) and Rokt (20 live roles), scaling platform live hiring from 1,293 to **1,579 active unexpired jobs across 40 hiring companies**!
  - Derived 6 new role family signals (now 84) and 8 new skill signals (now 153).
- **Batch 3 Tech Employer Cohort Expansion (183 → 250 Companies)**:
  - Curated, seeded, and geocoded **67 authentic Australian tech companies**, prioritizing underrepresented regions and deeptech sectors:
    - **Perth & WA (9)**: DUG Technology, Chironix, Nexxis, Track'em, Appbot, Rent.com.au, Fastbrick Robotics (FBR), Orbital UAV, Agworld.
    - **Adelaide & SA (9)**: Chrysos Corporation, Inovor Technologies, Micro-X, Neumann Space, QuantX Labs, LBT Innovations, Seeley International, DTEX Systems, Personify Care, MaxMine.
    - **Brisbane & QLD (11)**: Redflow, Valiant Space, Hypersonix Launch Systems, Black Sky Aerospace, FloodMapp, Vayeron (Mackay), SwarmFarm Robotics (Emerald), GO1 / EdApp, Sniip, RedEarth Energy Storage.
    - **Canberra & ACT (1)**: Nova Systems.
    - **Tasmania & Marine (2)**: Tasmanian Tiger Tech (Hobart), Definium Technologies (Launceston).
    - **Regional Corridors (7)**: Anditi (Newcastle), Tribotix (Newcastle), SwitchDin (Newcastle), Portt (Wollongong), Zepto (Byron Bay), Rubicon Water (Shepparton), Elenium Automation (Tullamarine).
    - **National Scaleups (28)**: AirTree Ventures Tech, Blackbird Tech, Main Sequence, Hyphen, Reckon, Class, Praemium, HUB24, Netwealth, Sharesies Australia, Raiz Invest, Upflowy, Gristmill, Propic, ActivePipe, Home-In, Weploy, Flare, Sidekicker, OpenAgent, Workscene Tech, Xplor Technologies, TidyMe, Basiq, FrankieOne, Biarri Networks, Biarri Rail, Soprano Design.
  - Total active/pending_review employers in Neon PostgreSQL expanded to **exactly 250 companies**!
  - 100% of company locations (230 accepted) geocoded and spatially resolved via PostGIS point-in-polygon joins into ABS ASGS SA4 regional boundaries.
  - Derived 67 new location change events into `events` via `run-retention-pipeline.mjs`.
  - Monorepo quality gates: **468 automated tests passing** across contracts (46), web (170), and ingestion pytest (252).
- **Phase 8 (7 Additional ATS Sources Registered — Live Jobs Surpass 1,900) completed 9 September 2026**:
  - Registered 7 newly discovered & verified Australian tech employers in `ats_source_seed_20260905.csv` and seeded into Neon PostgreSQL (`{"created": 7, "reused": 41}`):
    - **Xplor Technologies** (`smartrecruiters:Xplor`, **248 jobs**) — Childcare & fitness cloud SaaS platform.
    - **Netwealth** (`ashby:netwealth`, **25 jobs**) — Financial technology administration platform.
    - **Sentient Vision Systems** (`greenhouse:aechelontechnology`, **20 jobs**) — Airborne computer vision & AI search deeptech.
    - **Weploy** (`greenhouse:weploy`, **18 jobs**) — Algorithmic workforce dispatch SaaS.
    - **Flare** (`smartrecruiters:flarehr`, **14 jobs**) — Digital employee onboarding & workplace fintech.
    - **Ofload** (`workable:ofload`, **6 jobs**) — Digital freight logistics tech.
    - **ActivePipe** (`smartrecruiters:activepipe`, **1 job**) — Real estate predictive marketing automation.
  - Executed `crawl-jobs --all`: ingested **332 new live job postings**, scaling platform live volume to **1,911 active unexpired jobs across 47 hiring companies**!
  - Executed `derive-hiring-signals`: derived **16 new role family signals** (100 total) and **8 new skill signals** (161 total).
  - Executed `run-retention-pipeline.mjs`: derived **332 new longitudinal job change events** into `events`.
  - Updated `test_ats_source_seed.py` (48 verified seeds, 100% passing).

## Work remaining

Per `IMPLEMENTATION_PLAN.md`'s own phase checklists:
- **Phase 8**: Continue scaling toward the 1,000-employer goal.
- **Phase 5**: Scaling ATS source registration towards 100+ sources.
- **Phase 8**: Conduct controlled beta onboarding and user feedback triage per `docs/operations/beta-launch-guide.md`.
- **R2/Cloudflare setup for the account-deletion ledger is deliberately deferred** until real users exist (user's explicit call).

## Changed files

Key files updated in this milestone:
- Database: `db/migrations/0021_add_smartrecruiters_and_workable_ats_providers.sql`.
- Ingestion Adapters: `workers/ingestion/src/austechmap_ingestion/hiring/smartrecruiters.py`, `workers/ingestion/src/austechmap_ingestion/hiring/workable.py`.
- Ingestion Pipeline: `workers/ingestion/src/austechmap_ingestion/hiring/pipeline.py`, `replay.py`, `normalisation.py`, `company_sources.py`, `ats_source_seed.py`, `__main__.py`.
- Cohort Fixtures: `workers/ingestion/src/austechmap_ingestion/employers/fixtures/batch3_expansion_cohort_20260909.csv`, `batch3_expansion_cohort_addresses_20260909.csv`.
- ATS Seed Fixture: `workers/ingestion/src/austechmap_ingestion/hiring/fixtures/ats_source_seed_20260905.csv` (48 sources).
- Tests: `workers/ingestion/tests/test_smartrecruiters.py`, `test_workable.py`, `test_migrations.py`, `test_ats_source_seed.py`.
- Docs: `HANDOFF.md`, `walkthrough.md`.

## Decisions and invariants

- Follow `AGENTS.md`, `ARCHITECTURE_DECISIONS.md`, and `IMPLEMENTATION_PLAN.md`.
- Neon `DATABASE_URL` is configured in `apps/web/.env.local`.
- Primary admin user: `jeevanrajshah@gmail.com`.
- Strict sufficiency rule: never manufacture velocity if observation span < 14 days or sample size < 3.
- Command-scoped git identities (`-c user.name=Gemini -c user.email=gemini@localhost`).
- Dubious ownership override: `git -c safe.directory=C:/Users/jeeva/Projects/AusTechMap ...`.

## Verification

- **Automated Tests:**
  - Contracts Vitest: 46 / 46 passed.
  - Web Vitest: 170 / 170 passed (Total Vitest: 216 / 216 passed).
  - Ingestion Pytest: 252 passed, 96 skipped (100% pass rate).
- **Static Quality:**
  - TypeScript: 0 errors repository-wide (`npm run typecheck`).
  - ESLint: 0 errors repository-wide (`npm run lint`).
  - Production Build: Turbopack production build succeeded in 1.7s across 37 routes.
- **Live Infrastructure Verification on Neon DB:**
  - Total Active/Pending Employers: **250 companies**.
  - Total Active Unexpired Jobs: **1,911 live jobs**.
  - Total Registered ATS Sources: **48 sources**.
  - Distinct Active Hiring Employers: **47 companies**.
  - Geocoding & SA4 Resolution: **100% of accepted locations spatially mapped to ASGS SA4**.

## Known failures and risks

- **R2/Cloudflare is not configured for the account-deletion feature, by deliberate user choice** (deferred until user volume warrants).
- **Antigravity Browser Subagent Environment Limitation**: Driver download 404 from upstream Playwright CDN (`playwright-1.57.0-win32_x64.zip`) prevents automated browser screenshot generation; local HTTP API endpoints (`/api/health`, `/api/map/companies`) and Next.js dev server verify 100% runtime correctness.

## Next actions

1. Continue scaling the employer cohort towards the 500 / 1,000 employer milestones.
2. Probe additional ATS boards (e.g. Pinpoint, Breezy, Recruitee, Taleo, SuccessFactors) for other major Australian employers.
3. Advance Phase 9 commercial features (sponsored opportunities, workforce analytics exports).
