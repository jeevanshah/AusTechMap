# Autonomous delivery log

## 2026-09-17 - Authentication Upgrade: Google & GitHub OAuth Providers + Hallmark Redesign (/sign-in & /verify-request)

- **Scope & Highlights**:
  1. **Multi-Provider Zero-Password Authentication**:
     - Upgraded Auth.js v5 (`next-auth@beta`) in `apps/web/src/auth.ts` with Google OAuth (`GoogleProvider`) and GitHub OAuth (`GitHubProvider`) alongside Resend email magic link.
     - Set `allowDangerousEmailAccountLinking: true` so candidates and developers can authenticate seamlessly across providers with matching verified emails.
     - Preserved APP 11 compliance with a zero-password architecture (no stored passwords, no credential stuffing vulnerability surface).
     - Maintained role-aware database adapter (`RoleAwareAdapter`), RBAC gates (`user`, `reviewer`, `admin`), and staff MFA TOTP controls.
  2. **Hallmark UI/UX Redesign for `/sign-in`**:
     - Modern split grid layout with ecosystem value proposition highlights: Saved Market Searches, Employer & Hub Watchlists, Proactive Intelligence Alerts, and Zero-Password Privacy guarantees.
     - Branded OAuth buttons component (`OAuthButtons.tsx`) with official Google multicolored G mark and GitHub Octocat mark, featuring React 19 transition pending states and micro-interactions.
     - Passwordless magic link form component (`MagicLinkForm.tsx`) with email normalization, mail icon, autofocus, and smooth pending transition state.
     - Comprehensive error banner support for Auth.js URL error parameters (`OAuthAccountNotLinked`, `OAuthSignin`, `Verification`, etc.).
  3. **Hallmark UI/UX Redesign for `/verify-request`**:
     - Clean centered verification status card with mail dispatch icon, 10-minute expiry warning, and single-use security badge.
     - Return action buttons allowing users to try an alternative provider or navigate back to the Map Explorer.
  4. **Security & Open-Redirect Hardening**:
     - Extracted and hardened `sanitizeCallbackUrl` in `apps/web/src/lib/auth/callback-url.ts` to strictly validate relative redirection paths and block open-redirect vectors (`//evil.com`, `/\evil.com`).
     - Added server action `signInWithProvider` in `apps/web/src/app/(auth)/sign-in/actions.ts`.
- **Verification Evidence**:
  - Web unit tests: **207 passed** across 42 test files (0 failures).
  - New test coverage: 10 tests in `apps/web/src/app/(auth)/sign-in/actions.test.ts` and 3 tests in `apps/web/src/lib/auth/callback-url.test.ts`.
  - TypeScript check: `npm run typecheck --prefix apps/web` exited with **0 errors**.
  - Production build: `npm run build --prefix apps/web` completed with **0 errors**, compiling dynamic `/sign-in` and static `/verify-request`.
  - Live server check: HTTP 200 on `/sign-in` and `/verify-request`.
  - `git diff --check` passed cleanly.


## 2026-09-13 - Visual Account Dashboard (/account): Watchlists & Saved Searches Management

- **Scope & Highlights**:
  1. **Interactive Saved Searches Management Interface**:
     - Upgraded `/account` to render rich, interactive saved search cards with explicit status badges (`Active · Weekly Digest`, `Active · Daily Digest`, `Active · Instant`, or `Paused · Muted`).
     - Added 1-click **Pause & Resume** toggle buttons, dynamically switching `alertFrequency` between active cadence and `'never'` while caching the previous frequency in memory for single-click restoration.
     - Implemented tactile 4-way segmented alert frequency switcher (`Paused`, `Daily`, `Weekly`, `Instant`) with instant optimistic updates and loading spinners via React `useTransition`.
     - Added formatted filter chip badges for keyword queries, role families, sectors/categories, work styles, hub cities, SA4 codes, Subclass 482 sponsorship, and active hiring filters.
     - Added direct "Run on Map" link restoring the user's filtered view on `/` with full query parameters.
     - Added smooth optimistic search deletion with rollback on error.
  2. **Comprehensive Watchlists Management (Employers & Regional Hubs)**:
     - Built sub-tab segmented filter (`All Items`, `Employers`, `Regional Hubs`) with live count badges.
     - Added rich company cards featuring monogram avatar, company display name, city, sector, Subclass 482 sponsorship badge, regional badge, watching-since date, and dossier links.
     - Added regional hub cards featuring ABS SA4 code, Region name, Regional Opportunity Score badge, and regional report links.
     - Added per-item **Notification Muting** (`toggleWatchlistMuteAction`), enabling users to silence email and in-app updates for specific employers or regional hubs without unwatching them.
     - Implemented private career memo notes (`updateWatchlistNotesAction`), allowing users to record private notes (e.g. application dates, interview notes, recruiter contacts) directly on watched employers.
  3. **KPI Overview Metrics Strip & Batch Controls**:
     - Built 4 live stat cards: Saved Searches (with active vs. paused breakdown), Watched Employers, Watched Regional Hubs, and Unread In-App Alerts.
     - Added delivery schedule callout explaining Resend email digest timing (Instant, Daily 08:00 AEST, Weekly Mondays).
     - Added batch action controls: "Pause All Alerts" and "Resume All (Weekly)" buttons for fast global management.
  4. **New Server Actions & Backend Queries**:
     - Exported `pauseAllSavedSearchesAction`, `resumeAllSavedSearchesAction`, `updateWatchlistNotesAction`, and `toggleWatchlistMuteAction` in `retentionActions.ts`.
     - Added batch database queries in `savedSearches.ts` and `watchlists.ts`.
     - Added 12 comprehensive unit tests in `apps/web/src/app/actions/retentionActions.test.ts`.
- **Verification Evidence**:
  - Web unit tests: **194 passed** across 40 test files (0 failures).
  - TypeScript check: `npm run typecheck --prefix apps/web` exited with **0 errors**.
  - Production build: `npm run build --prefix apps/web` compiled all 38 routes in 4.6s.
  - Auth gating: unauthenticated request to `/account` issues HTTP 307 temporary redirect to `/sign-in?callbackUrl=/account`.
  - `git diff --check` passed with 0 whitespace errors or conflict markers.

## 2026-09-13 - Regional Hub Map Point Selection Bug Resolution & Regions Tab UX Elevation

- **Scope & Highlights**:
  1. **Map Point Selection Bug in Regional Hubs & Viewports**:
     - Investigated and resolved issue where clicking single dots on the map in a regional hub (e.g. Perth Hub) failed to select or show the company card in the directory feed.
     - Root cause: `handleSelectHub` previously set `query = hub.city`, forcing the directory feed into keyword search mode capped at 20 text-search hits and omitting companies with branch locations in Perth or names not matching the literal text "Perth". Clicking any unindexed dot resulted in `selectedEntry` resolving to `null`.
     - Fixed `selectedEntry` resolution to systematically fall back across `listEntries`, `rawListEntries`, `displayedPoints`, and `points` (never `null` when clicking a map point).
     - Built `finalDisplayedEntries`: dynamically prepends the selected company to the top of the directory feed if it wasn't already in view, rendering with `id="company-card-${slug}"`, active terracotta indicator bar, and `Selected` badge, and ensuring smooth scroll into view.
     - In `handleSelectHub`, cleared `query` (`setQuery("")`) so the feed displays all employers in that hub's map viewport directly from `points` without the 20-result full-text search limitation.
     - In `handlePointClick`, invoked `handleTabChange("companies")` with dual-frame scroll retry timers (`50ms` and `200ms`), ensuring clicking any dot while on the Regions or Sponsors tab immediately switches to the Companies directory and scrolls to that company's card.
  2. **Comprehensive Regional Hub Metadata (All 25 Australian Hubs)**:
     - Expanded `HUB_METADATA` from 14 to all 25 active regional tech hubs returned by `/api/regions` (adding accurate coordinates, zoom levels, specialized innovation corridor tags, and official ABS SA4 codes for Launceston, Toowoomba, Orange, Ballarat, Cairns, Townsville, Mackay, Alice Springs, Morwell, Moe, Byron Bay, Emerald, Griffith, Central Coast, Coffs Harbour, Bunbury, Shepparton, Warrnambool).
     - Fixed fallback state lookup so non-metadata cities resolve to `CITY_STATE_MAP[hub.city]` rather than generic `"AU"`.
     - Filtered out Tier-1 metropolitan capitals (`Sydney`, `Melbourne`, `Brisbane`) from `displayedHubs` so the tab displays authentic designated regional innovation corridors.
  3. **Regions Tab Search & URL Synchronization**:
     - Initialized `activeDirectoryTab` from URL search parameters (`?tab=regions`).
     - Added query-based filtering within the Regions tab (filtering by city, state, specialized tag, or SA4 code) with a Hallmark empty state and reset button.
     - Added bidirectional URL state synchronization (`window.history.replaceState`) for tab switches and hub selections.
     - Fixed mobile toggle button count to display `Hubs ({count})` when viewing the Regions tab.
- **Verification Evidence**:
  - TypeScript compiler: `npx tsc --noEmit -p apps/web/tsconfig.json` exited with **0 errors**.
  - Vitest suite: **178/178 tests passed** across all 39 test files.
  - `git diff --check` passed cleanly with 0 whitespace errors or conflict markers.
  - HTTP Endpoints: `/?tab=regions` (200), `/?hub=Perth` (200).

## 2026-09-13 - Comprehensive UI/UX Elevation: Secondary Pages Redesign, In-Dossier Role Discovery & Site-Wide Mobile Navigation

