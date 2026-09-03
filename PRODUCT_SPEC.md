# Australia Tech Map

> **Product Specification (v2.3)**
> *A production-grade specification for building the definitive Australian technology-employment intelligence platform.*

> [!IMPORTANT]
> **Product Thesis**: Build the definitive graph of technology employment in Australia. The map is the primary discovery interface; the durable product is a longitudinal Opportunity Graph that connects employers, locations, roles, skills, hiring history, regional labour signals and evidence-backed sponsorship data.

| **Document field** | **Value** |
| :--- | :--- |
| Status | Updated for 10/10 product architecture |
| Version | 2.3 |
| Date | 31 August 2026 |
| Primary audience | Founder, product lead, engineering agents, future contributors |
| Initial market | Australia |
| Primary user | Technology job seeker / career explorer |
| Secondary users | Employers, recruiters, universities, councils and workforce organisations |

> [!NOTE]
> **Status**: Confidential Working Specification — Updated for 10/10 product architecture (31 August 2026)

> [!NOTE]
> **Precedence**: Where this specification's technology recommendations conflict with [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md), the architecture decisions document is authoritative. Where this specification's delivery roadmap, phase sequencing, or employer-count milestones (§14) conflict with [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) — for example, §14 still shows the original 500-employer staging superseded by IMPLEMENTATION_PLAN.md's 100–200-employer alpha — IMPLEMENTATION_PLAN.md is authoritative. This document remains the source of truth for product scope, data model, and policy.

## Table of Contents

