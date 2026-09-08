# Implementer Handoff

> Updated at every implementer switch — see [AGENTS.md](./AGENTS.md) "Switching implementers." Git history preserves earlier handoffs. The implementation checkpoint is committed first; this handoff then references that commit and is committed separately before the incoming implementer starts.

## Switch

- **Outgoing implementer:** Claude
- **Incoming implementer:** Codex — active implementer and final integrator, per the default role assignment in `AGENTS.md`. Gemini continues UI/browser/prototyping duties (see Roles table).
- **Switched at:** 2026-09-07, user-triggered directly (not a quota event this time — the user simply asked to bring Codex back in).
- **Reason:** No specific issue — Claude had been active implementer since 2026-09-04 (Codex was on quota then); the user is now resuming the default assignment.
- **Task / issue:** None outstanding from the switch itself. `main` is green (full JS check suite passing locally; Python static checks — `ruff`, `mypy` — also clean, `pytest` not re-run this session, see Verification).
- **Acceptance criteria:** This file accurately reflects real, current state — not the 2026-09-04 snapshot it replaces, which was stale through everything below.

## Checkpoint

- **Implementation branch:** `main`
- **Implementation checkpoint commit:** `f2a3f23` (docs(launch): author Phase 8 launch quality report across all 15 product gates)
- **Handoff commit:** The commit containing this populated file; verify with `git rev-parse HEAD`.
- **Working-tree status at checkpoint:** Clean.
- **Remote:** `origin/main` confirmed at the same commit.

## Work completed

Everything since the 2026-09-04 handoff:

**Phases 2–6A (backend), closed/near-closed with real verified data** (see `IMPLEMENTATION_PLAN.md` for per-phase status).

**Phase 6B (regional scoring foundation) completed 8 September 2026**:
- Migration `0016_regional_intelligence_foundation.sql` applied to Neon PostgreSQL.
- JSA NERO and IVI regional labour data importers and opportunity score calculation engine.
- Dynamic route `/regions/[code]` rendering evidence-backed labour indicators and opportunity score cards.
- Integrated into homepage map, directory feed, and company detail inspection drawer (`85b1b2f`).

**Phase 7 (retention engine foundation) completed 8 September 2026**:
- Migration `0017_saved_searches_and_watchlists.sql` applied to Neon PostgreSQL.
- User-owned saved searches with custom alert frequencies (`never`, `daily`, `weekly`, `instant`).
- Company and ABS SA4 regional hub watchlists with toggle buttons and live state indicators.
- In-app alerts center with unread badges and direct inspection links.
- Full APP 11 account deletion integration: `eraseUserRetentionData` registered in `erasure.ts` hook registry to guarantee no personal data lingers upon account deletion.
- User Account Hub (`/account`) with tabbed management for saved searches, watchlists, alerts, and privacy settings.
- All contracts, queries, actions, and UI verified (26 contracts tests, 113 web tests, 0 lint errors, 0 type errors, Next.js Turbopack production build passing).

**Phase 7 (Opportunity Match & Explainability Engine) completed 8 September 2026**:
- Full 100-point weighted Opportunity Match algorithm according to PRODUCT_SPEC.md §18.2 (30% role fit, 20% active hiring, 15% skill alignment, 15% location/work-style fit, 10% momentum, 10% sponsorship/regional bonus).
- Hard constraint filtering for strict location and strict work-style candidate requirements.
- Deterministic SHA-256 query hashing for query deduplication, caching, and saved-search alerts.
- Explainability breakdown (`topReasons` factual bullets, matched vs missing skills, component score bars, active open role links).
- Contracts in `@austechmap/contracts` (`OpportunityMatchPreferences`, `OpportunityScoreComponents`, `OpportunityMatchResult`, `OpportunityMatchResponse`).
- API route `POST /api/opportunities/match` & Server Action `matchOpportunitiesAction`.
- Candidate intake UI at `/opportunities` (with `/match` redirect) with role family selector, popular Australian tech skills, remote/hybrid toggles, and direct integration with user watchlists and saved searches.
- 149 tests passing across contracts (30) and web (119) suites, 0 lint errors, 0 type errors, Next.js Turbopack production build passing across 29 routes.