- **Scope & Highlights**:
  1. **Base Collection URL 404 Resolution & Clean Permanent Redirects**:
     - Created `apps/web/src/app/companies/page.tsx` issuing `permanentRedirect("/#directory-content")`. Resolves user 404 when navigating to `/companies/` or `/companies`.
     - Created `apps/web/src/app/regions/page.tsx` issuing `permanentRedirect("/?tab=regions#directory-content")`.
  2. **Unified Site-Wide Navigation & Brand Identity (`GlobalNavbar` & `CompanyBrandMark`)**:
     - Built `GlobalNavbar.tsx`: Standardized brand logo (`/brand/logo.jpg`), contextual subtitles, desktop navigation links (`Map Explorer`, `Live jobs`, `Opportunity Match`, `Methodology`), live session authentication indicator, and a horizontally scrollable mobile sub-navigation pill strip (`Map`, `Live jobs`, `Opportunity Match`, `Methodology`) ensuring smartphone users never face hidden menus.
     - Replaced custom desktop header in `apps/web/src/app/page.tsx` with `<GlobalNavbar />`, leveraging `extraRightAction` for the `+ Add company` CTA and achieving 100% visual and structural harmony across all pages.
     - Built `CompanyBrandMark.tsx`: 128px Google Favicon proxy with deterministic fallback initials across four sizes (`sm`, `md`, `lg`, `xl`). Integrated into company profiles, live jobs, regional employer feeds, opportunity matches, and promoted employer placements.
  3. **Company Profile Dossier Redesign (`/companies/[slug]`)**:
     - Upgraded from narrow 768px layout to full-width 12-column national registry dossier.
     - Integrated `CompanyRolesList.tsx`: client-side real-time keyword search, role discipline filter chips (`Engineering`, `Product`, etc.), direct apply actions, and graceful empty states.
     - Main column: Active open roles, recruitment momentum signals, top required skills with evidence counts, Subclass 482 visa sponsorship evidence dossier, and registry indexing notes.
     - Sidebar column: Factsheet, interactive premises map (`MapCanvas`), and claim profile modal.
  4. **National Live Jobs Registry Elevation (`/jobs`)**:
     - Added quick role-family filter chips (`All roles`, `Engineering`, `Data & AI`, etc.) for 1-click filtering.
     - Added dynamic live results count and filter summary bar with quick reset CTA.
     - Elevated job cards with `CompanyBrandMark`, seniority badge, work style badge, posted date, and direct application links.
  5. **WCAG Accessibility & Design Refinement**:
     - Added custom Australian Terracotta selection styling (`::selection`) in `globals.css`.
     - Enforced high-contrast `:focus-visible` outline rings across all interactive elements.
     - Elevated custom 404 page (`/not-found.tsx`) with brand mark, status pill, and navigation shortcuts.
- **Verification Evidence**:
  - Web unit test suite: **178/178 tests passed** across all 39 test files.
  - TypeScript compiler: `npx tsc --noEmit -p apps/web/tsconfig.json` exited with **0 errors**.
  - `git diff --check` passed cleanly with 0 whitespace errors or conflict markers.
  - HTTP Endpoints: `/` (200), `/companies/` (308 redirect), `/companies/atlassian` (200), `/jobs` (200), `/opportunities` (200), `/regions/101` (200), `/methodology` (200), `/random-404` (404).

## 2026-09-13 - Phase 5 Scaleup (154 Active Verified ATS Sources), Phase 7 Retention Alert Dispatcher & Phase 8 Hardening

- **Scope & Highlights**:
  1. **Option 2: Scale ATS Sources Toward 150+ (Phase 5 Scaleup)**:
     - Conducted systematic discovery sweeps across unmapped canonical Australian tech employers in Neon.
     - Verified and onboarded 44 new bona fide Australian tech feeds across SmartRecruiters, Greenhouse, Lever, Ashby, and Pinpoint (e.g. WiseTech Global, PaperCut Software, Sentient Vision Systems / Shield AI Melbourne CV lab, Montu, GO1, Appen, Hireup, Vix Technology, CVCheck / Kinatico, Superloop, Iress, Elmo Software, ReadyTech, Whispir, Qoria, Tesserent, Hansen Technologies, Bravura Solutions, HUB24, Praemium, Class, Senetas, Tritium, Temple & Webster, WithYouWithMe, Practera, Swoop Aero, Baraja, Gilmour Space, Fleet Space, Propic, Cubiko, Sherpa, Carbar, Honey Insurance, Lendi, Symple Loans, Tyro, Till Payments, Openpay, HappyCo, Willow Technology, Raiz Invest, Partly).
     - Gated 100% of candidate boards by `is_australian_location` and Australian corporate identity checks, eliminating foreign job pollution.
     - Scaled active verified ATS feeds in Neon PostgreSQL from 115 to **155 sources** (and synchronized `ats_source_seed_20260905.csv` to 160 rows, including onboarding **NCS Group / NCS Australia** `smartrecruiters:ncsaustralia`).
     - Ingested 138 live Australian roles (including 82 from NCS Australia), bringing total live canonical Australian jobs in Neon to **1,130 jobs** across **110 active hiring employers** with **0 foreign positions**.
     - Refreshed hiring signals and sponsorship evidence across all hiring companies.
  2. **Option 3: Retention Engine & Alert Dispatcher Worker (Phase 7)**:
     - Built `workers/ingestion/src/austechmap_ingestion/retention/dispatch_alerts.py` and registered `dispatch-alerts` CLI subcommand in `__main__.py`.
     - Supports `--database-url`, `--frequency (all|instant|daily|weekly)`, and `--dry-run`.
     - Replay-safe deduplication via `notification_deliveries` `(user_id, event_id, channel, delivery_window)` unique ledger constraint.
     - Evaluates material change events (`job.first_seen`, `sponsorship.evidence_added`, `company.updated`) against company watchlists and saved search criteria (`roleFamily`, `remote`).
     - Added comprehensive unit and integration test coverage in `workers/ingestion/tests/test_dispatch_alerts.py` (dry-run, live execution, deduplication, frequency throttling).
  3. **Option 4: Production Hardening & Pre-Launch Polish (Phase 8)**:
     - Audited and validated security headers in `next.config.ts` (Content-Security-Policy with strict frame-ancestors, HSTS max-age 63072000, X-Frame-Options DENY, X-Content-Type-Options nosniff, Referrer-Policy, Permissions-Policy).
     - Verified SSRF guards (`validateSafeUrl`) and atomic Postgres-backed rate limiting (`checkRateLimit`).
     - Validated Next.js production build: clean compile in 1.6s, all 38 routes pass static/dynamic generation.
     - Benchmarked nationwide map API latency: `/api/map/companies?bbox=110,-45,155,-10` responds in 281ms under 500-point clustering limits.
     - Verified dynamic OpenGraph cards: `/api/og/company/[slug]` and `/api/og/region/[code]` respond HTTP 200 `image/png` with live badge indicators.
- **Verification Evidence**:
  - Full ingestion test suite: all active tests passing (including `test_ats_source_seed.py` and `test_dispatch_alerts.py`).
  - Web test suite: **178 passed** across 39 test files.
  - Contracts test suite: **46 passed** across 10 test files.
  - Next.js production build: 38 routes compiled cleanly without errors.
  - Live Neon PostgreSQL status: 154 active verified ATS sources, 1,048 live Australian jobs across 108 hiring employers, 0 foreign jobs.

- **Scope & Highlights**:
  1. **Strict Multi-National Location Filtering & International Purge**:
     - Upgraded `is_australian_location` in `austechmap_ingestion.hiring.normalisation` to deterministically reject foreign countries, cities (e.g. London, San Francisco, Chicago, Singapore, Manila, Auckland, Pune), and ISO 3166-1 alpha-2 country suffixes (e.g. `, us`, `, gb`, `, nz`, `, in`, `, ph`, `, my`, `, ca`, `, de`), including disambiguating foreign namesakes (e.g. `Newcastle upon Tyne, England, gb`, `Sydney, Nova Scotia, Canada`, `Perth, Scotland, UK`).
     - Executed complete database purge across all previously ingested jobs: purged **2,318 non-Australian positions** (e.g. US/UK/EU/Asia openings belonging to multinational Australian scaleups like Airwallex, Culture Amp, Rokt, Xplor, and Zip Co) along with their dependent `job_observations` and `job_skill_links`.
     - Live database now contains **992 pure, verified Australian tech jobs** across **100 active Australian hiring tech employers**, with **0 foreign jobs remaining**.
  2. **Quarantine of 23 False-Match / International ATS Boards**:
     - Forensically investigated ATS boards with 0 Australian positions or international collisions (`alembic-strategy`, `appen`, `astute-payroll`, `cape`, `clipboard`, `coupa-software-au`, `dataro`, `dremio`, `fareharbor-au`, `fleet-space-technologies`, `forter-australia`, `happyco`, `leaflink-au`, `learnupon-au`, `liven`, `machinify-au`, `partly`, `readytech`, `safetyculture:mitti`, `samsara-networks-au`, `sentient-vision-systems:aechelontechnology`, `telnyx`, `timely`).
     - Quarantined in `company_ats_sources` (`status = 'disabled'`, `status_reason = 'international_name_collision'`) and linked `data_sources` with immutable audit trail.
     - Disabled 7 foreign placeholder company entities (`leaflink-au`, `learnupon-au`, `machinify-au`, `samsara-networks-au`, `coupa-software-au`, `fareharbor-au`, `forter-australia`) with `disabled_reason = 'foreign_entity_no_au_headquarters'`.
     - Pruned fixture `ats_source_seed_20260905.csv` to **115 verified Australian tech ATS sources** (100% Australian tech headquarters).
  3. **Hiring Signal Re-derivation & Invariant Audit**:
     - Re-derived longitudinal hiring signals via `derive_employer_hiring_signals` across all 100 hiring employers (131 role signals, 185 skill signals updated).
     - Verified core database invariants: 0 missing core fields, 0 duplicate domains, 0 duplicate slugs, 0 orphan locations, 0 orphan jobs, 0 foreign jobs.