- [1. Executive Summary](#1-executive-summary)
- [2. Product Vision, Users and Outcomes](#2-product-vision-users-and-outcomes)
- [3. Scope, Non-Goals and Product Principles](#3-scope-non-goals-and-product-principles)
- [4. Target System Architecture](#4-target-system-architecture)
- [5. Australian Data Foundation and Source Governance](#5-australian-data-foundation-and-source-governance)
- [6. Core Data Model](#6-core-data-model)
- [7. Employer Discovery, Crawling and Enrichment](#7-employer-discovery-crawling-and-enrichment)
- [8. Sponsorship and Regional Migration Evidence](#8-sponsorship-and-regional-migration-evidence)
- [9. Search, Map and Product Experience](#9-search-map-and-product-experience)
- [10. API, Search and Geospatial Query Design](#10-api-search-and-geospatial-query-design)
- [11. Admin, Data Quality and Human Review](#11-admin-data-quality-and-human-review)
- [12. Security, Privacy and Compliance](#12-security-privacy-and-compliance)
- [13. Testing, Observability and Reliability](#13-testing-observability-and-reliability)
- [14. Delivery Roadmap](#14-delivery-roadmap)
- [15. Launch Criteria, KPIs and Operating Model](#15-launch-criteria-kpis-and-operating-model)
- [16. Key Risks and Mitigations](#16-key-risks-and-mitigations)
- [17. Post-V1 Expansion](#17-post-v1-expansion)
- [18. Opportunity Engine, Retention and Business Architecture](#18-opportunity-engine-retention-and-business-architecture)
- [Appendix A. Initial Taxonomies](#appendix-a-initial-taxonomies)
- [Appendix B. Repository Structure](#appendix-b-repository-structure)
- [Appendix C. Source Register](#appendix-c-source-register)
- [Appendix D. Scoring and Event Contracts](#appendix-d-scoring-and-event-contracts)

---

## 1. Executive Summary

Australia Tech Map will be a continuously updated, map-first opportunity intelligence platform showing where technology careers exist across Australia, which employers are hiring, what skills they seek, how hiring is changing, and what sourced evidence exists around remote work, regional opportunity and employer sponsorship.

The product is deliberately not a generic job board, startup directory or immigration advice site. Its core differentiator is the Opportunity Graph: company identity + geography + technology footprint + role demand + longitudinal hiring observations + regional labour data + sourced migration evidence + user-defined opportunity preferences. The map is the interface; the graph and time series are the moat.

| 1,000 | 100% | < 24h | Day 1 |
| :---: | :---: | :---: | :---: |
| **High-Quality Launch Employers** | **Meaningful Claims Sourced** | **Active-Job Freshness Target** | **Longitudinal Observations Retained** |

### 1.1 Product statement

> [!TIP]
> **North-star Proposition**: Discover and monitor the Australian employers most worth targeting for your role, skills, location preferences and career constraints - including regional and non-obvious technology employers that traditional job search often misses.

### 1.2 What makes the platform defensible

- Not the map. Maps, clustered pins and directories are easy to reproduce.
- The Opportunity Graph. A cleaned and deduplicated model connecting employers, offices, role families, skills, technology footprints, regions, evidence and user-relevant opportunity signals is the durable asset.
- The time series. Jobs and employer signals are observed over time instead of overwritten, enabling hiring momentum, seasonality, emerging-role detection and change alerts from the first day of collection.
- Evidence provenance. **Every meaningful claim can be traced to a source, timestamp, extraction method and confidence state.
- Australian-specific intelligence. ABS geography, G-NAF, Home Affairs regional definitions and Jobs and Skills Australia data make regional opportunity, employer discovery and labour-market benchmarking native to the product rather than a generic global overlay.

### 1.3 Recommended V1

- Australia-wide map with employer clustering and viewport queries.
- Opportunity search by company, role, skills, niche, location and work style, with explainable evidence-based matching.
- Employer profile with locations, technology footprint, current vacancies, hiring momentum, work style, sponsorship evidence and source freshness.
- Region pages with employer counts, hiring activity, selected labour-market indicators and a transparent Tech Opportunity Score where data sufficiency permits.
- Sponsorship evidence categories based on explicit current/historical evidence and relevant government records - never unsourced AI guesses.
- Admin review console for deduplication, location correction, evidence approval, scoring inspection, employer claims/contributions and crawler health.
- Saved searches, employer/region watchlists and low-noise change alerts as the core retention loop.
- Longitudinal event generation from the first crawl so hiring momentum and change detection do not require a future schema redesign.

## 2. Product Vision, Users and Outcomes

### 2.1 Vision

Make Australia's technology-employment landscape legible and actionable. A user should be able to describe the career they want, discover which employers are realistically worth targeting, understand why each match is relevant, see how employer hiring is changing, and monitor new opportunities across metro and regional Australia.

### 2.2 Primary user segments

| **Segment** | **Primary question** | **Most valuable surface** |
| :--- | :--- | :--- |
| Technology job seeker | Which employers are realistically worth me targeting? | Opportunity Match + map + employer profile |
| International candidate | Which employers have credible sponsorship evidence? | Evidence filters + source viewer |
| Regional mover | Where are strong technology opportunities outside the obvious capitals? | Regional Opportunity Score + map + employer density |
| Graduate / intern | Which employers run early-career programs? | Graduate and internship filters |
| Employer | How do we become discoverable to qualified technology talent? | Claimed profile + employer analytics (commercial phase) |
| Recruiter / institution | Where is technology hiring changing, and which employers/regions are gaining momentum? | Longitudinal intelligence + dashboards/API (commercial phase) |

### 2.3 Core user journeys

```text
A. OPPORTUNITY DISCOVERY
User selects "Data Engineer" + SQL + Python + Sydney/Newcastle + hybrid
  -> Opportunity Engine ranks relevant employers
  -> each match explains role history, skills evidence, location and current hiring
  -> user opens employer and source careers page

B. SPONSORSHIP DISCOVERY
Select Software Engineering + Sponsorship Evidence + Regional
  -> map shows evidence-backed employers
  -> company page explains evidence type, date, occupation context and source
  -> user opens original evidence

C. REGION DISCOVERY
Open Newcastle / Geelong / Bunbury / Hobart
  -> see Tech Opportunity Score + employers + hiring momentum
  -> see top niches, selected labour indicators and non-obvious tech employers
  -> explore companies and roles

D. RETENTION LOOP
Save "Cloud Engineer + Regional + Sponsorship Evidence"
  -> event engine monitors new matching employers/jobs/evidence
  -> low-noise alert explains exactly what changed
  -> user returns directly to the opportunity
```

## 3. Scope, Non-Goals and Product Principles

### 3.1 V1 functional scope

| **Capability** | **V1 decision** | **Notes** |
| :--- | :--- | :--- |
| Map exploration | IN | National view, clustering, pan/zoom, responsive drawer |
| Employer search | IN | Name, role family, niche, state/region, work style |
| Employer profiles | IN | Locations, categories, roles, evidence, freshness |
| Current jobs | IN | Technology roles from permitted/first-party sources |
| Job history | IN - FIRST CLASS | Retain every meaningful job/employer observation; trend and event generation depend on it |
| Sponsorship evidence | IN | Evidence categories, source links, timestamps |
| Regional migration layer | IN | Home Affairs designated regional areas; DAMA as separate evidence layer |
| Region intelligence | IN | Employer + hiring stats, JSA signals with caveats |
| Accounts | IN - LIGHTWEIGHT | Anonymous browsing remains default; accounts enable saved searches, watchlists and alerts |
| Employer-paid products | DESIGN NOW / SELL LATER | Data model supports claimed profiles and analytics; do not optimise launch UX around payment |
| Employee reviews / salaries | OUT | Avoid Glassdoor clone |
| Direct applications | OUT | Link to source/employer rather than apply in-platform |
| AI career coach | OUT | Not part of the core product |
| Native mobile apps | OUT | Responsive web first |
| Opportunity Match | IN | Rules/evidence-based employer ranking with transparent reasons; no opaque AI score |
| Hiring Momentum | IN - BETA | Derived from observation history only after minimum data sufficiency thresholds |
| Regional Tech Opportunity Score | IN - BETA | Published methodology; suppress when data is insufficient |
| Saved searches / alerts | IN | New-job, employer-change, sponsorship-evidence and regional alerts with dedupe/caps |
| Employer claim / corrections | LIMITED | Verify employer-supplied facts while preserving independent observations separately |
| Shareable insight cards | IN | Generate sourced, timestamped regional/employer insights for organic distribution |

### 3.2 Product principles

1. Facts before features: source quality and freshness outrank visual polish.

2. Evidence, not inference, for migration and sponsorship claims.

3. Anonymous browsing by default; accounts are optional utility, not a gate.

4. First-party and official sources over brittle third-party scraping.

5. Keep historical observations; do not overwrite away the evidence trail.

6. Prefer fewer highly enriched employers over a large low-quality directory.

7. Regional Australia is a first-class product dimension, not an afterthought.

8. AI may classify or summarise evidence; it may not manufacture facts.

9. Explainability over black-box ranking: every Opportunity Match and score must expose its contributing signals.

10. Time is a product primitive: never destroy historical observations that may become trend or alert inputs.

11. Employer-provided facts and platform-observed facts remain visibly separate.

12. Scores are withheld when data sufficiency is weak; false precision is worse than an empty state.

## 4. Target System Architecture

### 4.1 Architectural approach

**Use a modular monolith for the product surface, with independent ingestion workers. This keeps deployment and development manageable for a solo/small team while preserving clean boundaries around data collection, enrichment and product APIs.**

```text
Next.js Web Application
        Map | Search | Match | Employer | Region | Watchlists
                                  |
                     Public / Authenticated API
                                  |
                       PostgreSQL + PostGIS
 companies | locations | jobs | evidence | regions | observations
 skills | employer-role signals | scores | watches | alert events
                                  |
        +-------------------------+-------------------------+
        |                         |                         |
 Government importers      Employer crawlers        Enrichment pipeline
 ABR / ABS / JSA           ATS / careers            taxonomy / matching
 Home Affairs              pages                    confidence / QA
        |                         |                         |
        +-------------------------+-------------------------+
                                  |
                       Observation / Event Engine
             hiring momentum | score refresh | alert candidates
                                  |
                        Notification Dispatcher
                                  |
                     Raw source snapshots / R2
```

### 4.2 Recommended stack

| **Layer** | **Recommendation** | **Rationale** |
| :--- | :--- | :--- |
| Web | Next.js + TypeScript + React | SSR/SSG for SEO plus strong interactive-map support |
| Styling | Tailwind CSS | Fast consistent product implementation |
| Database | PostgreSQL + PostGIS | Relational truth + geographic queries in one system |
| Managed DB | Supabase Postgres or equivalent | Fast operations while retaining standard Postgres |
| Map | Mapbox GL JS initially | Mature clustering and map UX; keep adapter replaceable |
| Search | Postgres FTS + pg_trgm initially | Avoid premature Elasticsearch/OpenSearch complexity |
| Pipeline | Python | Excellent ETL, spatial, parsing and data science ecosystem |
| Scheduled jobs | Cloud Run Jobs + Cloud Scheduler (or equivalent) | Simple isolated batch execution |
| Raw storage | Cloudflare R2 / S3-compatible object storage | Preserve raw source snapshots for reprocessing |
| Browser crawler | Playwright only when required | Dynamic careers sites without browser-rendering every source |
| Errors | Sentry | Application and pipeline exception visibility |
| Product analytics | PostHog | Funnels, discovery behaviour, experiments |
| Event engine | Database-backed scheduled event derivation initially | Generate deterministic hiring/change events without introducing Kafka |
| Notifications | Transactional email provider + in-app notification log | Saved-search/watch alerts with dedupe, preferences and delivery caps |
| Scoring | Versioned SQL/Python scoring functions | Transparent, reproducible Opportunity Match and regional scores |

### 4.3 Scaling boundaries

- Keep one production database until measured load requires separation.
- Do not introduce Kafka, microservices or Elasticsearch in V1.
- Map endpoints must be bounding-box aware; never ship every employer to the browser.
- Raw source storage and observations allow parsers to be replayed without recrawling.
- Background workers must be idempotent and safe to retry.

## 5. Australian Data Foundation and Source Governance

### 5.1 Source hierarchy

| **Priority** | **Source class** | **Examples** | **Use** |
| :--- | :--- | :--- | :--- |
| 1 | Official government/open data | ABS, Home Affairs, ABR, JSA, G-NAF | Geography, identity, labour and migration context |
| 2 | Employer first-party | Corporate website, careers pages, ATS feeds | Jobs, offices, explicit sponsorship wording |
| 3 | Permitted structured feeds | ATS APIs / public feeds | Job ingestion at scale |
| 4 | Human-reviewed submissions | Employer corrections, verified profile claims | Corrections and enrichment |
| 5 | Derived classification | Rules / LLM / heuristics | Niche, role family, seniority - always labelled as derived |

### 5.2 Australian Business Register (ABR)

**Use the ABN Bulk Extract as an entity-identity backbone rather than as the sole employer-discovery source. The extract includes ABN, status, entity type, legal and business names, state/postcode of the main business location, ACN/ARBN and GST registration fields. [S1]**

- Create legal-name and business-name aliases during import.
- Preserve ABN status history and source retrieval date.
- Do not infer that an ABN is a technology employer based only on entity records.
- Use ABN matching after domain/company discovery to improve deduplication and identity confidence.

### 5.3 Geographic foundation

**Import Australian Statistical Geography Standard (ASGS) Edition 3 boundaries into PostGIS. The ABS publishes SA1-SA4, Greater Capital City Statistical Areas, states/territories and non-ABS structures including Local Government Areas, Postal Areas and Suburbs and Localities. [S2]**

**Use G-NAF for bulk Australian address geocoding. The February 2026 release describes more than 15.8 million addresses and includes geocodes; G-NAF is updated quarterly. [S3]**

```text
Employer address
  -> normalise
  -> G-NAF match
  -> latitude / longitude
  -> PostGIS point
  -> spatial join to SA2 / SA3 / SA4 / LGA / POA
  -> Home Affairs regional classification
```

### 5.4 Labour-market datasets

**Jobs and Skills Australia (JSA) provides two useful complementary datasets. NERO estimates employment by ANZSCO 4-digit occupation and SA4 region; JSA cautions that the model is experimental, can be volatile for smaller series, and should be interpreted primarily by direction and scale of change rather than exact values. [S4][S5]**

**The Internet Vacancy Index (IVI) is a monthly series of online job advertisements with occupation and regional breakdowns including SA4. The July 2026 release is available at the time of this specification. IVI is an indicator of online vacancy activity, not a complete census of all vacancies. [S6][S7]**

### 5.5 Provenance policy

> [!CAUTION]
> **Hard rule**: No user-visible claim about hiring, sponsorship, location or program availability should exist without a source record or an explicitly labelled derived classification.

| **Field** | **Required provenance** |
| :--- | :--- |
| Employer legal identity | ABR or employer first-party source |
| Office location | Employer source and/or geocoded official address source |
| Hiring now | Current careers/ATS observation |
| Job active | Last-seen observation + source |
| Sponsorship evidence | Exact current/historical source and evidence category |
| Regional classification | Home Affairs definition + effective dates |
| Niche / role family | Method + confidence + source text used for derivation |
| Labour statistics | Dataset version + geography + month |

## 6. Core Data Model

### 6.1 Design rules

- Companies and company locations are separate entities; a company can operate in many places.
- Jobs are persistent records with repeated observations rather than disposable listings.
- Evidence is modelled independently from entities to preserve provenance and avoid boolean oversimplification.
- Taxonomies use many-to-many links with confidence and method metadata.
- Government geography and migration rules are versioned with effective dates.
- Opportunity signals are stored as components and versions, not a single unexplained score.
- User watches reference canonical filters/entities so alerts can be deterministically regenerated and deduplicated.
- Employer claims and community contributions never overwrite platform observations without an auditable review action.

### 6.2 Primary tables

| **Table** | **Purpose** | **Key fields** |
| :--- | :--- | :--- |
| companies | Canonical employer identity | id, slug, legal_name, display_name, abn, acn, domain, careers_url, status, verified_at |
| company_aliases | Name/domain aliases for matching | company_id, alias, alias_type, source_id |
| company_locations | Physical/operational locations | company_id, address, geometry, SA2-SA4, LGA, postcode, location_type |
| categories | Company niche taxonomy | id, key, label, parent_id |
| company_category_links | Many-to-many category evidence | company_id, category_id, confidence, method, source_id |
| role_families | Technology role taxonomy | key, label, parent_id |
| jobs | Canonical job record | company_id, title, role_family, seniority, remote_type, posted_at, first_seen, last_seen |
| job_observations | Time series of listing state | job_id, observed_at, active, content_hash, snapshot_id |
| sources | Source provenance | url, publisher, retrieved_at, content_hash, parser_version, snapshot_path |
| evidence | Claims and supporting source | entity_type, entity_id, claim_type, claim_value, source_id, confidence, observed_at |
| regions | Imported geographies | region_type, code, name, geometry, source_version |
| migration_region_rules | Home Affairs regional status | postcode/rule, category, valid_from, valid_to, source_id |
| labour_stats | JSA/ABS region metrics | dataset, period, geography, occupation, metric, value, source_id |
| skills | Normalised technology/skill taxonomy | id, key, label, aliases, category |
| job_skill_links | Observed skills required by jobs | job_id, skill_id, evidence_source_id, confidence |
| employer_role_signals | Longitudinal employer demand by role | company_id, role_family, period, active_jobs, new_jobs, momentum, sample_size |
| employer_skill_signals | Technology footprint inferred from job evidence | company_id, skill_id, period, evidence_count, confidence |
| region_opportunity_scores | Versioned regional opportunity score | region_id, role_family, period, score, components_json, methodology_version, sufficiency |
| opportunity_match_runs | Explainable user/employer ranking results | query_hash, company_id, score, components_json, model_version, generated_at |
| saved_searches | User-defined opportunity filters | user_id, canonical_filter_json, alert_enabled, cadence |
| watchlists | Employer/region watches | user_id, entity_type, entity_id, alert_preferences |
| change_events | Derived alertable facts | event_type, entity_id, occurred_at, evidence_id, dedupe_key, payload_json |
| notification_deliveries | Alert audit and dedupe | event_id, user_id, channel, status, delivered_at |
| employer_claims | Employer-submitted profile facts | company_id, claimant_user_id, claim_type, value, status, reviewed_at |
| contributions | User corrections/evidence submissions | entity_type, entity_id, submitted_value, source_url, status, reviewed_at |

### 6.3 Company model

```text
companies
- id UUID PK
- slug TEXT UNIQUE
- legal_name TEXT
- display_name TEXT
- abn TEXT NULL
- acn TEXT NULL
- primary_domain TEXT
- website_url TEXT
- careers_url TEXT
- company_type ENUM
- employee_range ENUM NULL
- status ENUM
- first_seen_at TIMESTAMPTZ
- last_verified_at TIMESTAMPTZ
- created_at / updated_at
```

### 6.4 Location model

```text
company_locations
- id UUID PK
- company_id UUID FK
- location_type ENUM(headquarters, office, remote_hub, unknown)
- address_line / suburb / state / postcode / country
- latitude / longitude
- geometry GEOGRAPHY(Point, 4326)
- sa2_code / sa3_code / sa4_code / lga_code
- regional_category
- source_id UUID FK
- verified_at TIMESTAMPTZ
```

### 6.5 Jobs and observations

```text
jobs
- id UUID PK
- company_id UUID FK
- source_system + external_id
- title / normalized_title
- role_family / seniority
- employment_type / remote_type
- location_text / company_location_id
- salary_min / salary_max / salary_period
- graduate_role / internship_role
- sponsorship_explicit
- source_url
- posted_at / first_seen_at / last_seen_at / expired_at
- content_hash

job_observations
- job_id UUID FK
- observed_at TIMESTAMPTZ
- active BOOLEAN
- content_hash
- source_id UUID FK
```

### 6.6 Evidence model

```text
evidence
- id UUID PK
- entity_type ENUM(company, job, location, region)
- entity_id UUID
- claim_type TEXT
- claim_value JSONB
- source_id UUID FK
- observed_at TIMESTAMPTZ
- valid_from / valid_until
- confidence NUMERIC
- method ENUM(source_explicit, government_match, rule, llm, human)
- status ENUM(active, stale, superseded, rejected)
```

### 6.7 Opportunity Graph and technology footprint

The Opportunity Graph is a derived, evidence-backed layer over canonical employer/job/location data. It must be reproducible from source observations and should never require the product to trust an opaque model output.

| **Signal** | **Derivation contract** |
| :--- | :--- |
| Employer role demand | Counts of active/new/expired jobs by role family over versioned time windows |
| Technology footprint | Skills/technologies observed in first-party job text or verified employer submissions; confidence + evidence count required |
| Hiring momentum | Change in normalised hiring activity vs prior windows; minimum observations and baseline required |
| Emerging employer | Employer crosses configured technology-role evidence threshold within a rolling window |
| Opportunity Match | Weighted fit over role, skills, location/work style, hiring state and optional evidence preferences; component reasons returned |

### 6.8 Alert and event model

Events are immutable, deduplicated facts derived from observations. Alerts are user-specific deliveries created from those events. This separation prevents duplicate notifications and lets scoring or delivery logic evolve without rewriting history.

| **Event type** | **Example trigger** |
| :--- | :--- |
| job.first_seen | New canonical job becomes active |
| employer.hiring_started | Employer moves from zero to qualifying active technology jobs |
| employer.hiring_momentum_changed | Versioned momentum band changes after sufficiency threshold |
| sponsorship.evidence_added | New approved sponsorship evidence becomes active |
| region.opportunity_score_changed | Published regional score crosses configured material-change threshold |
| employer.tech_footprint_changed | New skill/role family becomes sufficiently evidenced |

## 7. Employer Discovery, Crawling and Enrichment

### 7.1 Discovery strategy

**Do not begin by attempting to classify every ABN as a technology company. Build a high-quality seed set from multiple legitimate sources, then use ABR for identity resolution and deduplication.**

> Known technology employers + job/careers discovery + employer submissions
                           |
                      canonical domain
                           |
                legal identity / ABN match
                           |
                    dedupe + aliases
                           |
                 location + taxonomy
                           |
                       human review

### 7.2 Careers ingestion tiers

| **Tier** | **Source** | **Approach** |
| :--- | :--- | :--- |
| 1 | Structured ATS/public feed | Dedicated adapter; prefer stable JSON/API/feed where permitted |
| 2 | Static employer careers HTML | HTTP fetch + structured extraction + job-link discovery |
| 3 | Dynamic employer careers page | Playwright browser worker only when needed |
| 4 | Manual / employer submission | Review queue with source verification |

### 7.3 Pipeline stages

1. Discover source and assign source policy.

2. Fetch and persist the raw response/snapshot before parsing.

3. Parse jobs/locations/company signals into a staging model.

4. Normalise URLs, titles, locations, employment types and dates.

5. Match to canonical company and locations.

6. Deduplicate records using external IDs, canonical URL and content fingerprints.

7. Classify role family, seniority, niche and work style using deterministic rules first; AI only where useful.

8. Generate evidence records for sourced claims.

9. Write canonical tables + immutable observations transactionally.

10. Recompute affected employer/region signals, scoring components and material change events.

11. Evaluate saved searches/watchlists against deduplicated change events.

12. Emit notification candidates subject to user preferences, freshness, caps and suppression rules.

13. Emit pipeline metrics and anomalies for operational review.

### 7.4 Raw snapshot policy

```text
raw/
  abr/2026-08/...
  home-affairs/labour-agreements/2026-08-31/...
  jsa/nero/2026-07/...
  jsa/ivi/2026-07/...
  employer/{domain}/careers/2026-08-31T...html
  ats/{provider}/{company}/2026-08-31T...json
```

**Snapshots enable parser replay, auditability and historical analysis. Respect source licences, terms and retention constraints; do not indiscriminately archive data that is not permitted to be retained.**

### 7.5 AI enrichment guardrails

| **Allowed** | **Not allowed** |
| :--- | :--- |
| Classify a company description into one or more niche labels. | Invent whether a company sponsors visas. |
| Map ambiguous job titles to a role family. | Declare a job active without a current source observation. |
| Extract work-style wording from a job description. | Guess an office location from brand recognition. |
| Summarise evidence text for display while linking the source. | Turn uncertain model output into an authoritative fact. |

## 8. Sponsorship and Regional Migration Evidence

### 8.1 User-safety principle

> [!WARNING]
> **Language rule**: The platform reports sponsorship evidence, not a guarantee that an employer will sponsor a particular person, role or visa. Migration rules and employer policies change, and eligibility is occupation- and case-specific.

### 8.2 Evidence categories

| **Category** | **Display state** | **Minimum evidence** |
| :--- | :--- | :--- |
| Current explicit evidence | Strong / current | A live employer/ATS job or first-party page explicitly states sponsorship, visa support or an applicable sponsored visa pathway. |
| Current labour-agreement evidence | Government record | Employer appears on the current Home Affairs labour-agreement list; do not imply the agreement covers software/IT unless occupation scope is separately evidenced. |
| Historical explicit evidence | Historical | Past first-party job or employer evidence explicitly mentioned sponsorship. |
| No evidence found | Neutral | No reliable current or historical evidence located. This is not proof the employer does not sponsor. |
| Unknown | Neutral | Insufficient data / source unavailable / not yet checked. |

### 8.3 Home Affairs labour agreements

**Home Affairs states that labour agreements allow approved businesses to sponsor skilled overseas workers in specified circumstances. The current list contains 5,907 agreements, is current as at 30 June 2026, and the page was last updated 4 August 2026. [S8][S9]**

- Match employer names to canonical company identities with conservative confidence thresholds.
- Preserve labour-agreement type, start date, end date and source version.
- A labour agreement is evidence of an approved agreement - not evidence that every technology role is sponsor-eligible.
- When match confidence is ambiguous, route to human review before display.

### 8.4 Regional and DAMA data

**Home Affairs defines designated regional areas through Category 2 and Category 3 regions/postcodes. Category 2 includes cities and major regional centres such as Perth, Adelaide, Gold Coast, Sunshine Coast, Canberra, Newcastle/Lake Macquarie, Wollongong/Illawarra, Geelong and Hobart. [S10]**

**There are currently 13 DAMAs. DAMA access depends on an employer operating in the designated area and an occupation covered by the relevant head agreement; individuals cannot access a DAMA directly without employer sponsorship. [S11][S12]**

### 8.5 Recommended sponsorship UI

```text
SPONSORSHIP EVIDENCE

Current explicit evidence        [source] [observed date]
Current labour agreement         [type]   [start/end]
Historical explicit evidence     [source] [last observed]

Important: evidence does not guarantee sponsorship for a specific role or applicant.
Always confirm with the employer and official Home Affairs guidance.
```

## 9. Search, Map and Product Experience

### 9.1 Homepage

**The map should be the product hero. Avoid a generic SaaS landing page followed by the real tool below the fold.**

```text
AU TECH MAP

Where can your tech career take you?
[ Search companies, roles or technologies ]

[ Hiring now ] [ Sponsorship evidence ] [ Regional ] [ Graduate ]

                 AUSTRALIA MAP
          clustered employer/hiring counts

5,821 employers | 1,384 hiring | 327 regional
```

### 9.2 V1 filters

| **Group** | **Filters** |
| :--- | :--- |
| Employer | Niche / industry, company size |
| Career | Role family, hiring now, graduate, internship |
| Location | State, region, regional Australia, remote/hybrid/onsite |
| Migration evidence | Current explicit sponsorship, historical evidence, labour agreement, DAMA context |

### 9.3 Employer profile

- Company identity, domain, niche labels and short factual summary.
- Office/operating locations shown on map.
- Current technology-role count and role-family breakdown.
- Work-style signals from active jobs.
- Sponsorship evidence panel with source and freshness.
- Technology stack only where evidence is available or clearly labelled as inferred.
- Historical hiring chart after enough observations exist.
- Primary CTA goes to the original employer careers/job source.
- Very visible "last checked" timestamp.

### 9.4 Region profile

**Region pages should answer whether a technology career ecosystem exists in a place, not merely list local companies.**

| **Section** | **Example content** |
| :--- | :--- |
| Overview | Employer count, actively hiring count, technology-vacancy count |
| Map | Employers + clustering + selected filters |
| Top niches | Defence, SaaS, health, mining tech, consulting, etc. |
| Current opportunities | Active technology jobs in the region |
| Labour signals | Selected NERO/IVI indicators with methodology caveats |
| Migration context | Designated regional status and relevant DAMA information |
| Employers | Ranked/filterable employer list with freshness |
| Tech Opportunity Score | Role-aware, versioned score + component breakdown + data-sufficiency badge |
| Hiring momentum | Current vs historical employer/job activity with coverage caveats |
| Shareable insight | One evidence-backed regional headline/card when material |

### 9.5 SEO surface

- /companies/{slug}
- /locations/{state-or-region}
- /roles/{role}
- /industries/{industry}
- /regional/{region}
- Only generate indexable pages when the page has substantial unique data; avoid thin combinatorial SEO pages.

### 9.6 Opportunity Match experience

Users may provide a role, skills, experience band, locations, work style and optional sponsorship/regional preferences. The system ranks employers, not jobs only. Every result must show why it ranked: current relevant roles, historical role frequency, observed skills, location fit, work-style fit and evidence preferences.

| **Component** | **Initial behaviour** |
| :--- | :--- |
| Role fit | Highest weight; exact/adjacent role families from current and historical observations |
| Skill fit | Observed required skills with evidence count; avoid penalising missing data as a hard negative |
| Hiring state | Current relevant hiring outranks historical-only evidence |
| Location/work style | Hard filter or weighted preference depending on user input |
| Sponsorship/regional preference | Evidence-weighted preference only; never imply visa eligibility |
| Explainability | Return top positive signals, missing-data notes and methodology version with every result |

### 9.7 Hiring Momentum and employer technology footprint

Employer profiles should expose a time-aware technology footprint once enough observations exist: role-family mix, repeatedly observed skills, current vacancies, new-vs-expired job activity and a simple momentum band. Suppress trend claims when observation coverage is too short or interrupted.

### 9.8 Saved searches, watchlists and alerts

The retention loop is discover -> save -> monitor -> alert -> return. Users can watch a canonical opportunity query, employer or region. Alerts should report material changes only and always link to the underlying source or employer/region page.

### 9.9 Shareable intelligence

Generate source-backed, timestamped insight cards from real data: fastest-growing hiring regions, newly emerging technology employers, role hotspots and meaningful sponsorship-evidence changes. Share cards must include period, methodology label and source attribution to avoid turning estimates into clickbait.

## 10. API, Search and Geospatial Query Design

### 10.1 Map endpoint

```text
GET /api/map/companies
?bbox=west,south,east,north
&zoom=...
&category=...
&role=...
&hiring=true
&sponsorship=current
&regional=true
&remote=hybrid
```

- Use PostGIS ST_Intersects / bounding box filters against indexed geography.
- At low zoom, return clusters/aggregates rather than individual employers.
- At higher zoom, return minimal point payloads; fetch full company detail separately.
- Cache common low-zoom aggregate responses and region summaries.

### 10.2 Search strategy

**Start with PostgreSQL full-text search and pg_trgm for fuzzy company/role/location matching. Add a dedicated search engine only when measured relevance or latency requires it.**

| **Query type** | **V1 implementation** |
| :--- | :--- |
| Company name | Trigram similarity + aliases + canonical domain |
| Role | Normalised role-family taxonomy + title text |
| Niche | Category link table |
| Location | Region/postcode/suburb lookups + geospatial filter |
| Free text | Postgres FTS over company description and active job fields |

### 10.3 API principles

- Cursor pagination for large result sets.
- Explicit response versioning for public API contracts.
- No raw source HTML in public responses.
- Rate-limit anonymous endpoints proportionately without harming normal map browsing.
- Use stable slugs/IDs; never use company display name as a primary key.
- Expose freshness and source summaries in response contracts where useful.

### 10.4 Opportunity and alert APIs

| **Endpoint** | **Purpose** |
| :--- | :--- |
| POST /api/opportunities/search | Canonicalise user preferences and return ranked employers + explainable component scores |
| GET /api/companies/{slug}/signals | Current/historical role, skill and hiring-momentum signals with sufficiency metadata |
| GET /api/regions/{slug}/opportunity | Versioned regional opportunity score + components + methodology |
| POST /api/saved-searches | Persist canonical filters and optional alert settings |
| POST /api/watchlists | Watch employer or region changes |
| GET /api/alerts | List in-app alert events with delivery/read state |

### 10.5 Score versioning and cache policy

Scores are derived products, not canonical truth. Persist methodology_version, input period, component values and generated_at. Recompute only affected entities after new observations, cache public region/company signals, and retain prior published score versions for audit and historical charts.

## 11. Admin, Data Quality and Human Review

### 11.1 Mandatory admin surfaces

```text
/admin/companies
/admin/company-matches
/admin/locations
/admin/jobs
/admin/evidence
/admin/review
/admin/sources
/admin/crawlers
/admin/imports
/admin/data-health
/admin/scoring
/admin/events
/admin/claims
/admin/contributions
/admin/notifications
```

### 11.2 Review actions

- Merge duplicate companies and preserve aliases/redirects.
- Approve or reject ambiguous ABN and labour-agreement matches.
- Correct office locations and geocoding matches.
- Approve/reclassify company niches and role families.
- Inspect raw source snapshot alongside parsed fields.
- Rerun failed parser/crawler by source or company.
- Mark evidence stale/superseded without deleting history.
- Inspect Opportunity Match and regional-score component breakdowns for a known test query/entity.
- Approve/reject employer claims and community contributions without erasing independent source observations.
- Replay event derivation and notification matching by event_id/query without sending duplicate notifications.
- Disable a source that becomes prohibited or unreliable.

### 11.3 Data quality dashboard

| **Metric** | **Target before public V1** |
| :--- | :--- |
| Employer records with source provenance | >98% |
| Employers with usable mapped location | >95% |
| Actively monitored careers sources checked within SLA | >95% |
| Active jobs refreshed within 24 hours | >95% where source supports daily checks |
| Unresolved duplicate company rate | <1% |
| Displayed sponsorship claims with evidence link | 100% |
| Government datasets with source version/effective date | 100% |
| Published score reproducibility | 100% of published scores reproducible from stored components + methodology version |
| Alert dedupe | No duplicate delivery for same user + event + channel + delivery window |
| Opportunity Match explainability | 100% ranked results return component reasons and data-quality notes |

### 11.4 Freshness schedule

| **Data class** | **Initial refresh target** |
| :--- | :--- |
| Active jobs / structured ATS | 6-24 hours |
| Employer careers page | Daily or adaptive based on change frequency |
| Company metadata | Monthly / on observed change |
| Home Affairs labour agreements | Weekly + immediate update when source changes are detected |
| Regional migration definitions | Weekly / on official change |
| NERO | Monthly |
| IVI | Monthly |
| ABR bulk data | On official dataset release / at least monthly check |
| G-NAF | Quarterly release check |
| Derived employer signals | Event-driven after successful observation write; daily reconciliation |
| Regional opportunity scores | Monthly after JSA refresh + event-driven for material local employer changes |
| Saved-search alerts | Evaluate from change events continuously/batch; user-configurable digest cadence |

## 12. Security, Privacy and Compliance

### 12.1 Application security baseline

- Admin authentication with MFA and least-privilege roles.
- Rate limits and abuse controls on search/map/public API endpoints.
- CSRF protection for state-changing browser requests; secure cookies; hardened session management.
- Content Security Policy and secure response headers.
- Validate and sanitise URLs/content before rendering.
- Secrets stored in platform secret management, never repository variables committed to git.
- Encrypted managed database with automated backups and point-in-time recovery.
- Row-level or service-role separation where managed platform features make it useful.

### 12.2 Crawler SSRF protection

> [!CAUTION]
> **Required control**: Never let arbitrary user-supplied URLs become unrestricted server-side fetches. Resolve and validate destinations, allow only http/https, block loopback/private/link-local ranges, control redirects, and preferably crawl only registered source domains.

### 12.3 Data and licensing

- Record licence/terms metadata for every bulk data source.
- Attribute official/open datasets as required by their licences.
- Do not make unauthorised scraping of LinkedIn, SEEK or other third-party sites the foundation of the platform.
- Prefer employer first-party sources, government/open datasets and permitted structured feeds.
- Provide a correction/removal process for employer profile data.
- Keep migration information clearly informational and link users to official Home Affairs sources for authoritative requirements.

### 12.4 Personal data minimisation

**V1 should primarily model organisations, public job listings and aggregate labour-market information. Avoid collecting individual employee profiles, personal contact data or applicant data unless a later product requirement explicitly justifies it and a privacy/legal review is completed.**

## 13. Testing, Observability and Reliability

### 13.1 Test layers

| **Layer** | **Examples** |
| :--- | :--- |
| Unit | ABN normalisation, URL canonicalisation, postcode rules, role mapping, salary parsing |
| Parser fixtures | Greenhouse/Lever/other ATS JSON, careers HTML, Home Affairs table formats |
| Integration | Fetch -> snapshot -> parse -> match -> save -> query |
| Database | PostGIS region joins, uniqueness, idempotent upserts, evidence constraints |
| Browser / E2E | Map loads, filters, company drawer, region page, mobile behaviour |
| Regression | Known employer/source fixtures to catch parser drift |
| Load | Map viewport endpoint, search, clustered low-zoom responses |
| Scoring contract | Golden fixtures for Opportunity Match and regional score components/versioning |
| Event/alert | Event dedupe, alert suppression, preference handling, unsubscribe and replay safety |
| Data sufficiency | Trend/score hidden when minimum coverage or observation history is not met |

### 13.2 Observability

- Sentry for web/pipeline exceptions.
- Structured JSON logs containing run_id, source_id, company_id, parser_version, duration and record counts.
- Pipeline metrics: fetched, parsed, created, updated, unchanged, failed, quarantined.
- Data anomaly monitoring: sudden job-count collapse, unexplained geocoding shifts, duplicate spikes.
- Product analytics on search -> employer open -> source/careers click funnel.

### 13.3 Alert thresholds

| **Alert** | **Initial condition** |
| :--- | :--- |
| Repeated crawler failure | Same monitored source fails 3 consecutive scheduled runs |
| Job-count anomaly | Source drops >70-80% vs recent baseline without explicit source explanation |
| Government parser drift | Expected schema/field extraction falls below threshold |
| Map/API latency | p95 exceeds agreed target for sustained window |
| Database capacity | Storage/connection/CPU threshold crossed |
| Evidence freshness | Current sponsorship evidence passes freshness window without revalidation |
| Event backlog | Derived-event queue/backlog exceeds freshness target |
| Notification anomaly | Unexpected spike in sends, bounce/complaint rate or duplicate-delivery detection |
| Scoring drift | Golden query/entity score changes without methodology/data change |

## 14. Delivery Roadmap

> [!IMPORTANT]
> **Planning assumption**: This roadmap is sequenced for one strong developer using coding agents effectively. It is an implementation order, not a promise that every phase must fit a fixed calendar week. Data-source quirks and review load will determine actual pace.

| **Phase** | **Primary outcome** | **Key deliverables** | **Exit gate** |
| :--- | :--- | :--- | :--- |
| 0. Product contract | No ambiguity in rules | Taxonomies, schemas, evidence policy, source policy, MVP scope | Spec approved; no unresolved product blockers |
| 1. Geographic foundation | Australia is queryable spatially | PostGIS, ABS boundaries, G-NAF path, Home Affairs region import | Postcode/address -> coordinates + region + classification |
| 2. Employer identity | Canonical employer graph begins | ABR import, aliases, domain matching, locations, admin review | First 500 high-quality employers |
| 3. Map MVP | Users can explore employers | Map, clustering, viewport API, search, company drawer/profile | Usable desktop + mobile discovery flow |
| 4. Hiring intelligence | Hiring intelligence + time series | ATS adapters, careers parsers, role/skill classifier, immutable observations, event-ready signals | 300+ monitored sources; history retained without destructive updates |
| 5. Sponsorship evidence | Migration-related claims are sourced | Labour-agreement importer, explicit evidence extraction, source viewer | No unsourced sponsorship claims |
| 6. Regional intelligence | Regional intelligence + scoring | NERO/IVI import, DAMA context, region dashboards, versioned Tech Opportunity Score | Priority region pages useful; score shown only when sufficiency gates pass |
| 7. Opportunity + retention engine | Discovery becomes actionable and repeatable | Opportunity Match, saved searches, watches, change events, alert delivery, share cards | Golden-match tests pass; alerts dedupe; explainability visible |
| 8. Production hardening + launch dataset | System can operate reliably at launch quality | Security, Sentry, backups, tests, rate limits, crawl health, manual QA + 1,000 employers | Operational checklist and data-quality gates pass |
| 9. Commercial readiness (post-utility) | Monetisation can launch without corrupting trust | Employer claims, analytics entitlements, institutional export controls, billing boundaries | Only after repeat usage + data quality demonstrate demand |

### 14.1 Detailed build order

1. Database migrations and type contracts.

2. Government source registry + raw snapshot infrastructure.

3. ASGS geography and spatial lookup services.

4. Employer identity, aliases and locations.

5. ABR import and entity matching tools.

6. Admin company/location review.

7. 500-company seed dataset.

8. Map viewport API and clustering.

9. Public search and employer profile.

10. ATS adapters and generic careers crawler.

11. Job normalisation, immutable observation history, role/skill signals and event derivation.

12. Sponsorship evidence importer/extractor.

13. Home Affairs regional/DAMA layer.

14. JSA NERO/IVI ingestion and region pages.

15. Versioned Regional Tech Opportunity Score with sufficiency gates.

16. Explainable Opportunity Match engine and golden-query fixtures.

17. Saved searches, employer/region watches and change-event matching.

18. Alert delivery, dedupe, preferences, digest caps and unsubscribe flows.

19. Employer claim/correction and contribution review workflow.

20. Shareable insight-card generation from published data.

21. Production security, observability, load hardening and scoring/event monitors.

22. Dataset expansion, manual launch QA and launch report baseline.

## 15. Launch Criteria, KPIs and Operating Model

### 15.1 Public launch gates

| **Gate** | **Requirement** |
| :--- | :--- |
| Coverage | At least 1,000 deliberately selected and enriched employers across capitals and priority regional centres |
| Location quality | >95% of launch employers map to usable coordinates and regional geography |
| Freshness | Monitored job sources meet stated SLA; stale sources are visibly marked |
| Evidence integrity | 100% of sponsorship claims have inspectable sources and evidence category |
| Map performance | Responsive clustered map on modern desktop/mobile connections |
| Search quality | Known company/role/region test set achieves acceptable top-result relevance |
| Admin operations | Duplicate merge, evidence review, source disable and crawler rerun all work |
| Security/backup | MFA, secure secrets, rate limits, backups and restore procedure verified |
| Legal/source register | Licences/terms and attributions documented for production sources |
| Opportunity Match | Golden role/location/skill query set returns relevant employers with component explanations; no unexplained score |
| Alert safety | User preferences, dedupe, unsubscribe and delivery caps verified; no duplicate event delivery |
| Trend/score integrity | Momentum and regional scores suppressed when history/data sufficiency is below published thresholds |

### 15.2 North-star metric

> [!TIP]
> **Qualified opportunity discovery**: A user searches or filters, opens an employer that matches the intended role/location/constraints, meaningfully engages with the evidence, and follows a careers/job/source link or saves the opportunity. This measures whether the platform helped someone find a realistic place to work - not merely browse pins.

### 15.3 Supporting metrics

- Employer profile opens per search session.
- Careers/job source click-through rate.
- Percentage of discovery sessions involving regional employers.
- Search zero-result rate.
- Freshness coverage by employer tier.
- Saved company/search usage if accounts are introduced.
- Organic landing pages producing qualified discoveries.
- Opportunity Match result -> employer-open rate and source click-through.
- Saved-search/watch creation rate after a qualified discovery.
- Alert return rate and alert-to-opportunity engagement.
- Percentage of employer discoveries that are non-obvious/regional rather than top-known brands.
- Data-sufficiency suppression rate for trend/score features (quality guardrail, not a failure metric).

### 15.4 Initial operating cadence

| **Cadence** | **Operational task** |
| :--- | :--- |
| Daily | Review crawler failures, high-impact data anomalies, stale active jobs |
| Weekly | Review evidence queue, labour-agreement/regional source changes, duplicate candidates |
| Monthly | JSA imports, taxonomy review, quality metrics, top zero-result searches |
| Quarterly | G-NAF release check, source-policy review, region coverage gap analysis |

## 16. Key Risks and Mitigations

| **Risk** | **Why it matters** | **Mitigation** |
| :--- | :--- | :--- |
| Data freshness | Hiring/sponsorship information becomes misleading quickly | Per-source SLA, visible last-checked timestamp, stale state, automated alerts |
| Brittle crawlers | Careers sites change without notice | Structured feeds first, fixtures, parser versions, browser only when necessary, replayable snapshots |
| Employer identity errors | Wrong ABN or duplicate companies corrupt downstream data | Conservative matching, alias model, confidence thresholds, human review |
| Overstated sponsorship | Could materially mislead international users | Evidence categories, source links, neutral language, no negative inference from missing evidence |
| Thin regional coverage | Product becomes another Sydney/Melbourne directory | Deliberate regional seed strategy and coverage KPIs |
| SEO spam temptation | Combinatorial pages can reduce quality/trust | Only index pages with substantial unique data and clear user value |
| Third-party dependency | A blocked source could break coverage | Source hierarchy prioritises official/first-party/permitted feeds |
| Scope creep | Could become SEEK + LinkedIn + Glassdoor + immigration | Hard V1 non-goals and roadmap governance |
| Premature infrastructure | Solo build can drown in systems work | Modular monolith, Postgres-first search, simple scheduled workers |
| Opaque scoring | A black-box score can destroy trust or create false authority | Versioned components, published methodology, evidence reasons and score suppression when data is weak |
| Notification fatigue | Retention feature becomes spam and drives users away | Material-change thresholds, dedupe, default digests, caps and granular preferences |
| Cold-start trend bias | Early hiring momentum can be misleading with sparse history | Minimum observation windows, continuity checks and neutral "insufficient history" state |
| Commercial trust conflict | Paid employer products could appear to alter independent rankings | Strict separation of sponsored placement from organic scoring; employer-provided vs observed data clearly labelled |

## 17. Post-V1 Expansion

Post-V1 expansion should deepen intelligence or monetisation without diluting the core opportunity-discovery loop. Saved searches, alerts, hiring momentum and explainable matching are no longer deferred concepts: the architecture supports them from launch.

| **Expansion** | **Trigger** |
| :--- | :--- |
| Natural-language structured search | Users repeatedly express complex combinations that are cumbersome with filters; LLM translates intent into canonical filters only |
| Verified / enhanced employer products | Employers request claims, corrections, employer branding or recruitment visibility |
| Recruiter / workforce intelligence | Historical hiring dataset becomes sufficiently deep and reliable for paid market analysis |
| University / council / government dashboards | Regional coverage and labour-market joins are credible enough for institutional use |
| Public / licensed data API | External users request structured access and source licences permit redistribution/derived use |
| National annual Tech Employment Report | At least 12 months of high-coverage observations can support defensible trend analysis |
| Salary intelligence | Only with a compliant, sufficiently complete and well-sourced data strategy |
| Advanced recommendation / career trajectory models | Only after enough outcome/behaviour data exists to evaluate relevance and fairness |

## 18. Opportunity Engine, Retention and Business Architecture

This section defines the 10/10 product layer. It is intentionally built on the same canonical facts and provenance rules as the map. The product should become more useful as history accumulates, without requiring a second data architecture.

### 18.1 The Opportunity Graph

The Opportunity Graph connects employer -> location -> role family -> skills -> job observations -> hiring signals -> regional labour context -> sponsorship evidence. User preferences query this graph; they do not create new facts. This distinction lets recommendations remain explainable and source-backed.

| **Graph node / edge** | **Why it matters** |
| :--- | :--- |
| Employer -> Location | Where technology work is physically/operationally available |
| Employer -> Role family | Who the employer repeatedly hires, not just what it calls itself |
| Job -> Skill | Technology footprint and role-specific skill demand |
| Employer -> Observation window | Hiring velocity, momentum and seasonality over time |
| Employer/Region -> Evidence | Sponsorship and migration context with explicit provenance |
| Region -> Labour metric | Benchmark employer observations against broader Australian labour signals |
| User preference -> Employer | Explainable opportunity ranking; never stored as employer truth |

### 18.2 Opportunity Match score

V1 uses a transparent weighted ranking rather than machine-learning recommendations. The score is a convenience for ordering results, not a prediction of hiring success. Missing employer data should reduce confidence, not automatically count as a negative.

| **Component** | **Initial weight / rule** |
| :--- | :--- |
| Role fit | 30% - exact and adjacent role-family evidence, current + historical |
| Relevant current hiring | 20% - qualifying active roles and recency |
| Skill fit | 15% - observed skill overlap weighted by evidence count |
| Location / work-style fit | 15% - hard constraint where user marks required; otherwise weighted |
| Hiring consistency / momentum | 10% - only if sufficiency threshold passes |
| Optional sponsorship / regional preference | 10% - evidence preference, never visa-eligibility inference |

Every result returns score_components, data_quality, methodology_version and top_reasons. Product copy should prefer "Opportunity Match" rather than "chance of getting hired".

### 18.3 Hiring Momentum

Hiring Momentum measures change in technology hiring activity using our own observation history. It should use normalised windows and continuity checks so crawler outages are not mistaken for employer hiring collapses. Suggested display bands: Rising, Stable, Cooling, Insufficient history. Avoid percentages until the sample is large enough to make them meaningful.

### 18.4 Regional Tech Opportunity Score

The regional score is role-aware and versioned. It combines platform-observed employer/hiring coverage with selected JSA labour indicators and regional context. Publish component values and data period. Never rank a region when coverage is materially incomplete.

| **Component** | **Illustrative weight** |
| :--- | :--- |
| Relevant employer depth | 20% |
| Current relevant vacancies | 20% |
| Hiring momentum | 15% |
| JSA employment/vacancy direction | 15% |
| Employer / industry diversity | 10% |
| Remote/hybrid opportunity | 5% |
| Graduate/early-career opportunity | 5% |
| Sponsorship evidence density | 5% |
| Regional migration context | 5% |

### 18.5 Retention loop and alert policy

The user habit loop is discovery -> save -> monitor -> material change -> return. Alerts must be sparse and useful. New jobs alone can create noise; combine related events into digests when appropriate and allow user-specific importance rules.

| **Alert** | **Default behaviour** |
| :--- | :--- |
| New matching employer | Immediate or daily digest when a new company crosses the saved-query threshold |
| New relevant jobs | Daily digest by saved search; group multiple jobs per employer |
| Sponsorship evidence added | Immediate/high-value alert if enabled; always include source/evidence type |
| Hiring momentum changed | Weekly digest only; require material band change and sufficient history |
| Regional opportunity change | Monthly digest; avoid noisy score fluctuations |

### 18.6 Employer claims and community contributions

Employer-claimed facts, user contributions and platform observations are distinct namespaces. A verified employer may correct its careers URL, offices, programs and supplied tech stack, but cannot rewrite independent job-history or sponsorship observations. Community corrections require a source where feasible and move through moderation before publication.

### 18.7 Monetisation architecture

The consumer discovery product launches free to maximise reach and data feedback. Monetisation is designed into permissions and data boundaries from day one, but activated only after repeat utility and trust are established.

| **Business surface** | **Potential product** |
| :--- | :--- |
| Jobseeker / consumer | Free discovery; later optional premium alert depth or advanced analytics only if users demonstrate willingness to pay |
| Employer | Claimed/enhanced profile, recruitment campaigns, graduate/regional promotion, employer analytics |
| Recruiter / talent intelligence | Hiring momentum, competitor demand, role/skill market views |
| University / council / government | Regional workforce and employer ecosystem dashboards |
| Data/API | Licensed derived datasets and API subject to source/licensing constraints |

Commercial rule: payment must never silently change organic Opportunity Match, sponsorship evidence, hiring momentum or regional scores. Sponsored placement must be visually separate from independent ranking.

### 18.8 Distribution flywheel

The dataset should generate its own acquisition: region pages, employer intelligence, role hotspots, emerging-employer discoveries and an annual Australian Tech Employment Report. Public insights are derived from the same versioned metrics used in-product, so content creation reinforces data quality instead of becoming a separate editorial system.

18.9 10/10 success condition

The product reaches the intended strategic state when users no longer describe it as "a map of software companies". They should describe it as the place that shows which Australian employers are worth targeting, what is changing in tech hiring, and where new opportunities are appearing - with evidence they can inspect.

## Appendix A. Initial Taxonomies

**A.1 Company / technology niches**

| **Group** | **Example labels** |
| :--- | :--- |
| Software | SaaS, Enterprise Software, Developer Tools, Cloud, DevOps, Data Platforms |
| Financial | Fintech, Payments, Banking Technology, Insurtech |
| Industry technology | Mining Tech, Agritech, Construction Tech, Proptech, Logistics Tech |
| Public / social | GovTech, EdTech, Healthtech, Climate Tech |
| Deep / specialised | AI/ML, Cybersecurity, Robotics, Space, Defence Tech, IoT |
| Consumer / media | E-commerce, Marketplace, Gaming, Media Technology |
| Services | Technology Consulting, Managed Services, Systems Integration |

**A.2 Role families**

| **Family** | **Representative roles** |
| :--- | :--- |
| Software Engineering | Frontend, Backend, Full Stack, Mobile, Embedded, Staff/Principal Engineer |
| Data | Data Analyst, Analytics Engineer, Data Engineer, Data Scientist |
| AI / ML | ML Engineer, AI Engineer, Applied Scientist, MLOps |
| Cloud / Platform | Cloud Engineer, Platform Engineer, DevOps, SRE |
| Security | Cybersecurity Analyst, Security Engineer, GRC, AppSec |
| Quality | QA Engineer, Test Automation, Performance Test |
| Product / Delivery | Product Manager, Technical BA, Delivery / Program roles |
| Design | Product Designer, UX/UI, UX Research |
| Architecture | Solution Architect, Enterprise Architect, Data Architect |
| IT / Infrastructure | Systems, Networks, Support, End User Computing |

**A.3 Work style enum**

- onsite
- hybrid
- remote
- flexible / mixed
- unknown

**A.4 Evidence status enum**

active | stale | superseded | rejected | needs_review

## Appendix B. Repository Structure

This reflects the actual structure established by the Phase 1 foundation commit (`5100fe7`), not an aspiration — update it whenever the real layout changes so it doesn't drift the way this section previously did.

```text
au-tech-map/
|
+-- apps/
|   +-- web/                       Next.js app (role-protected /admin routes land here in a later phase)
|       +-- src/app/               App Router: pages, layout, /api/health
|       +-- package.json, tsconfig.json, eslint.config.mjs, next.config.ts, postcss.config.mjs
|
+-- packages/
|   +-- contracts/                 Shared Zod contracts (versioned response schemas, e.g. HealthResponseSchema)
|
+-- workers/
|   +-- ingestion/                 Python ingestion worker
|       +-- src/austechmap_ingestion/   Importers/crawlers/enrichment land here as their delivery phases begin
|       +-- tests/
|       +-- pyproject.toml, requirements-dev.lock
|
+-- db/                            Versioned PostgreSQL migrations - empty until the remaining Phase 0
|                                   database contracts close (see db/README.md)
+-- docs/                          Operational docs (development.md: local setup)
+-- tests/                         Reserved for cross-workspace integration/E2E tests (empty so far)
+-- .github/workflows/             CI: lint, format, typecheck, unit tests, build
+-- AGENTS.md
+-- ARCHITECTURE_DECISIONS.md
+-- HANDOFF.md
+-- IMPLEMENTATION_PLAN.md
+-- PRODUCT_SPEC.md
+-- README.md
```

Not yet present: `apps/admin` stays inside `apps/web` per IMPLEMENTATION_PLAN.md rather than a separate app; `packages/ui`, `packages/taxonomy`, and `packages/config` haven't been needed yet; `workers/ingestion` gains importer, crawler, and enrichment subdirectories as the corresponding pipeline phases begin.

**B.1 Documentation set**

- `README.md` - short project introduction and links to the documents below.
- `PRODUCT_SPEC.md` - vision, users, scope, data model, and policy (this file).
- `ARCHITECTURE_DECISIONS.md` - authoritative technology choices and their rationale; overrides this file's tech recommendations where they conflict.
- `IMPLEMENTATION_PLAN.md` - phase sequencing, tasks, dependencies, and exit gates.
- `AGENTS.md` - coding-agent roles, tooling, the quota-based switching protocol, and quality gates.
- `HANDOFF.md` - the live implementer-switch record between Codex and Claude.
- `db/README.md` - database status and what's gated pending Phase 0.
- `docs/development.md` - local development setup.

Not yet split into their own files - currently covered within this document's relevant sections, split out only if this document grows unwieldy: a dedicated `SOURCE_POLICY.md` (§5), `SPONSORSHIP_EVIDENCE.md` (§8), or `DATA_MODEL.md` (§6).

## Appendix C. Source Register

**The following official sources underpin the initial architecture. Source availability, terms, schemas and update cadences must be revalidated during implementation.**

**[S1] Australian Business Register - ABN Bulk Extract**

https://data.gov.au/data/dataset/abn-bulk-extract

Public ABN subset including identity, status, names, main state/postcode and ACN/ARBN. Dataset metadata updated in 2026.

**[S2] Australian Bureau of Statistics - ASGS Edition 3 Digital Boundary Files**

https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files

Official SA1-SA4, GCCSA, state/territory and non-ABS structures such as LGA, Postal Areas and Suburbs/Localities.

**[S3] Data.gov.au / Geoscape - G-NAF**

https://data.gov.au/data/dataset/geocoded-national-address-file-g-naf

National geocoded address dataset; February 2026 release lists 15,860,127 addresses and quarterly updates.

**[S4] Jobs and Skills Australia - NERO**

https://www.jobsandskills.gov.au/data/nero

Monthly nowcast of employment by occupation and SA4 region.

**[S5] Jobs and Skills Australia - NERO Methodology**

https://www.jobsandskills.gov.au/data/nero/nero-methodology

Methodology and caveats for NERO; use trends with caution, especially small series.

**[S6] Jobs and Skills Australia - Internet Vacancy Index**

https://www.jobsandskills.gov.au/data/internet-vacancy-index

Monthly online job-ad data with occupation and regional breakdowns; July 2026 release available at document date.

**[S7] Jobs and Skills Australia - IVI Methodology**

https://www.jobsandskills.gov.au/data/internet-vacancy-index/methodology

Scope and limitations of online vacancy data, including SA4 regional structure.

**[S8] Department of Home Affairs - Labour Agreements Overview**

https://immi.homeaffairs.gov.au/employer-subsite/Pages/labour-agreements.aspx

Explains labour agreements and visa programs they can support.

**[S9] Department of Home Affairs - List of Current Labour Agreements**

https://immi.homeaffairs.gov.au/visas/employing-and-sponsoring-someone/labour-agreements/list-of-current-labour-agreements

5,907 listed agreements; list current as at 30 June 2026; page last updated 4 August 2026.

**[S10] Department of Home Affairs - Designated Regional Areas**

https://immi.homeaffairs.gov.au/visas/working-in-australia/regional-migration/eligible-regional-areas

Official Category 2 and Category 3 regional definitions and postcode guidance.

**[S11] Department of Home Affairs - Designated Area Migration Agreements**

https://immi.homeaffairs.gov.au/employer-subsite/Pages/designated-area-migration-agreements.aspx

Current DAMA framework and list; 13 DAMAs at document date.

**[S12] Department of Home Affairs - DAMA overview**

https://immi.homeaffairs.gov.au/visas/working-in-australia/regional-migration/dama

Explains employer/occupation requirements and that individuals cannot directly access a DAMA.

## Appendix D. Scoring and Event Contracts

D.1 Score contract

| **Field** | **Requirement** |
| :--- | :--- |
| score_type | opportunity_match \| region_opportunity \| hiring_momentum_band |
| methodology_version | Immutable version identifier for formula/threshold configuration |
| input_period | Exact observation window / labour-data period |
| score / band | Derived output; nullable when sufficiency fails |
| components_json | Named component values and weights; no hidden component |
| sufficiency_json | Coverage, sample size, continuity and suppression reasons |
| generated_at | Timestamp of derivation |

D.2 Event contract

| **Field** | **Requirement** |
| :--- | :--- |
| event_type | Stable semantic key such as job.first_seen or sponsorship.evidence_added |
| entity_type / entity_id | Canonical object affected by the event |
| occurred_at | When the underlying change is considered to have occurred/been observed |
| source/evidence reference | Required for source-backed events |
| dedupe_key | Stable key preventing repeated creation/delivery of the same material change |
| payload_json | Minimal display/query metadata; canonical truth remains in primary tables |
| event_version | Allows event semantics to evolve without rewriting history |

D.3 Notification invariants

- One user + event + channel + delivery window cannot be delivered twice.
- Unsubscribe and per-alert preferences must be applied before enqueueing delivery; every delivery records its source event, matching saved search/watch and delivery outcome.
- Stale evidence or crawler failures cannot create user-facing change alerts.

**Document Decision Summary**

| **Decision** | **V1 position** |
| :--- | :--- |
| Primary asset | Longitudinal Australian Technology Opportunity Graph |
| Primary interface | Interactive map + opportunity search/matching + employer/region intelligence + alerts |
| Architecture | Modular monolith + independent ingestion workers |
| Database | PostgreSQL + PostGIS |
| Search | Postgres FTS + pg_trgm initially |
| Geocoding | G-NAF-first bulk Australian geocoding strategy |
| Employer identity | ABR-backed identity resolution, not ABR-only discovery |
| Hiring truth | Current employer/ATS observations + immutable history + versioned hiring signals |
| Sponsorship truth | Evidence categories + source; never a boolean guess |
| Regional truth | Home Affairs + ABS geography + JSA indicators + versioned regional opportunity scoring |
| V1 scale | ~1,000 high-quality employers |
| Monetisation | Architected from day one; consumer launch free; employer/intelligence monetisation only after repeat utility and trust |
| Recommendation logic | Explainable weighted Opportunity Match first; no opaque hiring-success prediction |
| Retention loop | Saved searches + employer/region watches + deduplicated material-change alerts |
| Commercial trust rule | Paid placement never silently changes organic scores, evidence or independent hiring signals |