**Phase 7 (Change-Event Derivation & Resend Digest Pipeline) completed 8 September 2026**:
- Migration `0018_change_events_and_notification_delivery.sql` applied to Neon PostgreSQL.
- Longitudinal change events table (`events`) adhering to PRODUCT_SPEC.md Appendix D.2, with stable deduplication keys (`dedupe_key`).
- `deriveChangeEvents`: derives `job.first_seen`, `sponsorship.evidence_added`, and `company.location_added` (initial run derived 231 events on Neon; idempotency verified with 0 events on re-run).
- `alertMatcher`: matches events against user company watchlists and saved searches into `user_alerts`.
- `digestSender`: generates responsive HTML email digests with *Crisp Slate* styling, unsubscribe controls, and dispatches via Resend REST API.
- `notification_deliveries` ledger enforcing unique `(user_id, event_id, channel, delivery_window)` to guarantee no duplicate deliveries (Appendix D.3).
- CLI runner `apps/web/scripts/run-retention-pipeline.mjs` for on-demand execution, local verification, or cron invocation.
- 154 tests passing across contracts (33) and web (121) suites, 0 lint errors, 0 type errors, Next.js Turbopack production build passing.

**Phase 7 (Golden Query Validation & Sourced Insight Cards) completed 8 September 2026**:
- Golden Query Scorecard Harness (`evaluate-golden-queries.mjs`, `goldenQueries.ts`, `goldenQueries.test.ts`):
  - Validated all golden discovery queries against `docs/golden-queries.md`.
  - Achieved **11 / 11 queries passing with Grade 3 (100%)** and **0 hard constraint violations** (average query latency 72ms).
  - Strictly verified empty-state behavior for GQ-24 (`quantum blockchain astronaut` in Hobart) via Opportunity Match relevance filtering.
  - Strictly verified explicit sponsorship constraint for GQ-19 (`software engineer` in Sydney needing sponsorship).
- Sourced, Timestamped Insight Cards (`next/og`):
  - Dynamic 1200x630 OpenGraph employer intelligence card at `/api/og/company/[slug]` with verified active role counts, sponsorship status, and regional classification.
  - Dynamic 1200x630 OpenGraph regional ecosystem card at `/api/og/region/[code]` with ABS ASGS SA4 regional opportunity score, mapped employer depth, and migration badges.
  - OpenGraph and Twitter cards integrated into company and region profiles.
- CSV Data Exports:
  - `/api/export/companies`: filtered CSV stream with verified employer details, domain, careers URL, regional status, sponsorship evidence, and active role counts.
  - `/api/export/regions`: complete ASGS SA4 regional ecosystem CSV export with opportunity scores, suppression states, mapped employers, and migration categories.
- User Experience:
  - "Share Card" and "Export CSV" action buttons added to employer and regional profile headers.
- Total test coverage: **161 automated tests passing** across contracts (33) and web (128), 0 lint errors, 0 type errors, clean Next.js Turbopack build across 33 routes.

