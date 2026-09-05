# Australia Tech Map — Implementation Plan

> Execution plan derived from [PRODUCT_SPEC.md](./PRODUCT_SPEC.md). [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md) is authoritative for technology choices where it conflicts with either document.  
> Version 3.2 · 5 September 2026

## 1. Objective

Deliver a production-ready Australian technology-employment intelligence platform that lets users discover employers on a map, search for relevant opportunities, inspect evidence-backed hiring and sponsorship information, compare regional signals, and save searches or watches for alerts.

The V1 launch target is 1,000 deliberately selected, well-enriched employers. Data quality, provenance, freshness, and explainability take priority over raw record count.

## 2. Delivery assumptions

- Delivery team: one primary developer using coding agents, with founder/product review.
- Architecture: modular Next.js application with independent Python ingestion workers.
- Primary datastore: PostgreSQL with PostGIS.
- Search: PostgreSQL full-text search and `pg_trgm` for V1.
- Hosting: Neon (managed PostgreSQL + PostGIS) and Cloudflare R2 (object storage). GitHub Actions runs ingestion jobs through the alpha; production-grade scheduling moves to a Railway cron-enqueuer + worker before Phase 5's freshness gate goes live. See [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md).
- Estimates are relative working ranges, not commitments. Re-estimate after the first live government import and the first three employer-source adapters.
- Commercial features are designed into permissions and data boundaries but implemented after repeat user utility is demonstrated.

## 3. V1 boundary

### Included

- Employer identity, aliases, categories, and multiple mapped locations.
- Australia-wide map with clustering, viewport queries, and filters.
- Employer, job, role, skill, and location search.
- Employer profiles with source and freshness information.
- ATS and careers-page ingestion with immutable job observations.
- Evidence-backed sponsorship and regional-migration information.
- Regional labour indicators and versioned opportunity scores.
- Explainable Opportunity Match ranking.
- Saved searches, employer/region watches, and deduplicated alerts.
- Admin review, data-health monitoring, source controls, and audit history.

### Excluded from V1

- Native mobile applications.
- Direct job applications within the platform.
- Employee reviews and salary crowdsourcing.
- An AI career coach or opaque predictive ranking.
- Microservices, Kafka, or a dedicated search cluster without measured need.
- Paid placement that modifies organic rankings or evidence.

## 4. Target architecture

```text
Next.js web application
    ├── public map, search, employer and region pages
    ├── authenticated saved searches, watches and alerts
    └── admin review and data-health tools
                         │
                 versioned API layer
                         │
              PostgreSQL + PostGIS
                         │
    ┌────────────────────┼─────────────────────┐
    │                    │                     │
Government imports  Employer crawlers   Enrichment/scoring
    │                    │                     │
    └──────── raw snapshots + observations ───┘
                         │
              change-event derivation
                         │
               notification delivery
```

The critical delivery path is:

```text
Product contracts
  → platform foundation
  → geographic foundation
  → employer identity
  → map/search MVP
  → hiring observations
  → evidence and regional intelligence
  → opportunity matching and alerts
  → production hardening and launch
```

## 5. Delivery phases

| Phase | Outcome | Indicative effort | Depends on |
| :--- | :--- | :--- | :--- |
| 0 | Product and data contracts agreed | 1 week | — |
| 1 | Repository, environments, database, and CI/CD ready | 1–2 weeks | Phase 0 |
| 2 | Australian geography can be imported and queried | 2–3 weeks | Phase 1 |
| 3 | Canonical employer graph and review workflow operational | 3–4 weeks | Phases 1–2 |
| 4 | Public map, search, and employer profiles usable | 3–4 weeks | Phase 3 |
| 5 | Hiring ingestion and longitudinal observations operational | 4–6 weeks | Phase 3 |
| 6 | Sponsorship and regional intelligence published safely | 3–4 weeks | Phases 2, 3, 5 |
| 7 | Opportunity Match, watches, events, and alerts operational | 4–5 weeks | Phases 4–6; private alpha validated |
| 8 | Production hardening and 1,000-employer launch dataset | 3–5 weeks | Phases 4–7 |
| 9 | Commercial readiness after product utility is proven | Post-launch | Phase 8 |

Phase durations above are indicative and overlap in practice — treat the table as task sequencing, not additive duration. Plan delivery against these milestones instead:

| Milestone | Scope | Target duration |
| :--- | :--- | :--- |
| Working alpha | Phases 0–4, Phase 5 narrowed to 3 ATS adapters, Phase 6 Track 6A only; 100–200 employers | 10–14 weeks |
| Private beta | Full Phase 5 (300-source target) and Phase 6 complete; alpha feedback incorporated | + 10–16 weeks |
| Production-quality V1 | Phases 7–8 complete: Opportunity Match, alerts, full hardening, 1,000-employer coverage | ~9–12 months total |