- **Verification**:
  - Full ingestion test suite: **338 passed**, 104 skipped.
  - Web test suite: **178 passed** across 39 files.
  - Contracts test suite: **46 passed** across 10 files.
  - Database invariant audit passed 100%.

## 2026-09-13 - Systematic Geographic Integrity Remediation: ATS International Collision Quarantine, Name Sanitization & Location Drift Detector

- **Scope & Highlights**:
  1. **Purge & Quarantine 14 False-Match International ATS Feeds**:
     - Audited all 152 ATS sources for non-Australian job contamination. Identified 14 international brand-name collisions on global boards (e.g. US executive recruiter `athena`, US gaming recruiter `hireup`, Minneapolis aerospace `swoop`, NYC digital media `luminary`, European `raiz`).
     - Disabled the 14 feeds in `company_ats_sources` (`status = 'disabled'`, `status_reason = 'international_name_collision'`) and `data_sources` with immutable audit trail.
     - Purged 145 non-Australian jobs, observations, and derived skill/role signals, ensuring 100% of persisted jobs represent legitimate Australian employment (**3,310 verified live canonical jobs** across **117 active hiring employers**).
     - Pruned fixture `ats_source_seed_20260905.csv` from 152 down to **138 verified Australian sources**.
  2. **Sanitize Qualified Outpost Names & Suffixes**:
     - Sanitized compound names and slugs for 12 canonical companies seeded with outpost/branch qualifiers (e.g. `Kinetic IT (Darwin Hub)` -> `Kinetic IT`, `Youi Insurance (Tech Campus)` -> `Youi Insurance`, `Dremio (Australia Hub)` -> `Dremio`, `Cotton On Group (Digital & Tech)` -> `Cotton On Group`, `nib Group (Tech Hub)` -> `nib Group`, `FirstWave (Opmantek)` -> `FirstWave`, `Instaclustr (NetApp)` -> `Instaclustr`, `VGW (Virtual Gaming Worlds)` -> `VGW`, `Mineral Resources Tech (MinRes)` -> `Mineral Resources`, `Silicon Quantum Computing (SQC)` -> `Silicon Quantum Computing`, `Canberra Data Centres (CDC)` -> `Canberra Data Centres`, `FCTG Tech (Flight Centre)` -> `Flight Centre Technology`).
     - Relocated Kinetic IT from Darwin branch outpost to its national corporate headquarters at 54 Terrace Road, East Perth WA 6004 with full PostGIS coordinate resolution.
     - Synchronized `alpha_seed_cohort_20260905.csv` and `alpha_seed_cohort_addresses_20260905.csv`.
  3. **Strict Australian Geography Gate on ATS Ingestion Pipeline**:
     - Built `is_australian_location` in `austechmap_ingestion.hiring.normalisation` with deterministic regex recognition of Australian states, territories, major tech precincts, and remote-in-Australia markers, with explicit foreign jurisdiction exclusions.
     - Integrated into `pipeline.py` posting ingestion loop: non-Australian roles on multi-national boards are automatically dropped prior to persistence.
  4. **Automated Location Drift Detection Engine & CLI**:
     - Built `location_drift.py` and registered `detect-location-drift` CLI command in `__main__.py`.
     - Automatically compares an employer's recorded head office state against the distribution of its active Australian job postings, surfacing potential headquarters drift (e.g. Nearmap Perth -> Sydney pattern) into structured reports and staff review queues.
- **Verification**:
  - Full ingestion test suite: **330 passed**, 104 skipped across 434 tests.
  - Web test suite: **178 passed** across 39 files.
  - `detect-location-drift` evaluated 94 hiring employers on live Neon DB with zero unhandled exceptions.

## 2026-09-13 - Nearmap Australian Corporate Headquarters Relocation to Sydney Barangaroo

- **Scope & Context**:
  - Incorporated verified user feedback and first-party corporate disclosure (`https://www.nearmap.com/au/contact`): Nearmap completely ceased physical operations at its former Perth laboratory (1002 Hay Street, Perth WA) and centralized its Australian corporate headquarters, executive leadership, and primary staff to Sydney (Tower One, 100 Barangaroo Avenue, Barangaroo NSW 2000).
- **Production Database Updates**:
  - `companies`: Updated company record `a923d740-0002-4f7b-869e-6a845c4353c5` to canonical slug `nearmap`, display name `Nearmap`, and status `active` (transitioned from legacy placeholder `nearmap-perth-lab` in `pending_review`).
  - `resolved_locations`: Created/verified resolution for `100 Barangaroo Avenue, Barangaroo NSW 2000, Australia` with exact coordinates `POINT(151.2021604 -33.8637896)` and mapped to ASGS statistical regions: SA2 `Sydney (North) - Millers Point` (`4b210c0d-b33c-4283-9b69-af0298bd66c4`), SA3 `Sydney Inner City`, SA4 `Sydney - City and Inner South`, LGA `Sydney`, POA `2000`.
  - `company_locations`: Relocated company location `eee3d553-3e24-46ef-a9b4-73cbaec5d8e6` from Perth to Barangaroo head office.
  - `jobs`: Re-linked all 35 live canonical positions from SmartRecruiters board `nearmap` to the new Barangaroo company location.
  - `evidence`:
    - Inserted first-party location evidence record `156dd671-0655-426d-8df8-23e761c14efd` referencing `https://www.nearmap.com/au/contact` (confidence 1.00).
    - Updated seed research claim `70365057-01e5-4cff-9b81-2ea842cfc02c` from obsolete Perth lab notation to `Aerial photogrammetry, high-resolution geospatial content, and location intelligence (corporate headquarters in Barangaroo)`.
  - `audit_records`: Logged immutable audit record `89af9665-3e63-448f-8052-396335e368af` (`action = 'relocate_headquarters'`) capturing full before/after state.
- **Fixture Updates**:
  - `alpha_seed_cohort_20260905.csv`: Renamed `Nearmap (Perth Lab)` to `Nearmap`, city to `Sydney`.
  - `alpha_seed_cohort_addresses_20260905.csv`: Updated street address from `Level 1, 1002 Hay Street, Perth WA 6000` to `100 Barangaroo Avenue, Barangaroo NSW 2000`.
- **Verification**:
  - Ingestion test suite: 53 tests passed (seed, address validation, geocoding).
  - Web test suite: 178 tests passed across 39 files.
  - Live page verification at `http://localhost:3000/companies/nearmap`: 200 OK, renders Nearmap Barangaroo HQ, 35 live jobs, and interactive map marker. Perth references 100% eliminated from live metadata.

## 2026-09-13 - Phase 5 Scaleup: 152 Monitored ATS Sources (3,548 Live Jobs), Tech ANZSCO Expansion & Commercial Claim Concierge

- **Scope & Highlights**:
  1. **Track 1: Tech ANZSCO Expansion**:
     - Expanded `anzsco4_role_family_v1.csv` to map official Australian ICT unit groups: `2611 ICT Business and Systems Analysts` -> `product-delivery`, `2612 Multimedia Specialists and Web Developers` -> `software-engineering`, `2621 Database and Systems Administrators, and ICT Security Specialists` -> `security`.
     - Updated fixture assertions in `test_jsa.py` and confirmed 100% test pass.
  2. **Track 2: Scale Monitored ATS Sources to 152+**:
     - Discovered, verified, and onboarded 29 net-new Australian technology employer boards across SmartRecruiters, Ashby, Pinpoint, Breezy, Greenhouse, and Workable:
       - SmartRecruiters: Bigtincan, FinClear, InstantScripts, Judo Bank, Kagome Digital Ag, Lumi Business, NextDC, Redbubble, SEEK, Versent, Equatorial Launch Australia, CyberCX, Hireup.
       - Ashby: ReadyTech, Luminary, Deel (Astute Payroll).
       - Pinpoint: Fluent Commerce, Preezie, Sonder.
       - Breezy: CEVO, Edrolo, Insentra.
       - Greenhouse: LeafLink AU.
       - Workable: Basiq, Biteable, Birchal, Blackbird Tech, Koala Tech, Pet Circle.
     - Registered into Neon DB `company_ats_sources` and fixture `ats_source_seed_20260905.csv` (152 total active sources).
     - Crawled all uncrawled sources with 100% crawl success rate, creating **+198 net-new positions** in Neon DB (**3,548 total canonical live jobs** across **131 active hiring employers**).
     - Derived updated hiring signals via `derive_employer_hiring_signals`: 104 new role signals, 145 new skill signals.
     - Derived 205 new longitudinal change events into `events` table (reaching **4,525 total events**).
  3. **Track 3: "Claim Profile & Partner With Us" Concierge Modal**:
     - Built `ClaimProfileModal.tsx` in `apps/web/src/app/companies/[slug]/ClaimProfileModal.tsx` with Hallmark design standards.
     - Integrated into `/companies/[slug]` header actions and verification badge area.
     - Supports three commercial inquiry channels: `profile_verification` ("Verify & Claim Profile"), `employer_pro` ("Employer Pro Subscription"), and `data_partnership` ("Data & Talent Intelligence").
     - Fast-track corporate domain matching verification hint when claimant email matches company domain.
     - Submits atomically to `employer_claims` and enqueues into staff `review_queue_items`.
  4. **Track 4: Verification & Automated Checks**:
     - Production Next.js build compiled cleanly in 1.38s with zero errors or warnings.
     - Pytest suite: 307 passed, 104 skipped.
     - Contracts Vitest: 46 passed.
     - Web Vitest: 178 passed across 39 files.
     - End-to-end local server verification across all primary routes (`/`, `/companies/[slug]`, `/opportunities`, `/api/health`, `/api/map/companies`, `/api/og/company/[slug]`, `/api/opportunities/match`).