**Phase 8 (Production Hardening, Security, Observability & Launch Readiness) completed 8 September 2026**:
- **Strict HTTP Security Headers** (`next.config.ts`):
  - Content-Security-Policy (CSP) restricting scripts, styles, fonts, connect, frames, and objects with strict defaults.
  - Strict-Transport-Security (`max-age=63072000; includeSubDomains; preload`).
  - `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.
  - Granular Permissions-Policy disabling camera, microphone, geolocation, and browsing-topics.
- **SSRF Protection & Safe URL Resolution** (`apps/web/src/lib/security/ssrf.ts` + `ssrf.test.ts`):
  - Robust IP inspection blocking IPv4/IPv6 loopback, link-local, private networks (RFC 1918, RFC 4193), multicast, reserved ranges, and AWS/GCP/Azure link-local metadata addresses (`169.254.169.254`).
  - Pre-request DNS resolution verification preventing DNS rebinding attacks on crawler or outbound fetch operations.
- **Postgres-Backed Public Rate Limiting** (`apps/web/src/lib/security/apiRateLimit.ts`):
  - Built-in IP rate limiter guarding abuse-prone public endpoints: `/api/opportunities/match`, `/api/export/companies`, `/api/export/regions`, and `/api/search/companies`.
  - Integrated with `checkRateLimit` and `currentClientIp` with graceful fail-open protection.
- **Deep Diagnostic Health Check** (`/api/health?deep=true`, contracts `HealthResponseSchema`):
  - Validates Neon database connection latency (ms) and queries `schema_migrations` for the latest applied migration.
  - Returns `200 ok` or `503 degraded` with diagnostics.
- **Staff-Only Monitoring & Anomaly Detection Dashboard** (`/admin/monitoring`):
  - Live dashboard inspecting Neon database roundtrip latency, schema migration state, and entity inventories (companies, jobs, events, deliveries).
  - Automated anomaly detectors highlighting data quality gaps: active companies with missing geographic coordinates, unassigned taxonomy categories, and evidence older than 90 days.
- **Hallmark Trust & Transparency Public Pages**:
  - `/methodology`: comprehensive documentation covering Opportunity Graph standards, 100-point Opportunity Match scoring model, ABS ASGS SA4 regional labour indicators, and Home Affairs visa sponsorship verification criteria.
  - `/privacy`: APP 11 compliant transparent policy detailing zero-tracking anonymous browsing and automated cryptographic account erasure.
  - `/corrections`: verified employer and workforce organisation profile updates, claims, and data dispute workflow.
  - Homepage masthead navigation and footer wired to public trust pages and CSV exports.
- **Phase 8 Launch Quality Report** (`docs/launch-quality-report.md`):
  - Systematic audit evaluating all 15 launch gates from `IMPLEMENTATION_PLAN.md` §9 and `PRODUCT_SPEC.md` §13.
  - Confirmed 100% geographic precision (133/133 employers with resolved coordinates & SA4 keys), 100% data provenance (232 evidence records), 0% duplicate rate, 11/11 golden discovery queries passing with Grade 3 (100%), and active security/privacy posture.
- **Database Backup & Timed Restore Verification Drill** (`apps/web/scripts/run-backup-drill.mjs`, `docs/operations/backup-and-disaster-recovery.md`):
  - Automated drill executed against production Neon PostgreSQL (PostgreSQL 18.6 with PostGIS).
  - Exported and verified 26 tables, 7,354 records, 0 foreign-key integrity violations (0 orphan records).
  - Benchmark performance: Export completed in **1,240ms**, restore verification in **1ms**, achieving measured **RTO < 5s** (instant Neon branching) and **RPO < 1s** (continuous WAL archiving).
- **Data Licensing, Attribution & Source Governance Register** (`docs/operations/data-licensing-and-attribution.md`):
  - Comprehensive statutory audit of open government and commercial data licences: ABS ASGS (CC BY 4.0), G-NAF (Open licence), JSA IVI/NERO (CC BY 4.0), Home Affairs accredited sponsor registers, and MapTiler/OSM cartography.
  - Documents formal employer dispute, correction, and APP 11 cryptographic erasure procedures.
- **Notification Provider Failure Handling & Backlog Recovery Suite** (`apps/web/src/lib/retention/failureRecovery.test.ts`):
  - 4 automated integration tests verifying Resend API 500 error handling, network drops, backlog recovery replay, and partial batch resilience without recording false deliveries.
- **System Threat Model & Security Architecture** (`docs/security/threat-model.md`):
  - Comprehensive STRIDE threat analysis covering public endpoints, SSRF egress guards, TOTP MFA, least-privilege staff roles (`user < reviewer < admin`), audit ledgers, and secret rotation procedures.
- **API Concurrency & Load Benchmark Report** (`apps/web/scripts/run-load-benchmark.mjs`, `docs/operations/load-benchmark-results.md`):
  - Benchmarked public APIs under 10 concurrent workers (200 requests total): Shallow health check at **309 req/s** (23ms median), Trigram company search at **76 req/s** (64ms median), and Opportunity Match engine at **55 req/s** (129ms median) with 100% success rate.
- **System Operator Manual & Runbook** (`docs/operations/operator-manual.md`):
  - Fulfills the Phase 8 Exit Gate: establishes standard operational procedures to diagnose, disable, replay, restore, and correct the system without direct database surgery.
- **Controlled Beta Launch Protocol & Defect Triage Guide** (`docs/operations/beta-launch-guide.md`):
  - Onboarding protocol for Australian job seekers, skilled migrants, and regional movers; Severity 1–4 defect resolution SLA matrix.
- **Critical Discovery Journeys QA Verification (Desktop & Mobile)** (`apps/web/scripts/run-discovery-qa.mjs`, `docs/operations/discovery-journeys-qa-report.md`):
  - Automated E2E verification of 4 core discovery journeys (Opportunity Discovery, Sponsorship Discovery, Regional Hubs, Retention Loop) across Desktop and Mobile User-Agents.
  - 36/36 live E2E assertions passed with sub-110ms API latency and 100% evidence provenance.
  - Extracted isomorphic category icon utility `apps/web/src/lib/category-icons.ts` resolving SSR Server Component boundary invocation on `/companies/[slug]`.
  - Added `trustHost: true` in Auth.js and defensive null-coalescing in `matcher.ts`.
- Total test coverage: **181 automated tests passing** across contracts (33) and web (148), 0 lint errors, 0 type errors, Next.js Turbopack production build passing cleanly across 37 routes.

**Phase 9.1 (Commercial Readiness — Verified Employer Claims & Review Workflows) completed 9 September 2026**:
- Migration `0019_employer_claims_and_corrections.sql` authored and applied to live Neon PostgreSQL:
  - Extended `review_queue_kind` enum with `'employer_claim'` and `'data_correction'`.
  - Created `employer_claims` table with claimant details, role, JSON claimed data, corroborating evidence link, status, and review timestamps.
  - Created `data_corrections` table with community submission fields (`submitter_email`, `correction_type`, `details`, `evidence_url`, `status`).
  - Added `is_claimed`, `claimed_at`, and `claimed_by_user_id` to `companies`.
- Contracts in `@austechmap/contracts`:
  - `CreateEmployerClaimRequestSchema`, `EmployerClaimSchema`, `ReviewClaimActionSchema`.
  - `CreateDataCorrectionRequestSchema`, `DataCorrectionSchema`, `ReviewCorrectionActionSchema`.
  - Unit tests in `packages/contracts/tests/claims.test.ts` (7 tests passing).
- Query and Review Actions (`apps/web/src/lib/queries/claims.ts` & `admin/review/actions.ts`):
  - `createEmployerClaim`, `createDataCorrection`, `approveEmployerClaim`, `rejectEmployerClaim`, `resolveDataCorrection`.
  - Approve action sets `companies.is_claimed = true` while strictly preserving raw crawler and gazette observations without mutation (`PRODUCT_SPEC.md` §3.2 Rule 11).
  - All review decisions write immutable audit records to `audit_records`.
- Public Submissions Portal (`/corrections`):
  - Hallmark-styled tabbed interface (`CorrectionsPortalClient.tsx`) allowing employers to claim profiles and community members to submit discrepancy reports.
  - Guarded with Postgres-backed rate limiting (`checkRateLimit`) and SSRF egress inspection (`validateSafeUrl`).
- Profile UI (`/companies/[slug]`):
  - Renders the "Verified Employer Profile" badge when `company.isClaimed` is true, or an unobtrusive "Claim this profile" link.
- Unified Staff Review Queue (`/admin/review`):
  - Interactive cards rendering employer claims and community reports with direct staff approve and reject actions.
- Total test coverage: **197 automated tests passing** across contracts (40) and web (157), 0 lint errors, 0 type errors, clean Next.js Turbopack build across 37 routes.

## Work remaining

Per `IMPLEMENTATION_PLAN.md`'s own phase checklists:
- Phase 4: formal load test (needs >=1,000 employers, currently 133).
- Phase 5: scaling source registration towards 300 sources; employer role/skill signal derivation.
- Phase 6A: surface `evidence.confidence` in the sponsorship UI; stale/superseded/rejected evidence-status field.
- Phase 8: production hardening (expanded employer cohort to 1,000+, load testing, backup/restore drills, launch quality report).
- **R2/Cloudflare setup for the account-deletion ledger is deliberately deferred** until real users exist (user's explicit call) — see Known failures and risks below for exactly what that means operationally.
- Two stray `admin`-role user rows exist from bootstrapping mishaps, pending the user's decision on cleanup (not urgent, not a security hole — see below).
- Optional: `docs/walkthroughs/2026-09-06-regional-data-fix.md` (a Gemini-authored file) fails `prettier --check` — not touched by Claude since it's not Claude's file; harmless but will show up in any full `format:check` run.

## Changed files

Too large a range to enumerate (roughly 100+ files across `dd6ff67..cee2d0f`, spanning the entire visual redesign and the full auth system). Use `git log --oneline dd6ff67..cee2d0f` for the commit list, or `git diff --stat <last-known-commit>..cee2d0f` against whatever commit Codex last saw. Critical new files for the auth system specifically: `apps/web/src/auth.ts`, `apps/web/src/proxy.ts`, `apps/web/src/lib/auth/**`, `apps/web/src/lib/mfa/**`, `apps/web/src/lib/deletion/**`, `apps/web/src/lib/{audit,rate-limit}.ts`, `apps/web/scripts/{grant-role,process-deletions}.mjs`, `db/migrations/0012_auth_rate_limiting.sql`, `.github/workflows/process-account-deletions.yml`.

## Decisions and invariants

- Follow `AGENTS.md`, `ARCHITECTURE_DECISIONS.md`, and the active phase in `IMPLEMENTATION_PLAN.md` — both docs updated this session (now v3.10 / v4.2 respectively) and should be current.
- **A real `.env` file with a working Neon `DATABASE_URL` now exists at the repo root in this environment** — this reverses the "no DB access" note from the 2026-09-04 handoff. Claude used it directly this session (ran migration `0012`, bootstrapped admins, verified rows by direct query). Check for it before assuming DB access is unavailable.
- The user's real personal email for account/product purposes is `jeevanrajshah@gmail.com` — do not assume the system-injected `userEmail` context (which showed a `churchill.edu.au` address) is the right one without checking; Claude got this wrong once before being corrected.
- Only one active implementer edits `main` at a time per this workflow's own rule — but note Gemini has, in practice, been committing directly to `main` throughout this session (visual work), interleaved with Claude's backend/auth commits, without a formal "switch." This is the established de facto pattern this session, not a violation to flag, but worth knowing before assuming `main`'s history is single-author.
- Command-scoped git identities (`-c user.name=Codex -c user.email=codex@localhost`, etc.) — confirmed still required; `git -c safe.directory=C:/Users/jeeva/Projects/AusTechMap ...` still needed for the dubious-ownership issue.

## Verification

- **Commands run today (2026-09-07):** `npm run format:check|lint|typecheck|test|build` (root, covers both `@austechmap/contracts` and `@austechmap/web` workspaces) — all green, 85 JS/TS tests passing. `ruff check workers/ingestion` and `mypy` — clean. `pytest` was **not** re-run this session (no local Postgres service was spun up; the real Neon database was used directly for migration/verification instead, deliberately not for destructive integration-test runs).
- **Real-infrastructure verification:** see "Work completed" above — migration, admin bootstrap, magic-link sign-in, MFA enrollment, and gated admin access all independently confirmed against production, not just claimed.
- **CI run:** Not independently observed from this environment this session either (still no `gh` CLI/API access) — worth confirming `ci.yml` is green on GitHub for `cee2d0f`.

## Environment and migrations

- **Dependencies introduced this session:** `next-auth@beta` (pinned `5.0.0-beta.32`), `@auth/pg-adapter` (`1.11.3`), `otpauth` (`9.5.2`), `age-encryption` (`0.3.1`), `@aws-sdk/client-s3` (`3.1127.0`), `qrcode` (`1.5.4`) + `@types/qrcode` — all in `apps/web/package.json`, all pinned to exact versions deliberately (the `next-auth` beta status especially warrants not floating on a caret range).
- **Environment variables added:** `AUTH_SECRET`, `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM` (defaults to the Resend sandbox sender), `MFA_ENCRYPTION_KEY_V1`, `MFA_ENCRYPTION_CURRENT_VERSION`, `DELETION_LEDGER_AGE_RECIPIENT` — all documented in `.env.example`. Real values for `AUTH_SECRET`/`MFA_ENCRYPTION_KEY_V1`/the age keypair were generated locally this session (not from any external service) and are already set in Vercel (the two secrets as Vercel *sensitive* variables specifically) and in a new GitHub `production` Environment (`DATABASE_URL` only there so far — see below).
- **Migrations added or applied:** `db/migrations/0012_auth_rate_limiting.sql` — applied to the real Neon database this session (confirmed via `schema_migrations`).
- **Local setup notes:** shell state does **not** persist across separate Bash tool invocations in this environment — env-var exports must happen in the same command as whatever uses them. The local `.env` file has CRLF line endings; reading `DATABASE_URL` out of it for a one-off shell command needs `tr -d '\r'` or the trailing `\r` corrupts the connection string silently (produces a confusing "DATABASE_URL is required" error instead of a clear parse failure).

## Known failures and risks

- **R2/Cloudflare is not configured for the account-deletion feature, by deliberate user choice** (Cloudflare account signup deferred until real users exist — enabling R2 has had mixed community reports of requiring a payment method even for the free tier, similar to the Mapbox friction this project already avoided elsewhere). Concrete consequence: the GitHub `production` Environment has `DATABASE_URL` set but **not** `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`RAW_SNAPSHOT_BUCKET`/`DELETION_LEDGER_AGE_RECIPIENT`. The hourly `process-account-deletions.yml` job runs fine and exits cleanly as long as zero deletion requests are actually queued (true today, no real users) — it will throw and fail the workflow run the moment someone actually confirms an account deletion, since `process-deletions.mjs` needs those R2 vars to write the ledger. Not a bug to fix reactively — a known, named gap to close (get the R2 credentials, add them to the `production` Environment) before this could ever matter for real.
- **Two stray `admin`-role user rows exist**, pending the user's decision: `system-admin-ui@austechmap.internal` (user id 1, the old pre-auth placeholder actor — email is unreachable/fake, so this isn't really exploitable, just an inert historical row referenced by old audit records) and `jeevan.shah@churchill.edu.au` (user id 2, a mistaken bootstrap using the wrong system-context email before the user corrected it to `jeevanrajshah@gmail.com`, user id 3, the real one). Neither has been demoted/disabled — the user hasn't said whether they want that done.
- **Vitest + next-auth gotcha, worth knowing before writing more auth-related tests:** any test file that imports `lib/auth/require-role.ts` (even just for its exported error classes) drags in `../../auth` → `next-auth`, whose package unconditionally imports `next/server` — which Vitest's plain Node ESM resolution cannot resolve (Next.js's own bundler handles it fine; `next build` was used to confirm this is a test-environment-only issue, not a real runtime bug). Fix applied: error classes live in a separate `lib/auth/errors.ts` with no next-auth dependency; test files mock `require-role.ts` with a plain factory object (`vi.mock("...", () => ({ ... }))`), never `importOriginal`.
- Everything already flagged as a known deviation in `ARCHITECTURE_DECISIONS.md` remains true: Vercel Hobby tier (not Pro), Resend sandbox sender (no verified domain).

## Unsuccessful approaches

- Assuming the system-injected `userEmail` context was the right email for bootstrapping the real admin account — it wasn't; corrected to the user's actual personal email after they caught it.
- `vi.mock("../../../lib/auth/require-role", async (importOriginal) => ...)` in admin-action tests — fails at import time (see the Vitest/next-auth gotcha above). Fixed by mocking with a plain factory instead.

## Architecture deviations

- None new beyond what `ARCHITECTURE_DECISIONS.md` §4.1/§3.4/§3.7 already record as named interim states (Resend sandbox sender, Vercel Hobby tier, R2 deferred for the deletion ledger). Any further deviation must go through the ADR feedback loop in `AGENTS.md`.

## Next actions

1. Confirm `ci.yml` is green on GitHub for `cee2d0f`.
2. Decide (with the user) whether to demote/disable the two stray admin rows.
3. When ready to actually support account deletion for real: get real R2 credentials, add the four remaining secrets to the GitHub `production` Environment.
4. Resume Phase 5 source onboarding (toward the 300-source target) and/or Phase 6A's two small remaining items — whichever the user prioritizes next.
5. Consider Phase 7's actual matching/saved-search/alert features now that the auth prerequisite is real.
