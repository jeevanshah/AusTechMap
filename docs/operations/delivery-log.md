# Autonomous delivery log

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

## 2026-09-10 — ambiguous-location canonical-host recovery

- Commit: `data: recover ambiguous-location address evidence` (this commit)
- Scope: a bounded, read-only retry on `www` and HTTP canonical-host variants for the 166 initially unreachable domains, followed by the same standard first-party location-path sweep on recovered domains.
- Result: 36 domains were recovered; four produced single complete first-party address candidates. The repair preflight now has 28 rows, all passing strict validation; no additional multi-office case was selected.
- Verification: bounded first-party fetches only, strict address-fixture validation (28 rows, no errors or duplicate addresses), and `git diff --check`.
- Residual risk: no candidate has been geocoded or imported. Production geocoding/import remains an explicit approval gate.
