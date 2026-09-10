# Static careers source lifecycle review waiver - 10 September 2026

## Decision

The user explicitly waived independent AI review for the static careers source
lifecycle and approved Codex to merge the change directly to `main`.

The normal isolated Codex reviewer was quota-blocked. The available Claude Code
reviewer timed out without returning a verdict. This waiver applies only to
commit `931125e`; it does not authorize production database promotion, source
registration, or a production crawl.

## Covered change set

- `931125e` - add migration `0023`, static careers provider support, immutable
  HTML snapshot-before-parse, conservative JSON-LD job persistence, replay, and
  fixture-backed tests.

## Verification evidence

- `git diff --check` passed before commit.
- Scoped Ruff and formatting checks passed.
- Strict mypy passed across 56 ingestion source files.
- The full ingestion suite passed: 292 tests passed; 100 PostGIS-dependent
  integration tests were skipped locally.

## Residual risks

- No independent AI review completed for this change set.
- Migration `0023_add_static_careers_provider.sql` has not been applied to Neon.
- No `static_careers` source has been registered and no production crawl ran.