- **Production State**:
  - Active Monitored ATS Sources: **152** (100% crawled)
  - Canonical Live Jobs: **3,548**
  - Distinct Hiring Employers: **131**
  - Mapped Physical Addresses: **965** (95.83% of 1,007 active companies)
  - Total Evidence Records: **2,717**
  - Longitudinal Events: **4,525**

- Scope: executed discovery sweep and live API verification across all 936 unmapped technology employers in Neon, identifying and onboarding 26 verified active ATS boards across Greenhouse, Lever, Ashby, and Workable into `company_ats_sources` and fixture `ats_source_seed_20260905.csv`:
  1. `hipages.com.au` (hipages Group) -> `greenhouse:hipagesgroup` (10 live jobs in Sydney)
  2. `procreate.com` (Savage Interactive) -> `lever:procreate` (10 live jobs in Hobart / Sydney)
  3. `quantium.com.au` (Quantium) -> `greenhouse:quantium` (31 live jobs in Sydney / Melbourne)
  4. `plenti.com.au` (Plenti) -> `lever:plenti` (11 live jobs in Sydney / Adelaide / QLD)
  5. `prezzee.com` (Prezzee) -> `greenhouse:prezzee` (9 live jobs in Sydney / Melbourne)
  6. `spaceship.com.au` (Spaceship) -> `greenhouse:spaceship` (1 live job in Sydney)
  7. `sundrive.com` (SunDrive Solar) -> `lever:sundrivesolar` (1 live job in Sydney Kurnell)
  8. `splend.com.au` (Splend Tech) -> `lever:splend` (10 live jobs in Sydney / Brisbane)
  9. `polynovo.com` (Polynovo) -> `greenhouse:polynovo` (12 live jobs in Port Melbourne)
  10. `whogivesacrap.org` (Who Gives A Crap) -> `greenhouse:whogivesacrap` (8 live jobs in AU Remote)
  11. `enboarder.com` (Enboarder) -> `greenhouse:enboarder` (5 live jobs in Sydney)
  12. `easygo.gg` (Easygo Gaming) -> `greenhouse:easygo` (32 live jobs in Melbourne)
  13. `cyara.com` (Cyara) -> `lever:cyara` (19 live jobs in Melbourne / AU)
  14. `ignitionapp.com` (Ignition) -> `ashby:ignition` (10 live jobs in Sydney)
  15. `alembic.com.au` (Alembic Strategy) -> `ashby:alembic` (10 live jobs)
  16. `coupa.com` (Coupa Software AU) -> `lever:coupa` (31 live jobs, including AVP Enterprise Australia)
  17. `tibra.com` (Tibra Capital) -> `workable:tibra-capital-1` (algorithmic trading, verified from careers page)
  18. `rumin8.com` (Rumin8) -> `lever:rumin8` (Perth climate tech, verified from careers page)
  19. `wisr.com.au` (Wisr) -> `lever:wisr` (Sydney ASX-listed fintech, verified from careers page)
  20. `stax.io` (Stax) -> `lever:stax` (Melbourne cloud management)
  21. `sendle.com` (Sendle) -> `greenhouse:sendle` (Sydney tech logistics)
  22. `vgw.co` (VGW) -> `greenhouse:vgw` (Perth tech)
  23. `catch.com.au` (Catch.com.au) -> `ashby:catch` (Melbourne e-commerce tech)
  24. `dataro.io` (Dataro) -> `ashby:dataro` (2 live jobs in Sydney)
  25. `getcape.io` (Cape) -> `ashby:cape` (26 live jobs in Sydney)
  26. `liven.love` (Liven) -> `ashby:liven` (2 live jobs in AU Remote)
- Quality gates: 100% verified against live provider APIs (zero ungrounded URL guessing), all matched to canonical Neon `companies` records, overseas false positive name collisions excluded (e.g. ELA US, Safetech Canada, Mobi MA, Nudge SF).
- Execution: `seed-ats-sources` executed cleanly against Neon (`{"created": 26, "reused": 71}`).
- Production state: **97 active ATS sources** (98 total rows in `company_ats_sources`), 1,007 active canonical companies, 965 mapped employers (95.83%), 970 company locations, 2,717 evidence records, 3,283 longitudinal change events.
- Verification: all 97 fixture entries parsed and validated in `test_ats_source_seed.py`, `ruff check` clean, monorepo vitest and pytest passing.

## 2026-09-12 - Batch 6 ATS sources registered (6 new active sources, 71 total)

- Scope: identified, verified against live public APIs, and registered 6 active ATS sources for Batch 6 employers into `company_ats_sources` and `ats_source_seed_20260905.csv`:
  1. `airlockdigital.com` -> `greenhouse:airlockdigital` (HTTP 200, 25 live jobs)
  2. `vast.energy` -> `ashby:vast` (HTTP 200, active board)
  3. `mx51.io` -> `greenhouse:mx51` (HTTP 200, active board)
  4. `macquarietechnologygroup.com` -> `lever:macquarietechnologygroup` (HTTP 200, 17 live jobs)
  5. `swoop.com.au` -> `ashby:swoop` (HTTP 200, 13 live jobs)
  6. `appen.com` -> `lever:appen` (HTTP 200, 19 live jobs)
- Quality gates: 100% API verified (zero guess-based registrations), all matched to canonical `companies` in Neon, registered with `source_id = '6c74f1f0-ff3f-44cf-88c6-6496c41e32af'` (`ats-discovery`).
- Execution: `seed-ats-sources` executed cleanly against Neon (`{"created": 6, "reused": 65}`).
- Production state: **71 active ATS sources** (72 total rows in `company_ats_sources`), 1,007 active canonical companies, 965 companies with mapped locations (95.83%), 970 company locations, 2,717 evidence records, 3,283 longitudinal change events.
- Verification: all 71 fixture entries parsed and validated in `test_ats_source_seed.py`, `ruff check` clean, monorepo vitest and pytest passing.

## 2026-09-12 - Location Top-Up seeded: >95% Mapped Locations Launch Gate passed

- Approval: user explicitly approved Option 1 and authorized the production write (`seed-locations` for `batch6_location_topup_20260912.csv`).
- Scope: researched, validated, and geocoded verified street-level head offices for 48 previously unmapped active canonical companies in Neon, advancing mapped employer coverage from 917 (91.06%) to **965 (95.83%)** out of 1,007 active companies.
- Quality gates: 100% strict address contract compliance (`validate_address_fixture`: valid=True, 0 errors), 100% specific street numbers (0 numberless addresses), 100% matched to existing Neon canonical companies, zero unexplained address reuse.
- Production execution:
  - `seed-locations`: 48 company locations geocoded via Nominatim (33 resolved, 15 reused existing physical point) with 48 exact first-party `location_source` evidence rows created (`batch6_location_topup_20260912.csv`).
  - `run-retention-pipeline.mjs`: 48 new `location_added` change events derived and committed to `events`.
- Production state: **1,007 active canonical companies**, **965 companies with mapped locations (95.83%)**, 970 total company locations, 2,717 evidence records, 3,283 longitudinal change events, 25 database migrations applied, 411 automated tests passing monorepo-wide.

## 2026-09-12 - Batch 6 seeded: 1,000-Employer V1 Launch Gate crossed

- Approval: user explicitly reviewed and approved the implementation plan and authorized the production write (`seed-employers` and `seed-locations`).
- Scope: researched, validated, and seeded Batch 6 (99 net-new Australian technology employers) with verified street-level head offices, advancing canonical employers from 908 to **1,007**.
- Quality gates: 100% strict evidence contract compliance (`validate_seed_fixture_evidence`: 0 errors), 100% strict address contract compliance (`validate_address_fixture`: valid=True, 0 errors), zero numberless addresses, zero unexplained address reuse, zero domain or slug collisions against existing Neon records.
- Production execution:
  - `seed-employers`: 99 new canonical companies created (`batch6_expansion_cohort_20260912.csv`).
  - `seed-locations`: 99 company locations geocoded via Nominatim (66 resolved, 33 reused existing physical point) with 99 exact first-party `location_source` evidence rows created (`batch6_expansion_cohort_addresses_20260912.csv`).
  - `derive-hiring-signals`: 136 role signals created, 205 skill signals created across active companies.
  - `run-retention-pipeline.mjs`: 99 `location_added` change events derived and committed to `events`.
- Production state: **1,007 active canonical companies** (1,007 unique domains, 1,007 unique slugs), 922 company locations across 917 mapped employers, 2,669 evidence records, 3,235 longitudinal change events, 25 database migrations applied, 411 automated tests passing monorepo-wide.

## 2026-09-11 - R2 immutable-storage verification passed

- Approval and action: after provisioning a private Standard R2 bucket and bucket-scoped object read/write credentials, the user manually ran GitHub Actions workflow `Verify R2 storage`.
- Result: run `34571167209`, job `103173386542` succeeded in 22 seconds. It wrote one small unique content-addressed probe, read it back, and verified its SHA-256 without accessing Neon.
- Production boundary: this proves R2 storage is ready for immutable snapshots. No company, job, location, or source data changed; no ATS crawl was started.
- Next action: the first `Crawl due ATS sources` run remains an explicit production-data approval gate.

## 2026-09-11 - ATS job-count anomaly migration applied

- Approval: the user explicitly approved applying migration `0025` to production Neon.
- Migration: after a read-only preflight confirmed production contained exactly versions 1 through 24, the checksum-locked worker applied exactly `0025_add_ats_source_crawl_metrics.sql`.
- Verification: direct read-back confirmed version 25, its recorded SHA-256 checksum, the `ats_source_crawl_metrics` table, and its two append-only triggers.
- Production boundary: this was schema-only. It registered no source, triggered no crawl, configured no R2 service, and changed no existing job, company, or location data.

