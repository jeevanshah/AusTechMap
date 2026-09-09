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
