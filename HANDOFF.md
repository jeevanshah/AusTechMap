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
- **Implementation checkpoint commit:** `cee2d0f` (docs: record real-infrastructure verification of the auth system) — verify with `git log --oneline -20` for the exact current tip; expect commits authored by both `Claude <claude@localhost>` and `Gemini <gemini@localhost>` interleaved, both working directly on `main` in this same local checkout this whole session (no separate worktrees/branches were used).
- **Handoff commit:** The commit containing this populated file; verify with `git rev-parse HEAD`.
- **Working-tree status at checkpoint:** Clean.
- **Remote:** `origin/main` confirmed at the same commit (pushed directly, no `gh` CLI in this environment — confirmed absent again this session).

## Work completed

Everything since the 2026-09-04 handoff (that file was never updated in the interim — treat it as fully superseded):

**Phases 2–6A (backend), by both Gemini and Claude, closed/near-closed with real verified data** — see `IMPLEMENTATION_PLAN.md` (now v4.2) for the authoritative per-phase status; summary:
- Phase 2 (geography): closed 2026-09-05. Real ABS/G-NAF/Home Affairs data imported by Gemini; the §4.3 G-NAF upgrade trigger applied by Claude via reviewed functions (`geography/gnaf_upgrade.py`), never ad hoc SQL.
- Phase 3 (employer identity): closed 2026-09-05. 133 real seeded companies, 100% provenance/location coverage.
- Phase 4 (map/search/profiles): partially met exit gate — live and working; formal load-testing and most golden-query checks remain open, blocked on data scale not effort.
- Phase 5 (hiring intelligence): not closed but real — 10 real ATS sources, 92 real jobs, SSRF-safe fetch (`fetch_safety.py`, 18 tests).
- Phase 6A (sponsorship evidence): essentially done — real Home Affairs labour-agreement import (6,113 records), job-description keyword classifier, `/admin/review` `sponsorship_match` handling, `?sponsorship=` filter. Two small items open (see Work remaining).
- Phase 4's "regional status" gap (was fully blocked pending Phase 2) is now real too: a `?regional=` filter, `isRegional` field, and `GET /api/regions` endpoint were built by Claude (`27ba899`), reusing `resolved_locations.migration_category`.

**Design system + visual redesign, almost entirely Gemini** (~20 commits, `dd6ff67` through `c001578` and beyond) — the "National Registry" design system (`DESIGN.md`), then a full visual pass (Pacific Cobalt color system, regional hub cards, live telemetry, brand assets, cartography motifs). **One real incident worth knowing about**: an early draft of the regional-hub UI shipped with a hardcoded, partly-fabricated hub list (invented per-city counts, a wrong "regional = not Sydney/Melbourne" heuristic that mislabeled state capitals). Caught and flagged by Claude before it reached users; Gemini fixed it for real the same day (`08b2fec`) — wired to the actual `/api/regions` endpoint and `isRegional` field. Also: two copies of a stale "this page has no access control" banner text survived one cleanup pass and had to be caught and removed in a second pass (`660e6b1`) — if you spot any other leftover "unauthenticated/no access control/placeholder actor" text anywhere in `apps/web/src/app/admin/**`, it's stale, not real.

**The full authentication/authorization system (ARCHITECTURE_DECISIONS.md §4.1), built and verified by Claude, `844e315`–`cee2d0f`:**
- Auth.js v5 (`next-auth@beta`, pinned exact) + `@auth/pg-adapter` against the Phase 1 schema (migration `0002` already matched the adapter's expected shape — verified column-by-column against the installed package's actual source).
- Database sessions with a role-aware expiry wrapper (`lib/auth/adapter.ts`) — 30 days for `user`, 8 hours for `reviewer`/`admin` — since Auth.js only supports one global `maxAge`.
- Resend magic-link sign-in (10-minute link expiry), sandbox sender (`onboarding@resend.dev`) — real account signed up, but no verified domain yet.
- `lib/auth/require-role.ts`: `requireUser`/`requireRole`/`requireStaffSession`/`requireFreshMfa`, called independently from every `/admin/*` page/layout and every mutating server action. `proxy.ts` (Next.js 16 renamed `middleware.ts` → `proxy.ts` — verified against the vendored docs, not training data) is a thin, non-authoritative redirect only.
- Staff TOTP MFA (`otpauth`, RFC 6238, unit-tested against the RFC's own published vectors): enrollment (now with a real rendered QR code via `qrcode`, added after the first live test showed text-only manual entry was a real usability gap), verification, recovery codes, rate limiting, AES-256-GCM-encrypted secrets under a versioned Vercel *sensitive* env var.
- Atomic Postgres-backed rate limiting (migration `0012`) for magic links and MFA attempts.
- A consolidated audit module (`lib/audit.ts`) replacing two previously-diverging `audit_records` writers.
- `ensureSystemActor`'s placeholder-actor code path is gone entirely (`lib/actors.ts` deleted) — every admin mutation now attributes to the real signed-in user.
- The full 5-step account-deletion lifecycle, including an extensible erasure-hook registry, an `age`-encrypted R2 restore-suppression ledger, and an hourly GitHub Actions job — built but **the R2/Cloudflare half is deliberately unconfigured** (see Known failures and risks).
- `scripts/grant-role.mjs`: the first-admin bootstrap CLI.

**Verified against real production infrastructure the same day** (not just unit tests): migration `0012` applied to the real Neon database; the first two admins bootstrapped and confirmed by direct query; a real Resend magic-link email sent, clicked, and correctly created a real session; real MFA enrollment completed with an actual Microsoft Authenticator TOTP code via a real QR code; `/admin/companies` and `/admin/geography` confirmed live, gated, with real data.

## Work remaining

Per `IMPLEMENTATION_PLAN.md`'s own phase checklists (don't duplicate the detail here, just the pointers):
- Phase 4: golden-query validation (21 of 25 still untestable — blocked on Phase 5/6 data), formal load test (needs ≥1,000 employers, currently 133).
- Phase 5: nowhere near the 300-source target (10 registered); no replay/quarantine/adaptive-schedule tooling; no `employer_role_signals`/`employer_skill_signals` derivation job yet.
- Phase 6A: two small items — surface `evidence.confidence` in the sponsorship UI (stored, not displayed); no stale/superseded/rejected evidence-status field.
- Phase 6B (regional scoring): not started at all — explicitly out of the alpha/beta checkpoint's scope.
- Phase 7: only the auth *prerequisite* got pulled forward and built. The actual Opportunity Match engine, saved searches/watchlists, and alerts/notifications are all still 0%. Note: `lib/deletion/erasure.ts::registerErasureHook` is the extension point saved-searches/watchlists must register against once built, so account deletion actually erases that data.
- Phase 8: mostly untouched — admin-route MFA protection is done as a side effect of the auth work; threat modelling, load suites, backup/restore drill, launch docs are not.
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