## 2026-09-10 - static careers provider migration applied

- Approval: the user explicitly approved applying migration `0023` and registering/crawling the first safe static careers source.
- Migration: the checksum-locked worker applied exactly `0023_add_static_careers_provider.sql` to Neon successfully; it was the sole pending migration.
- Source qualification: a bounded, read-only check of current first-party careers URLs found stale 404 paths or redirects outside the deliberately exact registered-host allowlist. No candidate was registered from that evidence.
- Blocking safety condition: `RAW_SNAPSHOT_BACKEND=r2` and all R2 credentials/bucket settings are absent. The default filesystem backend would strand a production raw snapshot on this local machine, violating immutable-evidence replay guarantees, so no source registration or crawl was attempted.
- Next action: configure R2, then qualify and register one canonical first-party URL with stable JSON-LD jobs before its first crawl.

## 2026-09-10 - static careers source lifecycle

- Commit: `931125e` (`feat: operationalize static careers sources`).
- Scope: registers `static_careers` as a supported job-source provider through forward-only migration `0023`; reuses the existing scheduled source lifecycle; snapshots verified HTML before parsing; persists only schema.org JSON-LD `JobPosting` records with stable HTTP(S) URLs; retains candidate links as discovery-only; and replays snapshots using the recorded final redirect URL.
- Verification: scoped Ruff and formatting checks, strict mypy across 56 source files, and the full ingestion suite passed (**292 passed**, **100 live-PostGIS integration tests skipped** locally). Migration discovery assertions now cover versions 1 through 23. The static pipeline/replay integration test is present and will run in CI's disposable PostGIS service.
- Review: the usual isolated Codex reviewer was quota-blocked and the available Claude Code reviewer timed out without returning a verdict. The user explicitly waived independent AI review and approved direct merge; see `docs/reviews/2026-09-10-static-careers-lifecycle-waiver.md`.
- Residual risk: migration 0023 is committed but not applied to Neon. No static source was registered and no production crawl occurred. A first source requires separate evidence-backed registration and a production-write approval.

## 2026-09-10 - static careers-page discovery foundation

- Commit: `481af52` (`feat: add static careers page parser`).
- Scope: added `selectolax==0.4.11` (Lexbor backend) and a deterministic static parser for registered careers URLs. It extracts schema.org JSON-LD `JobPosting` data and candidate role links, rejects non-HTTP(S) link schemes and credential-bearing URLs, and only marks an empty client-rendered shell as a later Playwright-fallback candidate.
- Politeness and safety: the module uses the existing SSRF-safe pinned fetcher, sends the transparent `AusTechMapBot/1.0` user agent, checks `robots.txt` before the initial URL and every same-host redirect target, and applies a two-second per-host delay with immediate exponential backoff after HTTP 429/503. The shared fetcher gained an optional redirect-policy callback to support this path-level policy safely.
- Verification: scoped Ruff and formatter checks passed; strict mypy passed across all 56 ingestion source files; the final ingestion suite passed **288 tests** with **99 live-PostGIS integration tests skipped**; the frozen-fixture benchmark reported 0.168 ms median and 0.251 ms p95 for 100 parses. An independent read-only review first found the redirect-policy and immediate-backoff defects, then approved the corrected change.
- Residual risk: this is discovery-only. It has no persistence or scheduler integration, does not automatically invoke Playwright, and must not be pointed at a production employer/source until a registered-source lifecycle and an explicit production approval are in place.

This is the audit trail for changes delivered through the bulk autonomous lane in `AGENTS.md`. Each entry records the commit, validation evidence, scope, and residual risk so routine bulk work can proceed without turning the user into a PR messenger.

## 2026-09-09 — policy established

- Commit: `docs: enable bulk autonomous delivery lane` (this commit)
- Scope: establishes the bulk autonomous delivery lane and this log.
- Verification: documentation-only; `git diff --check`.
- Residual risk: the lane is intentionally narrow. Anything that changes production data, security, infrastructure, cost, contracts, or architecture remains outside it.

## 2026-09-09 — Wave 1 seed evidence preflight

- Commit: `feat: prepare bulk Wave 1 seed evidence preflight` (this commit)
- Scope: adds a non-mutating preflight generator and a 67-row candidate fixture derived from captured first-party homepage metadata.
- Verification: Ruff, Ruff formatting, mypy strict, 5 targeted tests, strict seed-fixture evidence validation, and `git diff --check`.
- Residual risk: homepage metadata is only an initial source signal. The fixture is not imported; a bulk Neon seed operation still needs explicit user approval.

## 2026-09-09 — Wave 1 production seed evidence import

- Approval: user explicitly approved the 67-row Wave 1 seed preflight for production Neon in this session.
- Input: `docs/data-quality/wave1-seed-preflight-20260909.csv` from commit `9720b6a`.
- Result: `seed-employers` completed with 67 matched existing companies, 0 created companies, 0 review items, 0 errors, and 0 low-confidence skips.
- Verification: strict fixture evidence validation passed immediately before the import; the importer's returned result is recorded above.
- Residual risk: this adds homepage-backed seed evidence to existing company records only. It does not verify or create a street-level location, and it does not make a company eligible for automatic geocoding.

## 2026-09-09 — Wave 1 official-source location discovery

- Commit: `data: record Wave 1 official-source location discovery` (this commit)
- Scope: scanned the 67 evidence-backed companies' official home, contact, contact-us, and locations pages without using Google Maps or changing Neon.
- Result: one address candidate (InDebted); 66 companies had no reliable street-address text found by the bounded page sweep.
- Verification: candidate-only result; no location fixture was produced, validated, geocoded, or imported.
- Residual risk: company websites can render contact details client-side or keep them on untested paths. The one candidate remains unverified until its exact first-party evidence URL is captured.

## 2026-09-09 — Wave 2/3 exact location-source attribution

- Commit: `data: attach exact first-party location sources` (this commit)
- Scope: rechecked only the 71 existing Wave 2/3 location-discovery candidates and attached the exact official page URL to every extracted address candidate.
- Result: 147 candidate address/source pairs; no fixture, geocode, or Neon write was produced.
- Verification: bounded first-party page fetches only; all output remains discovery evidence.
- Residual risk: candidates can represent multiple offices or a city different from the cohort's claimed city. Selection and strict fixture validation remain required before any map action.

## 2026-09-09 — Wave 2/3 location selection preflight

- Commit: `data: prepare Wave 2/3 location selection preflight` (this commit)
- Scope: selected only complete first-party address candidates that were unique per company or uniquely matched the cohort city.
- Result: 51 rows passed `validate-address-fixture`; four shared-address companies were excluded rather than guessed.
- Verification: no duplicate domains, no shared selected addresses, street numbers, public source URLs, and strict fixture validation all passed.
- Residual risk: this is a production-impacting geocode candidate set. No Neon location write has occurred; an explicit approval is required before `seed-locations` runs.

## 2026-09-09 — Wave 2/3 production location import

- Approval: user explicitly approved the 51-row Wave 2/3 location-selection preflight for production Neon in this session.
- Result: 48 accepted company locations applied. The command timed out after those writes, then an idempotent retry reused all 48 and reported the three unresolved rows.
- Unresolved: `indebted.com` and `sonder.com.au` do not match existing company domains; `skilio.com.au` has no Nominatim match for its sourced address.
- Verification: Neon read-back after the timeout confirmed 48 accepted company locations from the fixture; retry returned 48 reused, 0 new resolves, and the three exceptions above.
- Residual risk: no retry should run until the three exceptions have corrected evidence/domain handling. No unsupported map point was created for them.

## 2026-09-09 — Wave 2/3 canonical-domain location repair preflight

- Commit: `data: prepare Wave 2/3 location repair preflight` (this commit)
- Scope: prepares InDebted (`indebted.co`) and Sonder (`sonder.io`) with corrected canonical domains and official Australian street-address URLs.
- Verification: two rows pass `validate-address-fixture`; Skilio remains excluded because its official source lacks a complete address.
- Residual risk: no Neon write has occurred. This repair fixture needs explicit approval before geocoding/import.

## 2026-09-09 — Wave 2/3 canonical-domain location repair import

- Approval: user explicitly approved the two-row repair fixture for production Neon in this session.
- Result: 2 locations resolved, 0 reused, 0 errors, and 0 unmatched domains.
- Verification: importer completed successfully against the validated fixture.

## 2026-09-09 — live cohort reconciliation

- Commit: `docs: record live cohort reconciliation` (this commit)
- Scope: read-only Neon inventory for the current company, accepted-location, ambiguous-location, and pending-review counts.

## 2026-09-09 — Wave 2 / Wave 3 triage, homepage evidence, seed preflight

- Commit: `data: prepare Wave 2/3 cohort evidence preflight` (`d9f282d`)
- Scope: records non-mutating Wave 2/3 cohort fixtures, triage manifests, homepage metadata harvests, and evidence-backed seed preflights (135 + 114 rows). Updates `docs/data-quality/README.md` with counts.
- Verification: strict `validate_seed_fixture_evidence` passed for both preflights; `git diff --check`.
- Residual risk: homepage metadata is only an initial source signal. Neon `seed-employers` remains a separate production write requiring explicit user approval.

## 2026-09-09 — Wave 2 / Wave 3 production seed evidence import