The original 24–34-week phase-summed figure describes a demonstration-quality build, not a trustworthy production data platform. Re-forecast against the milestones above once the alpha ships, and review the forecast at every phase gate regardless.

## 6. Phase details

### Phase 0 — Product and data contracts

Goal: remove ambiguity before implementation.

- [x] Freeze V1 role-family, employer-category, work-style, and evidence taxonomies. See PRODUCT_SPEC.md Appendix A and §8.1. **Correction (5 September 2026):** this line originally also claimed skill and seniority taxonomies were frozen here — verified directly against Appendix A while scoping Phase 5 and found neither is actually enumerated anywhere in PRODUCT_SPEC.md. Split out below as real Phase 5 deliverables instead of silently building on an inflated claim.
- [x] Author and seed a v1 job-seniority enum (Phase 5, not frozen in Appendix A — `job_seniority`, migration `0009`: junior/mid/senior/staff_principal/management/unknown).
- [x] Author and seed a v1 skills taxonomy, versioned/extensible (Phase 5, not frozen in Appendix A — `skills` table, migration `0009`, ~36 starter rows, `category` is `CHECK`-constrained TEXT so it can grow without an `ALTER TYPE`).
- [x] Define canonical employer identity and merge rules. See PRODUCT_SPEC.md §§6.2–6.3.
- [x] Define source policy: allowed retrieval, attribution, retention, freshness, and disable procedure. See PRODUCT_SPEC.md §§5, 7, and 12.3.
- [x] Define sponsorship evidence categories and prohibited claims. See PRODUCT_SPEC.md §8.
- [x] Specify score methodology, sufficiency rules, version fields, and suppression behaviour. See PRODUCT_SPEC.md §§9 and 18 plus Appendix D.
- [x] Specify change-event, alert-deduplication, and notification-preference contracts. See PRODUCT_SPEC.md §6.8 and Appendix D.
- [x] Create 20–30 golden user queries covering role, skill, location, regional, remote, and sponsorship needs. See [docs/golden-queries.md](./docs/golden-queries.md).
- [x] Record architecture decisions for the database, map provider, storage, hosting, authentication, email, and analytics. See [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md).
- [x] Define p95 latency SLOs for map and search endpoints on desktop and mobile networks, and the relevance-acceptance method for golden queries. See ARCHITECTURE_DECISIONS.md §4.5 and [docs/golden-queries.md](./docs/golden-queries.md).
- [x] Decide authentication roles, admin MFA enforcement, and the account-deletion procedure. See ARCHITECTURE_DECISIONS.md §4.1.
- [x] Specify production job scheduling: retry policy, lease/heartbeat model, and failure-recovery procedure for the import-run table. See ARCHITECTURE_DECISIONS.md §4.2.
- [x] Specify G-NAF storage, indexing, update cadence, and batch-processing procedure in enough detail to build against. See ARCHITECTURE_DECISIONS.md §4.3.
- [x] Decide database backup, restore, and retention policy, and its expected storage cost. See ARCHITECTURE_DECISIONS.md §4.4.

Exit gate: schemas and policies are approved, golden queries are documented, performance and relevance targets are recorded, the five operational decisions above are resolved, and no unresolved decision blocks database work.

Status: closed on 4 September 2026. Service provisioning and implementation-time verification remain Phase 1 work; they are not reopened product decisions unless evidence forces an ADR change.

### Phase 1 — Platform foundation

Goal: establish a safe, repeatable development and deployment base.

