# Phase 6B regional-foundation review waiver — 8 September 2026

## Decision

The user explicitly waived independent AI review for PRs #9 and #10 and approved Codex to record
the waiver. Claude remains unavailable because of provider/student-account access constraints.

This waiver covers only the two change sets below. It is not an independent approval and does not
waive review for later Phase 6B work or production database promotion. See `AGENTS.md` Rule 6.

## Covered change sets

| PR  | Candidate commit | Merge commit | Purpose                                                                                                                                                        |
| :-- | :--------------- | :----------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #9  | `277ebc9`        | `44d9b56`    | Add the regional-intelligence schema, reproducible/suppressible score foundation, SA4 API/profile, tests, methodology candidate, and explicit R2 pause record. |
| #10 | `33cb729`        | `5af7e69`    | Correct the live-PostGIS integration fixture to use the frozen `government_open_data` source kind.                                                             |

## Verification evidence

- Local worker verification passed: Ruff, strict mypy across 46 source files, and 239 Python tests;
  91 tests requiring PostgreSQL/PostGIS were skipped locally.
- Local web verification passed: formatting, ESLint, TypeScript, 20 contract tests, 105 web tests,
  and the production Next.js build.
- Migrations `0001`–`0015` were unchanged; `0016_regional_intelligence_foundation.sql` is forward-only.
- PR #9 and its first merge run correctly failed the new live-database test because its fixture used
  `government`, which is not a member of the frozen `source_kind` enum. PR #10 changed only that
  fixture value to `government_open_data`.
- Final GitHub Actions run
  [34214771380](https://github.com/jeevanshah/AusTechMap/actions/runs/34214771380) passed both `web`
  and `ingestion` at merge commit `5af7e69`. The ingestion job applied migrations `0001`–`0016` to
  disposable PostgreSQL 17/PostGIS 3.5 and passed the complete integration suite.

## Residual risks and deployment state

- No independent AI review was completed for these change sets. Automated verification is strong
  but is not represented as a substitute independent opinion.
- The score weights match the Product Spec's illustrative weights, while saturation points,
  sufficiency thresholds, migration-context strengths, and NERO/IVI direction mapping remain
  explicit review questions in `docs/methodology/regional-opportunity-v1.md`.
- NERO and IVI acquisition/import are not implemented yet. Production score generation must not run
  until those inputs and their mapping methodology exist.
- The SA4 profile passed static responsive safeguards and production compilation, but its rendered
  320/375/414/768 px browser pass remains outstanding.
- Cloudflare R2 and production ingestion remain paused under
  `docs/operations/2026-09-08-r2-ingestion-pause.md`.
- The user separately approved production promotion of migration `0016`. Its actual deployment and
  post-deployment verification will be recorded after execution.