- Approval: user directed “do what’s needed” after being asked to approve Wave 2/3 Neon seed in this session.
- Inputs: `docs/data-quality/wave2-seed-preflight-20260909.csv` (135 rows) and `wave3-seed-preflight-20260909.csv` (114 rows) from commit `d9f282d`.
- Results:
  - Wave 2: `seed-employers` → 131 matched, 0 created, 4 review, 0 errors, 0 low-confidence skips.
  - Wave 3: `seed-employers` → 0 matched, 113 created, 1 review, 0 errors, 0 low-confidence skips.
- Verification: strict fixture evidence validation passed immediately before each import; importer JSON results recorded above.
- Residual risk: adds homepage-backed seed evidence (and Wave 3 new company rows) only. Does not verify or create street-level locations, and does not make companies eligible for automatic geocoding. Five domains were queued for review rather than auto-accepted.

## 2026-09-09 — Wave 2 / Wave 3 official-source location discovery

- Commit: `feat: harvest Wave 2/3 first-party location candidates` (this commit)
- Scope: adds reusable `harvest-cohort-location-candidates` CLI; sweeps official home/contact/contact-us/locations/support pages for Waves 2 and 3 without Google Maps or Neon writes.
- Result: Wave 2 **39**/135 companies with AU-state street candidates; Wave 3 **32**/114. Remaining rows are `no_candidate_found`.
- Verification: 7 cohort triage tests, ruff, mypy strict on changed module, `git diff --check`.
- Residual risk: candidates are regex-extracted discovery text and may include multi-office or noisy matches. No address fixture, validation, geocode, or Neon location import was performed.

## 2026-09-09 — docs status sync (README + HANDOFF)

- Commit: `docs: sync README and HANDOFF for Wave 2/3 progress` (this commit)
- Scope: brings root `README.md` status and `HANDOFF.md` current with Wave 2/3 seed + location-discovery outcomes; clarifies next gate is verified address fixtures only.
- Verification: documentation-only; `git diff --check`.
- Residual risk: live Neon employer/job totals in older HANDOFF verification bullets may lag post-seed creates until the next live inventory query.

## 2026-09-10 — ambiguous-location first-party repair preflight

- Commit: `data: prepare ambiguous-location repair preflight` (this commit)
- Scope: read-only bulk research against 357 live ambiguous-location companies without active location-source evidence. It records reachability, homepage capture outcomes, exact first-party page/address candidates, the current ambiguous input context, and a conservative selection/review split.
- Result: 191 domains were reachable; 190 homepages were captured; 29 domains produced AU-street candidate text. The 19 single or locality-matching complete candidates in `ambiguous-location-repair-preflight-20260910.csv` pass `validate-address-fixture`. Ten candidate-bearing domains remain in explicit review because they have multiple complete offices or incomplete addresses; 328 domains have no safe selection from this bounded pass.
- Verification: bounded first-party fetches only, strict address-fixture validation (19 rows, no errors or duplicate addresses), and `git diff --check`.
- Residual risk: no candidate has been geocoded or imported, and no Neon write occurred. Production geocoding/import remains an explicit approval gate; non-selected domains remain quarantined rather than inferred.

## 2026-09-10 — ambiguous-location linked-page follow-up

- Commit: `data: expand ambiguous-location repair preflight` (this commit)
- Scope: a second bounded, read-only first-party pass followed location-shaped links from the 161 reachable domains with no candidate in the standard path sweep.
- Result: six additional domains produced address text. Five safe selections were added to the preflight (four single complete candidates and one exact locality match), bringing it to 24 validated rows; the sixth remains multi-office review.
- Verification: strict address-fixture validation (24 rows, no errors or duplicate addresses) and `git diff --check`.
- Residual risk: no candidate has been geocoded or imported. Production geocoding/import remains an explicit approval gate.

## 2026-09-10 — Pinpoint public ATS feed implementation

- Branch / commits: `feat/pinpoint-public-feed` at `9823eff`, `b54fe35`, and `681caf7`; fast-forwarded to `main` under the user's explicit independent-review waiver, recorded in `docs/reviews/2026-09-10-pinpoint-public-feed-waiver.md`.
- Scope: added Pinpoint's documented unauthenticated public careers feed (`https://{company-subdomain}.pinpointhq.com/postings.json`) as a structured ATS provider. The worker snapshots bytes before parsing, supports read-only replay, validates safe subdomain identifiers, and preserves the existing source scheduling/kill-switch lifecycle.
- Migration: new forward-only `0024_add_pinpoint_ats_provider.sql`; it is **not** applied to Neon.
- Verification: 301 passed, 101 skipped locally; strict mypy and targeted Ruff passed. The live PostGIS integration coverage runs in CI once the branch is reviewed/merged.
- Production state: no Pinpoint company source has been registered and no crawl has run. Cloudflare R2 remains deferred, so no new production snapshot-backed source should be activated.

## 2026-09-11 — Pinpoint provider migration applied to Neon

- Approval: the user explicitly approved applying `0024_add_pinpoint_ats_provider.sql` to production Neon.
- Result: the checksum-locked runner applied exactly migration 24.
- Verification: direct read-back confirmed schema version `24`, filename `0024_add_pinpoint_ats_provider.sql`, a stored checksum, and `pinpoint` in the `ats_provider` enum.
- Production state: no Pinpoint company source is registered and no crawl has run. R2 remains deferred, so no snapshot-backed production source should be activated yet.

## 2026-09-10 — Breezy HR adapter foundation

- Commits: `e30a7e3` (`feat: add Breezy ATS adapter`) and `556f683` (`fix: harden Breezy ATS ingestion`).
- Scope: added the public `https://{company}.breezy.hr/json` adapter, provider validation, crawl dispatch, snapshot replay, work-style normalisation, hostname validation, and parser tests. Stake's live public board was used only to verify the response shape; it returned 16 active jobs at research time.
- Verification: scoped Ruff and strict mypy passed; the full ingestion suite passed **277 tests** with **99 integration tests skipped** because no live PostGIS service is available in this workspace; `git diff --check` passed.
- Review: an isolated read-only Codex review found and the follow-up commit fixed unknown work-style inference, parse-before-store ordering, and malformed UTF-8 handling. A final independent review approved the result.
- Residual risk: no Breezy source has been registered in Neon and no Breezy production crawl has run. Stake source registration and ingestion remain explicit production-write approval gates.

## 2026-09-10 — Breezy provider database prerequisite

- Commits: `69d61a8` (`db: add Breezy ATS provider`) and `af391b9` (`test: update migration application expectation`).
- Scope: added forward-only migration `0022_add_breezy_ats_provider.sql`, which adds `breezy` to Neon’s `ats_provider` enum. The clean-database migration integration assertion now expects all versions 1 through 22 rather than its stale 1-through-16 range.
- Verification: migration-contract tests passed (3 passed; 8 live-PostGIS integration tests skipped locally) and an independent read-only review approved the migration and correction.
- Production state: migration 0022 has not been applied to Neon. A Stake registration attempt was rejected by the current enum before any company ATS source or job was written.

## 2026-09-10 — Stake Breezy production registration and initial crawl

- Approval: the user gave full authority in this session to complete the reviewed Breezy rollout, including production migration, source registration, and initial crawl.
- Migration: `0022_add_breezy_ats_provider.sql` applied successfully to Neon; it was the only pending migration.
- Result: registered Stake (`hellostake.com`) as `breezy/stake`, then completed crawl `bf390c7b-f0db-4e1f-b381-1a6d85750c28`: 16 jobs created, zero updates, zero expirations, 16 active job observations, and one immutable raw snapshot.
- Verification: read-back confirms an active source, zero consecutive failures, a recorded source success, migration 22 present, and the succeeded import run/snapshot. Platform totals are 58 active ATS sources, 2,081 active jobs, and 57 active hiring employers.
- Remediation note: the first headerless request was rejected as HTTP 403 before parsing or job persistence. The reviewed follow-up (`bfd2e79`) added a transparent `AusTechMapBot/1.0` user agent and JSON `Accept` header; the successful retry used that contract.

## 2026-09-10 — ambiguous-location repair production import

- Approval: user explicitly approved geocoding and importing the 28-row `ambiguous-location-repair-preflight-20260910.csv` fixture to production Neon in this session.
- Result: `seed-locations` completed with 24 newly resolved locations, four reused locations, zero errors, and zero unmatched domains.
- Verification: all 28 fixture rows were read back as an accepted company location paired with their exact active first-party source-evidence URL. Live totals after import: 908 companies, 501 companies with an accepted location, 388 with an ambiguous linked location, and nine pending review items.
- Residual risk: 11 candidate-bearing companies remain quarantined because their evidence is incomplete or represents multiple offices; the remaining queue has no safe first-party selection from the bounded automated passes.

## 2026-09-10 — ambiguous-location review-case resolution preflight

- Commit: `data: resolve ambiguous-location review cases` (this commit)
- Scope: re-examined the 11 review cases against raw first-party source context, without Google Maps or a Neon write.
- Result: six formerly incomplete or locality-matched cases now have complete first-party address evidence and pass strict fixture validation. Five remain deliberately quarantined: three lack a location match among multiple offices, one has multiple offices without an exact match, and one has only a US office in the source.
- Verification: 31 bounded source-context captures and `validate-address-fixture` (six rows, no errors or duplicate addresses).
- Residual risk: the six-row preflight has not been geocoded or imported; production promotion remains an explicit approval gate.

## 2026-09-10 — ambiguous-location review repair production import

- Approval: user explicitly approved geocoding and importing the six-row `ambiguous-location-review-repair-preflight-20260910.csv` fixture to production Neon in this session.
- Result: `seed-locations` completed with six newly resolved locations, zero reused locations, zero errors, and zero unmatched domains.
- Verification: all six fixture domains were read back with an accepted location and their exact active first-party source-evidence URL. One address used the importer's documented query fallback before successful geocoding; this is preserved in the company-location raw address and remains paired with the same cited source. Live totals after import: 506 companies with an accepted location, 388 with an ambiguous linked location, and nine pending review items.
- Residual risk: five reviewed companies remain deliberately quarantined. They need a human or a new authoritative source to distinguish a correct office without guessing.

