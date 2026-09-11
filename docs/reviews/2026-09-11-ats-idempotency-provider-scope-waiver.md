# ATS idempotency provider scope independent-review waiver

- **Date:** 2026-09-11
- **Scope:** `fix/ats-idempotency-provider-scope` (`4368287`)
- **User authorization:** “okay do it”
- **Verification:** Prettier check, TypeScript typecheck, ESLint, `git diff --check`, and Vitest passed (224 tests: 46 contracts, 178 web). Worker Ruff check and strict mypy passed; worker pytest passed 306 tests, with 103 tests skipped locally because they require a live PostGIS database.
- **Outcome:** Branch fast-forwarded to `main`. ATS crawl idempotency keys now include the ATS provider name (`{provider}:{identifier}:{date}`), preventing same-day crawl collision when an employer moves between ATS providers that share the same identifier (e.g. SmartRecruiters to Lever for Mable).
- **Production boundary:** Code and test changes only. No schema migration or production data writes.