- [x] Create a monorepo with `apps/web` (including role-protected `/admin` routes), `workers/ingestion`, `packages/contracts`, `db`, `tests`, and `docs`. Admin routes land inside `apps/web` in a later phase; the monorepo structure itself is in place.
- [x] Bootstrap Next.js, TypeScript, Tailwind CSS, linting, formatting, and test tooling.
- [x] Bootstrap the Python worker with dependency locking, linting, typing, and tests.
- [x] Provision local and managed PostgreSQL with PostGIS and `pg_trgm`. Local is done (`compose.yaml`, CI's ephemeral service); managed (Neon) is provisioned — a project with `postgis`/`pg_trgm` confirmed available, and an isolated `staging` branch used for the promotion below.
- [x] Add versioned migrations for sources, snapshots, import runs, and audit records, including retry counts, leases, heartbeats, and failure history on the import-run table.
- [x] Define shared API/data contracts and generate types where practical.
- [x] Configure development, staging, and production environments with isolated secrets and databases. Development is local Docker; staging is an isolated Neon branch with its own GitHub Environment secret; production is Vercel's own production environment with a separately branched Neon database. No production `DATABASE_URL` is wired into the web app yet — nothing in Phase 1 reads from it — that lands with the feature work that first needs it.
- [x] Add CI checks for lint, type-check, unit tests, migrations, and production builds.
- [x] Add structured logging, error reporting, health endpoints, and run IDs.
- [x] Configure object storage paths for immutable raw snapshots.

Exit gate: a migration can be promoted through staging, web and worker deployments are repeatable, and a sample importer persists a snapshot and auditable run record. All three criteria are now met: the sample-importer criterion was independently reviewed (`9ed23b4`); the "Promote staging" workflow ran successfully against a real Neon `staging` branch (after fixing a missing `PYTHONPATH` in the workflow, `162d0bb`); and the Vercel deployment went live at `aus-tech-map-web.vercel.app` (after fixing two real build bugs found only by actually deploying — a monorepo build-order gap where `@austechmap/contracts` never got compiled before `apps/web`, `9013291`, and a leftover `output: "standalone"` in `next.config.ts` that conflicts with Vercel's own build packaging, `659a8ec`) — confirmed live with both the homepage and `/api/health` responding correctly. Vercel is currently on the free Hobby tier, not Pro, as a deliberate temporary cost decision — see `ARCHITECTURE_DECISIONS.md` §3.4 for the required upgrade trigger.

Status: closed on 4 September 2026. All three of these fixes were found and fixed by Claude, the current sole implementer, with no independent reviewer catching them first — a live example of the reviewer-gap risk flagged in `AGENTS.md`'s "Current status" banner, not just a hypothetical one.

### Phase 2 — Geographic foundation

Goal: make Australian addresses and regions consistently queryable.

- [x] Create region, boundary-version, postcode-rule, and location schemas (migration `0006`: `geography_releases`, `regions`, `postcode_rules`, `resolved_locations`).
- [x] Build idempotent ABS geography importers for required ASGS levels (`geography/asgs.py`; not yet run against a real downloaded ABS boundary file — see below).
- [x] Implement the G-NAF bulk geocoding path and address normalisation (`geography/gnaf.py`, DuckDB-based, exact-match-only per `ARCHITECTURE_DECISIONS.md` §4.3; schema verified against the real August 2026 release archive, but not yet run against that full archive — see below).
- [x] Import Home Affairs regional categories and effective dates (`geography/home_affairs.py`, a dated, versioned fixture transcribed from the real live page). DAMA boundaries are explicitly deferred — each of the 13 DAMAs is its own separately-negotiated area, and guessing at that structure without verifying each one individually was rejected as unsafe; a documented follow-up, not an oversight.
- [x] Implement postcode/address-to-coordinate and point-in-polygon services (`geography/locations.py`).
- [x] Add spatial and lookup indexes (GiST on every geometry column, btree on codes/postcodes, all in migration `0006`).
- [x] Store source version, effective date, retrieved date, and content hash for every import (`geography_releases`, mirroring the Phase 1 `raw_snapshots`/`import_runs` pattern).
- [ ] Add fixtures for metro, regional, border, ambiguous, and invalid addresses. Synthetic fixtures proving the matching/resolution *mechanism* is correct exist in the test suite; representative *real* Australian addresses require real ASGS boundary files and the real G-NAF archive to actually be downloaded and imported first — not done, see below.
- [x] Build an admin import-status and geography-version view (`apps/web/src/app/admin/geography/page.tsx`). Deliberately unauthenticated for now — no auth system exists anywhere in this app yet (Phase 1 decided the model in `ARCHITECTURE_DECISIONS.md` §4.1 but did not build it); safe only because no real employer or user data exists yet. Must not go to production without an auth gate.

Exit gate: representative addresses resolve to coordinates, SA2/SA3/SA4/LGA/postcode, and the correct versioned regional classification with documented accuracy. **Not yet closed.** Every importer above is built and verified (CI for ASGS/locations against live PostGIS; fully local for G-NAF and Home Affairs, including G-NAF's schema against the real archive) but only against synthetic or hand-transcribed fixture data. Actually closing this gate needs, in order: downloading real ABS ASGS boundary files and running the importer against a real Neon database; downloading the real G-NAF archive (~1.85GB) and building its DuckDB index; running the Home Affairs importer for real; then resolving genuinely representative addresses and recording the accuracy. This is real-world data acquisition and compute, not something to run unattended inside an interactive coding session — treat it the same way Phase 1's Neon/Vercel provisioning was treated: a real operational step, not a formality.

### Phase 3 — Employer identity and seed graph

Goal: create trustworthy canonical employer records and the first reviewed dataset.

- [x] Add company, alias, domain, category, location, source, evidence, and review-queue migrations (migration `0007`).
- [x] Implement ABN, ACN, domain, URL, and company-name normalisation (`employers/normalisation.py`, checksum algorithms verified against official/hand-recomputed worked examples).
- [x] Build the ABR importer as an identity/enrichment source, not as the only discovery source (`employers/abr.py`, schema verified against the real, official bulk-extract XSD; DuckDB lookup index, not a wholesale import).
- [x] Implement deterministic matching and confidence thresholds (`employers/matching.py`: ABN/domain matches auto-accept when unique; name-only matches never auto-accept).
- [x] Route ambiguous or conflicting matches to review instead of auto-merging (`review_queue_items`, `employers/lifecycle.py::resolve_review_item`).
- [x] Build admin screens to create, edit, merge, redirect, verify, and disable employers (`/admin/companies`, `/admin/review` — unauthenticated for now, see `ARCHITECTURE_DECISIONS.md` §4.1's interim-state note).
- [x] Preserve aliases, evidence, and audit history through merges (companies are never deleted, only marked `merged`; every mutation writes an `audit_records` row).
- [x] Build a repeatable seed pipeline for a deliberately selected 100–200 employer alpha cohort (Sydney, Melbourne, Brisbane, and selected regional centres), expanding toward 1,000 in later phases (see Phase 8). The 135-candidate cohort was researched separately (outside this repo) and reviewed before use; it is recorded verbatim as `employers/fixtures/alpha_seed_cohort_20260905.csv` and run through `employers/seed.py::run_seed_import` (CLI: `seed-employers`), which calls the existing `match_or_create_company` engine per candidate, records an `employer_seed_research` evidence row for provenance, and skips the 2 candidates the research itself flagged `Low` confidence (known defunct/unverifiable entities) rather than importing them. Built and tested against a real PostGIS-backed database in CI, then actually run against the real Neon database on 5 September 2026: 133 companies created, 0 matched/review, 0 errors, 100% provenance (see exit gate).
- [x] Produce duplicate, provenance, location, and enrichment coverage reports. Queried directly against the real Neon database on 5 September 2026: **133/133 active companies (100%) have a usable location** (`company_locations` joined to an `accepted` `resolved_locations` row, 0 out-of-bounds points), **133/133 (100%) have provenance** (an `employer_seed_research` or `employer_seed_research`-linked evidence row citing the source), **0 unresolved duplicates** (0 pending `review_queue_items`, 0 companies sharing an active domain). Enrichment coverage is honestly low: 133/133 have a `careers_url`, but 0 have a `categories`/`company_category_links` assignment (the taxonomy exists per migration `0007`; nothing has populated it yet) and all 133 remain in `pending_review` status (`verified_at IS NULL`) — no one has clicked "verify" in `/admin/companies` yet. Category enrichment and manual verification are real gaps, but neither is one of this gate's four stated numeric criteria below.

Exit gate: 100–200 reviewed employers exist for the alpha cohort; fewer than 1% remain unresolved duplicates; more than 95% have usable locations; more than 98% have provenance. **Closed on 5 September 2026** against real, verified data: 133 companies (2 candidates excluded as known-defunct), 0% unresolved duplicates, 100% usable locations, 100% provenance — see the coverage-report line above for exact queries. Location resolution used a third-party geocoding API (OpenStreetMap's Nominatim by default, no signup required; Mapbox as an opt-in alternative) rather than the project's own G-NAF pipeline, since no real ASGS/G-NAF reference data is loaded yet — see `ARCHITECTURE_DECISIONS.md` §4.3's interim-state note and its upgrade trigger. Category enrichment and per-record manual verification remain open, tracked as ordinary follow-up work, not as blockers re-opening this gate.

### Phase 4 — Map, search, and employer profiles

Goal: deliver the first useful public discovery experience.

- [x] Implement the bounding-box map API with PostGIS (`GET /api/map/companies`, `ST_Intersects`/`ST_MakeEnvelope` against `resolved_locations.point`; `apps/web/src/lib/queries/mapCompanies.ts`). Verified against the real database: returns real points for all 133 companies within an Australia-wide bbox, `400` for a malformed bbox, `503` (not a crash) when `DATABASE_URL` is unset.
- [x] Return clusters at low zoom and minimal employer points at high zoom — client-side, not server-side: the API returns a bbox-filtered minimal-point payload and MapLibre's built-in `cluster: true` GeoJSON source (supercluster) does the aggregation (`apps/web/src/components/map/MapCanvas.tsx`). ARCHITECTURE_DECISIONS.md §3.5 already frames MapLibre around client-side clustering at this dataset's scale (133–1,000 points); reconsider server-side clustering only if the bbox-filtered payload approaches the 250KB SLO budget.
- [x] Add caching for common aggregate and region requests — `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` on the map route (shorter window on search), made effective by snapping the bbox to a fixed grid (`apps/web/src/app/api/map/companies/bbox.ts`) so repeated pans over the same area produce the same cache key. No region-specific caching yet since Phase 2's `regions` table is still empty — nothing to cache there.
- [x] Build the responsive map shell, result list, company drawer, and mobile interaction pattern (`apps/web/src/app/_components/HomeMapShell.tsx`): an always-in-DOM result list (map is progressive enhancement, not the only path to a company), a "Show map"/"Show list" toggle below the `lg:` breakpoint, and a drawer with careers CTA + profile link on marker/list click.
- [~] Core filters — category filter has real SQL/API plumbing (`?category=`, joined against `company_category_links`/`categories`) but no UI control yet, since 0 categories are populated; location search works via company/alias/free-text (below); **regional status is not implemented at all**, not just deferred — `resolved_locations.migration_category` is NULL for all 133 real rows since Phase 2's Home Affairs import hasn't run against real data (blocked on Phase 2, not Phase 5/6 as the original wording implied). Hiring/remote/sponsorship filters remain correctly deferred to Phase 5/6 (no backing data).
- [~] Search: company name and alias (Postgres `pg_trgm` similarity, `GET /api/search/companies`) is real and verified — `Atlassian` scores 1.0, the typo `atlassain` still resolves to Atlassian at score 0.43, a nonsense query returns an honest empty result. A free-text fallback against `resolved_locations.input_text` covers suburb/city text search as a stopgap. Structured postcode/region search is not implemented (Phase 2's `regions`/`postcode_rules` are empty); role search remains correctly deferred to Phase 5.
- [x] Create employer profile pages with locations, careers link, sources, and freshness (`apps/web/src/app/companies/[slug]/page.tsx`) — real content for identity, domain, careers CTA, and a non-clustered locations map; the `employer_seed_research` evidence row is surfaced as a labelled, source-attributed research summary (not presented as verified fact), with `evidence.observed_at` as "Last checked". Role count, work-style, sponsorship, tech-stack, and hiring-chart sections are honestly omitted (not blank placeholders) with one explanatory line, since no Phase 5/6 data exists yet. `merged` companies 308-redirect to their target; `disabled` companies render with a banner and `noindex`.
- [x] Add stable slugs, canonical metadata, sitemap support, empty states, and accessibility basics — `sitemap.ts`/`robots.ts` (133 real `/companies/{slug}` entries, verified against the real database), `generateMetadata` per profile page, branded `not-found.tsx`, empty states for both zero-result search and an empty map viewport.
- [x] Index only pages backed by substantial unique data; avoid thin combinatorial SEO pages — only `/companies/{slug}` is generated; no `/locations`, `/roles`, `/industries`, `/regional` pages yet, since none of that data is real.
- [~] Instrument search-to-profile-to-source-click analytics — a real, provider-agnostic call-site seam exists and is wired into the four actual UI actions (`apps/web/src/lib/analytics.ts`: `search_submitted`, `map_company_clicked`, `company_profile_viewed`, `careers_link_clicked`), but it only logs to the console today — no PostHog account exists yet (ARCHITECTURE_DECISIONS.md §3.9 names PostHog but nothing is wired up), and getting one is deliberately not forced through in this pass, the same way an unwanted Mapbox signup was avoided for geocoding (Phase 3). Swapping the stub's internals for `posthog-js` is a small change once an account exists.
- [ ] Load-test large and dense map viewports — genuinely not done, and not fakeable: §4.5's load-test gate needs "a frozen launch-like fixture of at least 1,000 employers," and only 133 real employers exist. Revisit once real employer count grows, or once Phase 2/5/6 data makes a realistic launch-like fixture possible — not by seeding synthetic filler companies.

Exit gate: the golden discovery journeys work on desktop and mobile; no endpoint sends the full dataset to the browser; search relevance and map latency meet agreed staging targets. **Partially met, verified against real data**: of the 25 golden queries, only GQ-01 (exact name), GQ-02 (typo), GQ-03 (alias — untestable today, 0 real aliases exist), and the map-only half of GQ-25 are checkable without Phase 5/6 role/skill/job data — GQ-01 and GQ-02 both verified correct against the real database. The other 21 golden queries, formal p95/p99 latency measurement, and the 1,000-employer load test all remain open, blocked on data or scale this phase doesn't have yet. No endpoint returns the full dataset (map and search are both bbox/hard-cap-bounded in SQL) — verified structurally, not yet load-tested.

### Phase 5 — Hiring intelligence

Goal: collect current jobs while preserving a trustworthy history.

- [x] Add jobs, job observations, skills, role families, and employer-signal schemas (migration `0009`: `jobs`, `job_observations`, `job_skill_links`, `role_families`, `skills`, `employer_role_signals`, `employer_skill_signals`, `company_ats_sources`).
- [x] Implement a shared fetch → snapshot → parse → normalise → match → persist pipeline (`hiring/pipeline.py::run_ats_crawl`, reusing `JobRepository`/`SnapshotStore` exactly as built in Phase 1).
- [x] Make every pipeline stage idempotent and safe to retry — verified against real data: re-running `crawl-jobs` reports the run as already-completed for the day rather than duplicating; `persist_job_posting`'s own insert-or-update-in-place logic is separately integration-tested.
- [x] Build adapters for **Lever and Ashby**, verified against real data — two of the 133 real seeded companies (Immutable/Lever, Dovetail/Ashby) were found to actually use these platforms by fetching their careers pages and checking for an embedded ATS reference (the recorded `careers_url` alone never reveals this). **Greenhouse, Workable, BambooHR, and SmartRecruiters remain open** — no company in a 10-company sample was found using Greenhouse, and building an adapter against a guessed/unverified API shape isn't this project's standard.
- [ ] Build a polite static careers-page parser (respecting robots.txt, adaptive rate limits, and identifying `User-Agent` headers) and use Playwright only for sources requiring dynamic client-side rendering — not built this pass; both real test cases are ATS-based (Tier 1), not static HTML (Tier 2/3).
- [x] Apply SSRF-safe fetch controls to every crawler request (`fetch_safety.py::safe_fetch`) — host allowlist with no default, DNS resolution + IP-range validation with connection pinning (closing the DNS-rebinding TOCTOU gap), re-validated on every redirect hop, response size cap. 18 tests cover the required vectors (loopback, RFC1918 private ranges, cloud-metadata link-local, IPv4-mapped-IPv6 bypass, DNS-resolves-to-private, redirect-to-private, too-many-redirects, disallowed scheme/host, oversized response, DNS failure) plus a real successful fetch against both live APIs.
- [ ] Deduplicate by external ID, canonical URL, content fingerprint, and company context — external-ID dedup (`UNIQUE(company_id, source_system, external_id)`) is real and tested; canonical-URL/content-fingerprint cross-source dedup isn't needed yet with only 2 non-overlapping sources.
- [x] Normalise title, role family, seniority, employment type, location, and work style (`hiring/normalisation.py`, deterministic keyword tables, word-boundary matched, checked in a fixed documented order; no match yields `None`/`unknown`, never a guess). **Salary parsing remains open** — neither verified Lever nor Ashby response included salary data.
- [x] Extract skills using deterministic rules first and store confidence and evidence (`extract_skills`, word-boundary match against the seeded skills taxonomy; 0.7 confidence for a title match, 0.5 for description-only).
- [x] Persist first-seen, last-seen, active, expired, and content-change observations without destructive overwrites (`hiring/persistence.py`) — verified against real data: 11 real jobs (7 Lever + 4 Ashby) persisted with `first_seen_at`/`last_seen_at` set, 11 `job_observations` rows (one per job, correct for a first-ever crawl); insert-preserves-`first_seen_at`-on-update, always-append-observation, expire-on-disappearance, and un-expire-on-reappearance are each integration-tested directly.
- [ ] Add parser fixtures, replay tooling, quarantine, adaptive schedules, and source-level kill switches — parser fixtures exist (real recorded Lever/Ashby responses); replay/quarantine/adaptive-schedule/kill-switch behavior is not built (`company_ats_sources.status` has the field, not the behavior) — no real second/third fetch cycle or real failure exists yet to validate any of this against.
- [ ] Derive employer role demand and hiring momentum only when sufficiency thresholds pass — schema ships (`employer_role_signals`/`employer_skill_signals`) with a documented sufficiency rule (sample_size ≥ 3 across ≥ 2 distinct observation dates ≥ 14 days apart); the population job is not built, since 2 sources with one observation each have no real momentum to compute yet.
- [ ] Onboard and monitor at least 300 employer sources — 2 real sources exist (`company_ats_sources`/the CLI scale to more, but discovery/onboarding at that volume is untouched); the manual fetch+grep technique that found these 2 has not been turned into a repeatable tool.
- [ ] Activate hiring state, role family, and remote/hybrid filters, and role-based search, on the public map and search interface — not wired against data this sparse yet (11 real jobs across 2 companies), matching Phase 4's own "don't build UI against data that isn't real" discipline.

Exit gate: monitored sources meet the refresh target; snapshots can be replayed; historical observations remain reproducible; parser failures are visible and recoverable. **Not closed** — real progress against 2 verified sources (11 real jobs persisted and classified, SSRF protection tested against 12 real-world attack vectors, idempotent persistence verified), but the refresh-target/300-source/replay-tooling/momentum-derivation items above remain open, honestly, not faked.

### Phase 6 — Sponsorship and regional intelligence

Goal: publish migration and regional information without unsupported claims.

#### Track 6A: Sponsorship Evidence
- [ ] Import Home Affairs labour-agreement sources (5,900+ agreements) with source versions and effective dates.
- [ ] Separate current employer evidence, historical evidence, role-specific wording, and regional context.
- [ ] Require evidence links, observation dates, confidence, and status on every displayed claim.
- [ ] Add stale, superseded, rejected, and review-required evidence states.
- [ ] Build evidence review and source-comparison screens.
- [ ] Add visible caveats that evidence does not guarantee sponsorship for an applicant or role.
- [ ] Activate sponsorship evidence filters on the public map and search interface.

#### Track 6B: Regional Intelligence & Scoring
- [ ] Build region pages and DAMA context on Phase 2's canonical Home Affairs import (no re-import here).
- [ ] Import JSA NERO and IVI datasets with period and geography metadata.
- [ ] Build region pages with employer, hiring, labour-market, and migration context.
- [ ] Implement the versioned Regional Tech Opportunity Score.
- [ ] Store score components, methodology version, input period, and sufficiency result.
- [ ] Suppress scores when coverage or history is insufficient.

Exit gate: every sponsorship claim is inspectable and sourced; region scores are reproducible; insufficient data produces an honest empty state rather than false precision.

#### Alpha/beta checkpoint (before Phase 7)

Ship the Phase 0–6A slice — 100–200 employers, 3 ATS integrations, map/search/profiles, sponsorship evidence — as a private alpha, then beta. Collect real user feedback on the core discovery loop before building Opportunity Match, alerts, or the coverage expansion to 1,000 employers. Data accuracy and employer coverage determine whether this product succeeds, not the feature count in V1 — do not start Phase 7 until this checkpoint shows the map and employer data are independently valuable.

### Phase 7 — Opportunity and retention engine

Goal: turn exploration into relevant, repeatable opportunity discovery.

- [ ] Implement canonical preference filters for role, skills, location, work style, hiring state, and evidence preferences.
- [ ] Build a weighted Opportunity Match with component-level reasons.
- [ ] Store query hash, score components, model version, and generation time.
- [ ] Validate ranking against golden queries and product-review judgements.
- [ ] Add authentication only where needed for saved state.
- [ ] Implement saved searches and employer/region watchlists.
- [ ] Derive immutable, versioned change events from observations.
- [ ] Implement stable event deduplication keys and replay-safe matching.
- [ ] Add in-app alerts and transactional email delivery.
- [ ] Enforce preferences, unsubscribe, delivery caps, suppression, and digest cadence before enqueueing.
- [ ] Add notification audit logs and duplicate-delivery tests.
- [ ] Build sourced, timestamped employer and regional insight cards.

Exit gate: every ranked result explains its score; golden tests pass; one user/event/channel/window cannot be delivered twice; unsubscribe and preference changes take effect before delivery.

### Phase 8 — Production hardening and launch

Goal: reach operational and data-quality readiness for public V1.

- [ ] Expand the alpha/beta cohort (100–200 employers) to at least 1,000 employers.
- [ ] Complete threat modelling and protect admin routes with MFA and least privilege.
- [ ] Add input validation, rate limits, crawler egress/SSRF controls, and secret rotation procedures.
- [ ] Verify database backups and complete a timed restore drill.
- [ ] Add Sentry, dashboards, uptime checks, pipeline alerts, and data-anomaly detection.
- [ ] Run unit, integration, parser-fixture, database, E2E, regression, accessibility, and load suites.
- [ ] Test event backlog recovery and notification provider failure handling.
- [ ] Audit source licences, terms, attribution, retention, and removal procedures.
- [ ] Complete desktop/mobile QA for critical discovery journeys.
- [ ] Publish methodology, evidence, freshness, privacy, and correction documentation.
- [ ] Produce a launch quality report against every gate below.
- [ ] Conduct a controlled beta, resolve severity-one/two defects, then approve public launch.

Exit gate: all launch gates pass and the operational owner can diagnose, disable, replay, restore, and correct the system without direct database surgery.

### Phase 9 — Commercial readiness

Begin only after qualified opportunity discovery, repeat usage, and data quality demonstrate demand.

- [ ] Add verified employer claims without overwriting independent observations.
- [ ] Add correction and contribution review workflows.
- [ ] Define analytics entitlements and institutional export controls.
- [ ] Add billing boundaries and audit logs.
- [ ] Keep paid placement visibly labelled and separate from organic scores.

## 7. Cross-cutting engineering requirements

### Data integrity

- Every imported or inferred fact must point to a source, observation, or reviewed submission.
- Raw snapshots are immutable and addressed by content hash.
- Importers, crawlers, score refreshes, and event derivation must be idempotent.
- History is superseded or expired, never silently overwritten.
- All government rules, datasets, scores, and event semantics are versioned.

### Security and privacy

- Anonymous browsing is the default; collect only the account data needed for saved state and alerts.
- Use MFA and role-based access for admin functions.
- Validate all public inputs and rate-limit abuse-prone endpoints.
- Never expose raw source HTML, secrets, internal notes, or unrestricted exports publicly.
- Record review, merge, claim, contribution, and source-disable actions in an audit log.

### Testing

- Unit-test normalisation, matching, parsing, scoring, sufficiency, and deduplication rules.
- Maintain frozen source fixtures for every importer and parser.
- Integration-test snapshot-to-public-query flows.
- E2E-test map discovery, filters, employer pages, saving, alerts, and unsubscribe.
- Load-test map clusters, search, and alert-event batches before launch.

### Observability

- Logs include `run_id`, `source_id`, `company_id`, parser version, duration, and record counts.
- Pipeline dashboards show fetched, parsed, created, updated, unchanged, failed, and quarantined counts.
- Alert on repeated source failure, job-count collapse, parser drift, evidence staleness, event backlog, duplicate delivery, and unexplained score drift.

## 8. Release strategy

| Environment | Purpose | Data policy |
| :--- | :--- | :--- |
| Local | Fast development and fixture replay | Synthetic and small approved samples |
| Staging | Full integration, review, performance, and beta validation | Production-like subset with isolated accounts and notifications |
| Production | Public service and scheduled pipelines | Approved sources only; audited access |

Use short-lived branches, mandatory CI, versioned migrations, staging promotion, and reversible application releases. Database migrations must be backward-compatible during deployment; destructive schema cleanup occurs only after the new application version is stable and backups are verified.

## 9. Launch gates

- [ ] At least 1,000 deliberately selected and enriched employers.
- [ ] More than 95% of launch employers have usable mapped locations.
- [ ] More than 98% of employer records have provenance.
- [ ] More than 95% of monitored careers sources are checked within SLA.
- [ ] More than 95% of active jobs refresh within 24 hours where the source permits daily checks.
- [ ] Unresolved duplicate-company rate is below 1%.
- [ ] All displayed sponsorship claims have an inspectable evidence link.
- [ ] All government datasets have source versions and effective dates.
- [ ] All published scores reproduce from stored inputs, components, and methodology versions.
- [ ] Scores and trends are suppressed when sufficiency requirements fail.
- [ ] Map and search meet agreed p95 latency targets on desktop and mobile networks.
- [ ] Golden search and Opportunity Match queries meet relevance expectations.
- [ ] Alert preferences, deduplication, delivery caps, and unsubscribe are verified.
- [ ] Admin merge, evidence review, source disable, crawler replay, and correction workflows pass.
- [ ] Security review, backup restore, source-policy review, and launch QA are complete.

## 10. Primary risks and controls

| Risk | Control |
| :--- | :--- |
| Government or careers source changes | Versioned parsers, frozen fixtures, raw snapshots, drift alerts, kill switches |
| Incorrect employer matching | Conservative thresholds, aliases, evidence, and human review |
| Misleading sponsorship claims | Evidence categories, freshness, visible caveats, and no inferred boolean claims |
| Weak regional data | Sufficiency gates and transparent score components |
| G-NAF storage and query overhead | Offline worker reference / batch pipeline; only resolved coordinates and ASGS keys in primary DB |
| Crawler blocking or prohibited collection | Source register, terms review, adaptive schedules, structured ATS first, custom User-Agent, robots.txt compliance |
| Duplicate or noisy alerts | Immutable events, stable dedupe keys, caps, preferences, and replay tests |
| Map performance degradation | Bounding-box queries, spatial indexes, clustering, caching, and load tests |
| Scope expansion | Phase gates, explicit V1 exclusions, and post-launch commercial phase |
| Thin/combinatorial SEO pages | Index only pages with substantial unique data; no low-value programmatic pages |
| Single-developer operational load | Managed services, admin tooling, automation, runbooks, and prioritized source tiers |

## 11. First implementation backlog

Complete these items first, in order:

1. Approve V1 taxonomies, evidence rules, score sufficiency rules, and golden queries.
2. Record architecture decisions and service choices.
3. Scaffold the web app, worker, contracts, database, tests, and documentation structure.
4. Provision local PostgreSQL with PostGIS and `pg_trgm`.
5. Create the source, snapshot, import-run, region, company, alias, and location migrations.
6. Implement raw snapshot storage and an idempotent importer framework.
7. Import one small ABS geography fixture end to end.
8. Prove point-in-polygon and postcode/region classification queries.
9. Import a small ABR/employer fixture and exercise deterministic matching.
10. Build the first admin review queue and audit action.

The first milestone demonstration should show one source snapshot flowing through an import run into a canonical employer and mapped location, with provenance visible in an admin view and a repeat run producing no duplicates.

## 12. Governance and reporting

At each phase gate, record:

- delivered scope and deferred items;
- automated test and quality results;
- source-policy or licensing changes;
- data coverage, freshness, and unresolved review counts;
- production or operational risks;
- revised effort forecast for the remaining phases; and
- the explicit decision to proceed, remediate, or reduce scope.

Track the product north-star metric after beta: a qualified opportunity discovery where a user searches or filters, opens a matching employer, engages with its evidence, and follows a source/careers link or saves the opportunity.