## 2026-09-10 — residual ambiguous-location cleanup inventory

- Commit: `data: inventory residual ambiguous locations` (this commit)
- Scope: read-only Neon audit of every ambiguous company-location link after the approved repair imports.
- Result: 388 ambiguous links remain. Seventy-six are superseded by an accepted location for the same company; 312 have no active first-party location evidence and remain a research queue.
- Verification: direct read-only database query; no location, evidence, or company record changed.
- Residual risk: unlinking superseded ambiguous records is a production mutation and must be separately approved and audited. The 312 evidence-free records cannot be safely auto-resolved.

## 2026-09-10 — superseded ambiguous-link production cleanup

- Approval: user explicitly approved unlinking the 76 superseded ambiguous company-location records in production Neon in this session.
- Scope: deleted only an ambiguous `company_locations` link where the same company already had an accepted location. The shared `resolved_locations` records and all evidence were retained.
- Result: 76 links were unlinked and 76 append-only audit records were written. A pre-delete foreign-key check confirmed zero job references.
- Verification: post-write read-back reports 312 ambiguous links/companies, zero remaining superseded ambiguous links, and 76 cleanup audit records.
- Residual risk: the remaining 312 links have no active first-party location evidence; they remain a research queue and were not inferred or altered.

## 2026-09-10 — evidenced-location promotion workflow hardening

- Commit: `feat: harden evidenced location promotion` (this commit)
- Scope: completed the existing Cursor draft for the opt-in `promote-evidenced-locations` worker command.
- Result: promotion remains dry-run by default and now clears stale G-NAF/candidate metadata when a fresh external geocode is accepted. A focused integration test covers dry-run behavior, audited promotion, and the resulting accepted state.
- Verification: Ruff, mypy strict, and the ingestion suite (268 passed, 99 integration/environment skips locally). The new live-PostGIS integration test will run where `TEST_DATABASE_URL` is configured.
- Residual risk: the command is intentionally narrow. It only promotes an already-linked ambiguous location with exact active first-party source evidence; it does not replace `seed-locations` for newly researched addresses.

## 2026-09-10 — complete residual ambiguous-location research sweep

- Commit: `data: research remaining ambiguous locations` (this commit)
- Scope: rechecked all 312 live ambiguous company-location links without active first-party location evidence, using only canonical company sites, standard contact/location paths, and same-origin location-shaped links.
- Result: two safe locality-matching, complete first-party addresses were selected and pass strict fixture validation. Of the remaining 310, 127 domains were unreachable, 178 were reachable without a street candidate, and five had only mismatched or multi-office candidates.
- Verification: bounded first-party fetches only; exact source/candidate manifest retained; `validate-address-fixture` passed for the two-row preflight.
- Residual risk: no production write occurred. The two-row preflight requires explicit approval before geocoding/import; the other 310 records remain unresolved rather than inferred.

## 2026-09-10 — final residual repair production import

- Approval: user explicitly approved geocoding and importing the two-row `remaining-ambiguous-location-repair-preflight-20260910.csv` fixture to production Neon in this session.
- Result: `seed-locations` completed with two newly resolved locations, zero reused locations, zero errors, and zero unmatched domains.
- Verification: both fixture domains were read back with an accepted location and exact active first-party source evidence. Live accepted-location coverage is now 508 companies.
- Residual risk: the imported companies' original ambiguous links are now two new superseded-link cleanup candidates. The other 310 records remain unresolved rather than inferred.

## 2026-09-10 — final superseded-link production cleanup

- Approval: user explicitly approved unlinking the two superseded ambiguous company-location records in production Neon in this session.
- Result: two links were unlinked after a zero-job-reference check, with two append-only audit records written. No accepted locations, shared resolved locations, or evidence records were removed.
- Verification: post-write read-back reports 310 ambiguous links, 508 companies with an accepted location, 78 total superseded-link cleanup audit records, and zero remaining superseded ambiguous links.
- Residual risk: the remaining 310 links have no active first-party location evidence and remain a research queue.

## 2026-09-10 — deep first-party structured-data location sweep

- Commit: `data: deepen remaining location research` (this commit)
- Scope: rechecked all 178 reachable records without a visible street candidate using first-party structured address data and the same bounded official-page rules.
- Result: six complete, unique official address candidates were found and pass strict fixture validation. The residual queue falls to 304: 127 unreachable, 172 with no candidate after both passes, and five mismatched or multi-office cases.
- Verification: bounded official-site fetches only; exact candidate/source manifest retained; `validate-address-fixture` passed for the six-row preflight.
- Residual risk: no production write occurred. The six-row fixture needs explicit approval before geocoding/import; the remaining 304 locations have no safe automatic resolution.

## 2026-09-10 — deep first-party repair production import

- Approval: user explicitly approved geocoding and importing the six-row `deep-first-party-location-repair-preflight-20260910.csv` fixture to production Neon in this session.
- Result: `seed-locations` completed with four newly resolved locations, two reused locations, zero errors, and zero unmatched domains.
- Verification: all six fixture domains were read back with an accepted location and exact active first-party source evidence. Live accepted-location coverage is now 514 companies.
- Residual risk: the six imported companies' original ambiguous links are new superseded-link cleanup candidates. The other 304 records remain unresolved rather than inferred.

## 2026-09-10 — deep-repair superseded-link production cleanup

- Approval: user explicitly approved unlinking the six superseded ambiguous company-location records in production Neon in this session.
- Result: six links were unlinked after a zero-job-reference check, with six append-only audit records written. No accepted locations, shared resolved locations, or evidence records were removed.
- Verification: post-write read-back reports 304 ambiguous links, 514 companies with an accepted location, 84 total superseded-link cleanup audit records, and zero remaining superseded ambiguous links.
- Residual risk: the remaining 304 links have no active first-party location evidence and remain a research queue.

## 2026-09-10 — ambiguous-location canonical-host recovery

- Commit: `data: recover ambiguous-location address evidence` (this commit)
- Scope: a bounded, read-only retry on `www` and HTTP canonical-host variants for the 166 initially unreachable domains, followed by the same standard first-party location-path sweep on recovered domains.
- Result: 36 domains were recovered; four produced single complete first-party address candidates. The repair preflight now has 28 rows, all passing strict validation; no additional multi-office case was selected.
- Verification: bounded first-party fetches only, strict address-fixture validation (28 rows, no errors or duplicate addresses), and `git diff --check`.
- Residual risk: no candidate has been geocoded or imported. Production geocoding/import remains an explicit approval gate.

## 2026-09-11 — first production due-source crawl with R2 snapshots

- Approval: the user explicitly approved the first production `Crawl due ATS sources` workflow after
  completing the private R2 bucket, credentials, and immutable probe gate.
