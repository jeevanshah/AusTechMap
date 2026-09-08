# Phase 5 source-operations review waiver — 8 September 2026

## Decision

The user explicitly waived the independent AI review for
`feat/phase-5-source-operations` and approved Codex to log the waiver and push the branch directly to
`main`. Claude remains unavailable because of provider/student-account access constraints.

This waiver covers only the change set named below. It is not an independent approval and does not
waive review for later changes or production database promotion. See `AGENTS.md` Rule 6.

## Covered change set

- `09305f1` — reconcile the Phase 6A plan and README with deployed evidence lifecycle behavior.
- `8ce13e2` — redirect anonymous MFA enrollment/verification page visits to sign-in.
- `cd21f04` — add migration `0015`, ATS due scheduling, quarantine/kill-switch controls, and read-only
  snapshot replay.
- `bfe2b0f` — add mandatory correlation IDs to ATS source-state audit records.
- `af09ce5` — correct the database-backed audit assertion to order by `occurred_at`.
- `a3bd9e3` — document Phase 5 operations and remove temporary branch-only CI diagnostics.

Commits `3f44f31`, `026cdd7`, and `fc4b40f` temporarily enabled and split branch CI to expose
database-only failures. Their workflow changes are fully reverted by `a3bd9e3`; they have no net
effect on `main`'s CI configuration.

## Verification evidence

- Local web checks passed: formatting, ESLint, TypeScript, 17 contract tests, 100 web tests, and the
  production Next.js build.
- Local worker checks passed: Ruff, strict mypy across 77 source files, and 235 tests; 90 tests needing
  live PostgreSQL/PostGIS were skipped locally.
- GitHub Actions run
  [34197290006](https://github.com/jeevanshah/AusTechMap/actions/runs/34197290006) passed both `web`
  and `ingestion` at `af09ce5`. The ingestion job applied migrations `0001`–`0015` to disposable
  PostgreSQL 17/PostGIS 3.5 and passed the complete suite, including adaptive intervals, due-source
  selection, automatic quarantine, audited kill-switch transitions, and snapshot replay.
- `git diff --check`, formatting, Ruff, and strict mypy passed again after the final documentation and
  CI-cleanup commit.
- Migrations `0001`–`0014` have no diff from `origin/main`; `0015` is forward-only.

## Residual risks

- No independent AI review was completed for this change set.
- The user separately approved production promotion of `0015_hiring_source_operations.sql`. The
  checksum-locked runner applied exactly that migration and a read-only query confirmed version 15.
  All 10 registered ATS sources remained active with non-null due timestamps; all 10 were initially
  due. No crawl was started as part of migration deployment.
- The anonymous MFA redirect fix is verified by tests/build but remains undeployed until this branch
  reaches `main` and Vercel finishes deployment.
- Production magic-link and MFA submission flows were not exercised because doing so sends email,
  creates or updates authentication state, and consumes rate-limit counters.
- Snapshot replay is deliberately read-only. It verifies and reproduces current parser/normalizer
  output without creating replay runs or modifying historical/current job rows.
