# ATS job-count anomalies independent-review waiver

- **Date:** 2026-09-11
- **Scope:** `feat/source-job-count-anomalies` (`c1eca37`)
- **User authorization:** “I waive independent AI review for feat/source-job-count-anomalies and approve Codex to merge it directly to main.”
- **Verification:** `git diff --check`, Prettier check, TypeScript typecheck, lint, and the production build passed. The contracts and web suites passed 220 tests. Worker Ruff and strict mypy passed; worker pytest passed 305 tests, with 102 tests skipped locally because they require a live PostGIS database.
- **Outcome:** Codex fast-forwarded the branch to `main` and pushed it. Migration `0025_add_ats_source_crawl_metrics.sql` introduces append-only successful-crawl counts, a three-crawl median baseline, and an audited alert when a board with a baseline of at least ten roles falls to 50% or less. Staff monitoring shows the latest count-drop alerts.
- **Production boundary:** Migration 0025 is committed only. It has not been applied to Neon, and this delivery registers no source, starts no crawl, configures no R2 service, and changes no production data.