- Result: GitHub Actions run [`34571550432`](https://github.com/jeevanshah/AusTechMap/actions/runs/34571550432)
  completed successfully on `main`. It processed all 56 sources due at dispatch time; every
  `ats_job_fetch` run succeeded and no active source remained due at completion.
- Verification: direct production read-back confirmed 56 immutable R2-backed raw snapshots totaling
  23,018,197 bytes, 56 matching append-only crawl metrics, zero job-count anomalies, and 2,156 job
  observations. Attempt metrics total 2,068 fetched postings, 91 jobs created, 21 updated, 1,956
  unchanged, and 89 expired. No retry, dead-letter, or failed outcome was recorded.
- Operational state: raw-snapshot storage and the first manual production crawl are now verified.
  The crawl workflow remains manually dispatched; automatic scheduling stays deferred until the
  Railway/freshness-SLA milestone.

## 2026-09-11 — verified ATS source expansion staged for first crawl

- Approval: the user explicitly approved registering and crawling five newly verified ATS sources,
  and pausing Mable's SmartRecruiters source in favour of its verified Lever source.
- Fresh board validation: CreditorWatch/Workable returned 10 postings, DUG/Breezy 12,
  LegalVision/Workable 29, Lyka/Workable 16, Mable/Lever 22, and Zutec/Workable 3.
- Result: all six source registrations were created with no conflicts. Mable's existing
  `smartrecruiters/mable` source was paused—not deleted—with an append-only status-change audit
  record; its new `lever/mable` source is active.
- Verification: direct production read-back confirms each new source is active with zero consecutive
  failures and currently due. Mable's former SmartRecruiters source is paused and excluded from
  due-source selection.
- Next action: dispatch the already approved manual `Crawl due ATS sources` workflow. At this point
  the only due active sources are the six registrations above, so the workflow is bounded to this
  batch.

## 2026-09-11 — verified ATS source expansion crawl completed with R2 snapshots

- Workflow dispatch: user manually dispatched `Crawl due ATS sources` on `main` (`4b37b14`) with input `CRAWL_DUE_SOURCES`.
- Result: GitHub Actions run [`34601208896`](https://github.com/jeevanshah/AusTechMap/actions/runs/34601208896), job `103268679082` completed successfully in 1m 19s (12:52:46–12:54:05 UTC).
- Scope: processed all 6 due sources (CreditorWatch, DUG, LegalVision, Lyka, Mable Lever board, and Zutec).
- Provider idempotency fix: the Lever crawl for Mable executed cleanly without same-day key collision against the earlier SmartRecruiters crawl, validated by the provider-scoped idempotency key fix in `4368287`.
- Production state: all 6 due sources crawled successfully with immutable raw snapshots stored in R2. Zero due active sources remain.

## 2026-09-11 — SafetyCulture Ashby ATS source registered

- Approval: user explicitly approved registering SafetyCulture (`safetyculture.com`) on Ashby (`ashby:mitti`).
- Verification: live endpoint probe (`https://api.ashbyhq.com/posting-api/job-board/mitti`) returned 39 active postings (19 Sydney software/security/product engineering roles).
- Result: registered source `1fb13f46-beab-4f0e-864c-982a67dce928` on Neon with status `active` and due for crawl. Direct read-back confirms 1 due source.
- Next action: manually dispatch `Crawl due ATS sources` workflow on GitHub Actions with input `CRAWL_DUE_SOURCES`.

## 2026-09-11 — SafetyCulture Ashby ATS crawl completed with R2 snapshots

- Workflow dispatch: user manually dispatched `Crawl due ATS sources` on `main` (`75d7306`) with input `CRAWL_DUE_SOURCES`.
- Result: GitHub Actions run [`34605582244`](https://github.com/jeevanshah/AusTechMap/actions/runs/34605582244) completed successfully in 1m 30s (13:39:43–13:41:13 UTC).
- Scope: crawled SafetyCulture (`ashby:mitti`), successfully ingesting all 39 open positions (including 19 Sydney software, platform, security, and product roles).
- Snapshot & metrics: immutable raw snapshot written to Cloudflare R2; crawl metrics and job observations persisted.
- Post-crawl derivations: `derive-hiring-signals` created 3 new role signals and 15 new skill signals across 63 companies; `run-retention-pipeline.mjs` derived 39 new `job.first_seen` events into `events`.
- Platform totals: 64 active ATS sources, 2,206 live unexpired jobs, 3,129 longitudinal change events. Zero due active sources remain.

## 2026-09-12 — Harrison.ai Ashby ATS source registered

- Approval: user explicitly approved registering Harrison.ai (`harrison.ai`) on Ashby (`ashby:harrison.ai`).
- Verification: live endpoint probe (`https://api.ashbyhq.com/posting-api/job-board/harrison.ai`) returned 7 active postings (including Australian engineering and finance roles in Perth and Sydney).
- Result: registered source `3ab7dd4e-5537-4b09-b29d-f795ac1ce110` on Neon with status `active` and due for crawl. Direct read-back confirms 1 due source.
- Next action: manually dispatch `Crawl due ATS sources` workflow on GitHub Actions with input `CRAWL_DUE_SOURCES`.

## 2026-09-12 — Harrison.ai Ashby ATS crawl completed with R2 snapshots

- Workflow dispatch: user manually dispatched `Crawl due ATS sources` on `main` (`0f2cc88`) with input `CRAWL_DUE_SOURCES`.
- Result: GitHub Actions run [`34659857835`](https://github.com/jeevanshah/AusTechMap/actions/runs/34659857835) completed successfully in 40s (23:55:49–23:56:29 UTC).
- Scope: crawled Harrison.ai (`ashby:harrison.ai`), successfully ingesting all 7 open positions (including Perth radiology deployment engineering and Sydney financial analysis roles).
- Snapshot & metrics: immutable raw snapshot written to Cloudflare R2 (`raw/ats-ashby-harrison-ai/4b/4b7a229d5cfa4b93bca2a9cfe774b49cb4ad8ce4b9266d8347d6f7094623c14c`, 134,690 bytes); crawl metrics and job observations persisted.
- Bugfix & reconciliation: diagnosed dotted identifier failure in `source_key` (`ValueError`), added `build_ats_source_key` slug sanitization (`653203b`), and added claim `source_id` reconciliation for retried runs (`0f2cc88`).
- Post-crawl derivations: `derive-hiring-signals` created 9 new skill signals and updated 196 skill signals across 64 companies; `run-retention-pipeline.mjs` derived 7 new `job.first_seen` events into `events`.
- Platform totals: 65 active ATS sources, 2,213 live unexpired jobs, 3,136 longitudinal change events. Zero due active sources remain.

## 2026-09-12 — Phase 5 ATS scaleup crawl and post-crawl derivations

- Scope: crawled 32 uncrawled active ATS sources across Lever, Ashby, Greenhouse, and Workable (Batch 6 + scaleup cohort).
- Results: 32/32 crawls succeeded with zero unhandled exceptions.
  - Airlock Digital (`greenhouse:airlockdigital`): 25 jobs
  - Macquarie Technology Group (`lever:macquarietechnologygroup`): 17 jobs
  - Swoop Telecom (`ashby:swoop`): 13 jobs
  - Appen (`lever:appen`): 19 jobs
  - hipages Group (`greenhouse:hipagesgroup`): 10 jobs
  - Quantium (`greenhouse:quantium`): 31 jobs
  - Plenti (`lever:plenti`): 11 jobs
  - Prezzee (`greenhouse:prezzee`): 9 jobs
  - Spaceship (`greenhouse:spaceship`): 1 job
  - SunDrive Solar (`lever:sundrivesolar`): 1 job
  - Splend Tech (`lever:splend`): 10 jobs
  - Polynovo (`greenhouse:polynovo`): 12 jobs
  - Who Gives A Crap (`greenhouse:whogivesacrap`): 8 jobs
  - Enboarder (`greenhouse:enboarder`): 5 jobs
  - Easygo Gaming (`greenhouse:easygo`): 32 jobs
  - Cyara (`lever:cyara`): 19 jobs
  - Ignition (`ashby:ignition`): 10 jobs
  - Alembic (`ashby:alembic`): 10 jobs
  - Coupa Software AU (`lever:coupa`): 31 jobs
  - Dataro (`ashby:dataro`): 2 jobs
  - Cape (`ashby:cape`): 26 jobs
  - Liven (`ashby:liven`): 2 jobs
  - 10 active boards had 0 currently listed roles (Procreate, Vast Solar, mx51, Tibra Capital, Rumin8, Wisr, Stax, Sendle, VGW, Catch).
- Ingested metrics: **304 net-new live job postings** persisted with content-addressed raw snapshots and taxonomy skill mapping.
- Post-crawl derivations:
  - `derive_employer_hiring_signals`: derived 171 new role signals and 278 new skill signals across 87 active hiring employers (bringing platform totals to 566 role signals and 859 skill signals).
  - `run-retention-pipeline.mjs`: derived **314 new longitudinal `job.first_seen` change events** into `events` table (bringing total to 3,597 change events). Verified 100% idempotency with 0 new events on re-run.
- Production state:
  - Canonical Active Companies: **1,007**
  - Mapped Physical Addresses: **965** (95.83%)
  - Active Monitored ATS Sources: **97** (97 crawled, 100.0% coverage)
  - Active Live Jobs: **2,527**
  - Active Hiring Employers: **87**
  - Verified Job Skill Links: **1,750**
  - Longitudinal Change Events: **3,597**
  - Automated Tests Passing: **531** (46 contracts + 178 web + 307 ingestion)

## 2026-09-12 — Phase 5 ATS scaleup toward 150 sources (123 active sources)

- Scope: registered and crawled 26 net-new verified ATS sources across Ashby, Greenhouse, Lever, Workable, Breezy, and Pinpoint for prominent Australian scaleups and technology employers.
- Boards registered & crawled:
  - Heidi Health (`ashby:heidihealth.com.au`): 90 jobs
  - Partly (`ashby:partly.com`): 38 jobs
  - Propeller Aero (`workable:propeller`): 26 jobs
  - BlueRock (`workable:the-blue-rock`): 15 jobs
  - Actionstep (`workable:actionstep`): 10 jobs
  - Cover Genius (`pinpoint:covergenius`): 3 jobs
  - WiseTech Global (`pinpoint:wisetechglobal`): 3 jobs
  - Assignar (`breezy:assignar`): 2 jobs
  - Montu (`greenhouse:montu`): 1 job
  - HappyCo (`lever:happyco`): 8 jobs
  - Tracksuit Australia (`ashby:tracksuit`): 18 jobs
  - Willow Technology (`lever:willowinc`): 4 jobs
  - Samsara Networks AU (`greenhouse:samsara`): 262 jobs
  - Canary Technologies AU (`lever:canarytechnologies`): 26 jobs
  - Behavox AU (`greenhouse:behavox`): 43 jobs
  - Fareharbor AU (`greenhouse:fareharbor`): 23 jobs
  - Forter Australia (`greenhouse:forter`): 33 jobs
  - LearnUpon AU (`greenhouse:learnupon`): 14 jobs
  - Machinify AU (`greenhouse:machinifyinc`): 49 jobs
  - Raiz Invest (`pinpoint:raiz`): 5 jobs
  - 1Breadcrumb (`ashby:breadcrumb`): 1 job
  - Telnyx (`greenhouse:telnyx54`): 54 jobs
  - 4 verified boards currently listing 0 open positions (IntelliHR, Reejig, Stile Education, Skedulo).
- Ingested metrics: **728 postings fetched, 723 net-new live positions persisted** to Neon DB.
- Post-crawl derivations:
  - `derive_employer_hiring_signals`: derived 43 new role signals and 53 new skill signals across 109 active hiring employers (bringing platform totals to 609 role signals and 912 skill signals).
  - `run-retention-pipeline.mjs`: derived **723 new longitudinal `job.first_seen` change events** into `events` table (bringing total to 4,320 change events). Verified 100% idempotency with 0 new events on re-run.
- Production state:
  - Canonical Active Companies: **1,007**
  - Mapped Physical Addresses: **965** (95.83%)
  - Active Monitored ATS Sources: **123** (123 crawled, 100.0% coverage)
  - Active Live Jobs: **3,250** (jumped from 2,527)
  - Active Hiring Employers: **109** (jumped from 87)
  - Verified Job Skill Links: **1,988**
  - Longitudinal Change Events: **4,320**
  - Automated Tests Passing: **531** (46 contracts + 178 web + 307 ingestion)
