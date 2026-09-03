# Australia Tech Map — Implementation Plan

> Execution plan derived from [PRODUCT_SPEC.md](./PRODUCT_SPEC.md). [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md) is authoritative for technology choices where it conflicts with either document.  
> Version 2.2 · 4 September 2026

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

- [x] Freeze V1 role-family, skill, employer-category, seniority, work-style, and evidence taxonomies. See PRODUCT_SPEC.md Appendix A and §8.1.
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

- [ ] Create a monorepo with `apps/web` (including role-protected `/admin` routes), `workers/ingestion`, `packages/contracts`, `db`, `tests`, and `docs`.
- [ ] Bootstrap Next.js, TypeScript, Tailwind CSS, linting, formatting, and test tooling.
- [ ] Bootstrap the Python worker with dependency locking, linting, typing, and tests.
- [ ] Provision local and managed PostgreSQL with PostGIS and `pg_trgm`.
- [ ] Add versioned migrations for sources, snapshots, import runs, and audit records, including retry counts, leases, heartbeats, and failure history on the import-run table.
- [ ] Define shared API/data contracts and generate types where practical.
- [ ] Configure development, staging, and production environments with isolated secrets and databases.
- [ ] Add CI checks for lint, type-check, unit tests, migrations, and production builds.
- [ ] Add structured logging, error reporting, health endpoints, and run IDs.
- [ ] Configure object storage paths for immutable raw snapshots.

Exit gate: a migration can be promoted through staging, web and worker deployments are repeatable, and a sample importer persists a snapshot and auditable run record.

### Phase 2 — Geographic foundation

Goal: make Australian addresses and regions consistently queryable.

- [ ] Create region, boundary-version, postcode-rule, and location schemas.
- [ ] Build idempotent ABS geography importers for required ASGS levels.
- [ ] Implement the G-NAF bulk geocoding path and address normalisation (operated as an offline worker reference dataset or batch geocoding pipeline to avoid loading all 15.8M addresses into the primary transactional database).
- [ ] Import Home Affairs regional categories, DAMA boundaries, and effective dates — the canonical import; Phase 6 builds product presentation and scoring on it without re-importing.
- [ ] Implement postcode/address-to-coordinate and point-in-polygon services.
- [ ] Add spatial and lookup indexes.
- [ ] Store source version, effective date, retrieved date, and content hash for every import.
- [ ] Add fixtures for metro, regional, border, ambiguous, and invalid addresses.
- [ ] Build an admin import-status and geography-version view.

Exit gate: representative addresses resolve to coordinates, SA2/SA3/SA4/LGA/postcode, and the correct versioned regional classification with documented accuracy.

### Phase 3 — Employer identity and seed graph

Goal: create trustworthy canonical employer records and the first reviewed dataset.

- [ ] Add company, alias, domain, category, location, source, evidence, and review-queue migrations.
- [ ] Implement ABN, ACN, domain, URL, and company-name normalisation.
- [ ] Build the ABR importer as an identity/enrichment source, not as the only discovery source.
- [ ] Implement deterministic matching and confidence thresholds.
- [ ] Route ambiguous or conflicting matches to review instead of auto-merging.
- [ ] Build admin screens to create, edit, merge, redirect, verify, and disable employers.
- [ ] Preserve aliases, evidence, and audit history through merges.
- [ ] Build a repeatable seed pipeline for a deliberately selected 100–200 employer alpha cohort (Sydney, Melbourne, Brisbane, and selected regional centres), expanding toward 1,000 in later phases (see Phase 8).
- [ ] Produce duplicate, provenance, location, and enrichment coverage reports.

Exit gate: 100–200 reviewed employers exist for the alpha cohort; fewer than 1% remain unresolved duplicates; more than 95% have usable locations; more than 98% have provenance.

### Phase 4 — Map, search, and employer profiles

Goal: deliver the first useful public discovery experience.

- [ ] Implement the bounding-box map API with PostGIS.
- [ ] Return clusters at low zoom and minimal employer points at high zoom.
- [ ] Add caching for common aggregate and region requests.
- [ ] Build the responsive map shell, result list, company drawer, and mobile interaction pattern.
- [ ] Add core filters for company category, location, and regional status (hiring state, remote type, and sponsorship evidence filters activate progressively as backend data pipelines land in Phases 5 and 6).
- [ ] Implement company, alias, niche, suburb, postcode, and region search (role search activates in Phase 5 once role-family and job data exist).
- [ ] Create employer profile pages with locations, careers link, sources, and freshness.
- [ ] Add stable slugs, canonical metadata, sitemap support, empty states, and accessibility basics.
- [ ] Index only pages backed by substantial unique data; avoid thin combinatorial SEO pages.
- [ ] Instrument search-to-profile-to-source-click analytics.
- [ ] Load-test large and dense map viewports.

Exit gate: the golden discovery journeys work on desktop and mobile; no endpoint sends the full dataset to the browser; search relevance and map latency meet agreed staging targets.

### Phase 5 — Hiring intelligence

Goal: collect current jobs while preserving a trustworthy history.

- [ ] Add jobs, job observations, skills, role families, and employer-signal schemas.
- [ ] Implement a shared fetch → snapshot → parse → normalise → match → persist pipeline.
- [ ] Make every pipeline stage idempotent and safe to retry.
- [ ] Build adapters for Greenhouse, Lever, and Ashby first to cover the alpha cohort; add Workable, BambooHR, and SmartRecruiters when expanding past alpha toward the 300-source target, before building bespoke parsers.
- [ ] Build a polite static careers-page parser (respecting robots.txt, adaptive rate limits, and identifying `User-Agent` headers) and use Playwright only for sources requiring dynamic client-side rendering.
- [ ] Apply SSRF-safe fetch controls to every crawler request: validate resolved destinations, allow only http/https, block loopback/private/link-local ranges, control redirect chains, and prefer an allowlist of registered source domains.
- [ ] Deduplicate by external ID, canonical URL, content fingerprint, and company context.
- [ ] Normalise title, role family, seniority, employment type, location, work style, and salary.
- [ ] Extract skills using deterministic rules first and store confidence and evidence.
- [ ] Persist first-seen, last-seen, active, expired, and content-change observations without destructive overwrites.
- [ ] Add parser fixtures, replay tooling, quarantine, adaptive schedules, and source-level kill switches.
- [ ] Derive employer role demand and hiring momentum only when sufficiency thresholds pass.
- [ ] Onboard and monitor at least 300 employer sources (leveraging ATS adapters for rapid scale).
- [ ] Activate hiring state, role family, and remote/hybrid filters, and role-based search, on the public map and search interface.

Exit gate: monitored sources meet the refresh target; snapshots can be replayed; historical observations remain reproducible; parser failures are visible and recoverable.

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
