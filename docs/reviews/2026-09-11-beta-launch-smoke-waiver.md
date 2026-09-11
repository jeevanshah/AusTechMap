# Beta launch-smoke independent-review waiver

- **Date:** 2026-09-11
- **Scope:** `feat/beta-launch-smoke` (`8ae75a2`)
- **User authorization:** “I waive independent AI review for feat/beta-launch-smoke and approve Codex to merge it directly to main.”
- **Verification:** `git diff --check`, Prettier check, TypeScript typecheck, lint, and the production build passed. The contracts and web suites passed 224 tests, including four focused launch-smoke tests.
- **Outcome:** Codex fast-forwarded the branch to `main` and pushed it. A manual GitHub Actions workflow accepts an operator-supplied canonical HTTPS deployment URL and checks the public home, jobs, methodology, regions API, and deep connected database health.
- **Production boundary:** The workflow runs only through `workflow_dispatch`; it does not run on pushes, apply a migration, write production data, register a source, trigger a crawl, or configure R2.
