# Autonomous delivery log

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
