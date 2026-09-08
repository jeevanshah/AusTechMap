# Claude review waiver — 8 September 2026

## Decision

The user explicitly waived the outstanding Claude review for the Phase 6A and authentication/CI
changes listed below. Claude was unavailable because of student-account/access constraints and
repeated CLI provider failures (`timeout` and `ConnectionRefused`). One earlier response received an
incomplete, command-line-truncated diff and is not counted as a valid review.

This is a scoped governance exception, not an independent approval and not a permanent removal of
the review gate. Later changes still require an independent AI review unless the user records another
explicit waiver. See `AGENTS.md` Rule 6.

## Covered history

| PR  | Candidate commit(s)  | Merge commit | Purpose                                                                |
| :-- | :------------------- | :----------- | :--------------------------------------------------------------------- |
| #4  | `d55b45e`            | `4074e17`    | Complete the Phase 6A evidence lifecycle.                              |
| #5  | `4746b0f`            | `f4a5504`    | Make evidence-status mutation and its audit record atomic.             |
| #6  | `5195227`            | `4a41b8b`    | Self-host fonts so builds do not fetch Google Fonts.                   |
| #7  | `8a82430`            | `1dc349b`    | Supply a non-secret build-only database URL to Auth.js in CI.          |
| #8  | `5367e55`, `040bcdd` | `94dd01e`    | Harden MFA/IP rate limits and preserve locks across window boundaries. |

`5367e55` was authored by Claude and independently reviewed by Codex; that review found the
fixed-window lock bypass corrected in `040bcdd`. The waiver primarily closes the missing independent
review for the Codex-authored commits above.

## Verification evidence

- Final `main` at `94dd01e` passed both GitHub jobs on Actions run
  [34173951276](https://github.com/jeevanshah/AusTechMap/actions/runs/34173951276): `web` success and
  `ingestion` success.
- The ingestion job applied migrations `0001`–`0014` to ephemeral PostgreSQL 17/PostGIS 3.5 and ran
  the real database tests, including the rate-limit window-boundary and six-way concurrency cases.
- Before PR #8, the full local verification was: formatting clean; ESLint clean; TypeScript clean;
  114 JavaScript/TypeScript tests passed; Ruff clean; mypy strict clean across 75 files; 231 Python
  tests passed; and the production Next.js build succeeded.
- Migrations `0001`–`0013` remained byte-for-byte unchanged when `0014` was added.
- Earlier merge runs for `4074e17`, `f4a5504`, and `4a41b8b` had successful ingestion jobs but failed
  the web build. Those failures were traced to Google Font network fetching and the missing build-time
  `DATABASE_URL`, then corrected by PRs #6 and #7. Merge commits `1dc349b` and `94dd01e` passed both
  jobs.

## Residual risks and deployment state

- No valid Claude review was completed for the waived Codex-authored changes. Automated verification
  is strong but is not represented as a substitute independent opinion.
- An initial read-only production Neon query on 8 September 2026 showed `schema_migrations` only
  through `0012_auth_rate_limiting.sql`. At that point, `/api/health` and `/` returned `200`, while
  `/api/search/companies?q=Atlassian` returned `500`, consistent with the missing evidence-status
  schema.
- The user then explicitly approved applying migrations `0013` and `0014` to production Neon. The
  checksum-locked migration runner applied exactly `0013_evidence_lifecycle.sql` and
  `0014_harden_auth_rate_limiting.sql` and exited successfully with a count of two.
- A separate read-only query confirmed versions 13 and 14 in `schema_migrations`. Post-deployment GET
  checks returned `200` for `/api/health`, `/`, and `/api/search/companies?q=Atlassian`; the search
  response contained the expected Atlassian result.
- A real production magic-link and staff-MFA round trip was not performed during this deployment.
  Their rate-limit paths are covered by the passing unit and live-PostGIS CI tests described above,
  but remain an explicit end-to-end verification item.
- The GitHub warning that older action releases target Node.js 20 is non-blocking maintenance; the
  runner forced Node.js 24 and both final jobs still passed.
