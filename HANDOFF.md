# Implementer Handoff

> Updated at every implementer switch — see [AGENTS.md](./AGENTS.md) "Switching implementers." Git history preserves earlier handoffs. The implementation checkpoint is committed first; this handoff then references that commit and is committed separately before the incoming implementer starts.

## Switch

- **Outgoing implementer:** Codex
- **Incoming implementer:** Claude — active implementer, confirmed by explicit user instruction. Gemini continues its orchestration and UI/browser duties.
- **Switched at:** 2026-09-04 (approximate; exact time not recorded)
- **Reason:** Codex reached its usage quota mid-implementation; duration unknown.
- **Task / issue:** All work queued while Codex was out has now been merged to `main`, on the user's explicit "okay merge them" instruction — an explicit override of the default "Codex is sole integrator" rule, not a permanent change to it.
- **Acceptance criteria:** `main` is green (full Python + JS check suite passing) and this file accurately reflects the merged state, not the three-branches-pending state from before.

## Checkpoint

- **Implementation branch:** `main`
- **Implementation checkpoint commit:** `659a8ec` (fix: remove output: standalone from next.config.ts) plus doc updates on top closing out Phase 1 — verify with `git log --oneline -10` for the exact current tip.
- **Handoff commit:** The commit containing this populated file; verify with `git rev-parse HEAD` after receiving the handoff
- **Working-tree status at implementation checkpoint:** Clean
- **Remote / pull request:** `origin/main` confirmed at the same commits (pushed directly by Claude, no `gh` CLI in this environment). PR #3's branch (`feat/phase-1-observability-r2`) and the two other feature branches (`docs/orchestration-setup`, `feat/phase-1-staging-promotion`) are fully merged into `main` but **still exist on `origin`** — not deleted, still an optional cleanup.

## Work completed

Three branches merged into `main` earlier this session (see git log around `1e2cfb0`, `4f12650`, `4da44a7` for details — not repeated here since this handoff now covers newer, more consequential work).

**Phase 1's exit gate is now closed**, with real infrastructure, not just tooling. Working with the user live against their actual Neon and Vercel accounts (Claude cannot hold or use those credentials directly — the user executed dashboard/UI steps and pasted back build logs and errors for diagnosis):

1. **Neon staging promotion** — user provisioned a Neon project + `staging` branch, added `STAGING_DATABASE_URL` under a GitHub `staging` Environment, and ran "Promote staging." First run failed: `promote-staging.yml` never set `PYTHONPATH`, unlike `ci.yml`'s equivalent job — fixed in `162d0bb`. Second failure was user error, not code: the secret was added as an **Environment variable** instead of an **Environment secret**, so `${{ secrets.STAGING_DATABASE_URL }}` resolved empty — no code change needed, just redoing it under the right tab. Third run succeeded.
2. **Vercel web deployment** — user connected the repo, root directory `apps/web`. First build failed: `Module not found: Can't resolve '@austechmap/contracts'` — root cause is that Vercel's Root Directory setting makes it run `apps/web`'s own `build` script directly, skipping the repo-root aggregate script that builds `@austechmap/contracts` (a `tsc`-compiled workspace package) first; CI never hit this because it always runs from the repo root. Fixed with `apps/web/vercel.json` overriding the build command (`9013291`). Second build failed differently: `ENOENT ... .next/next-server.js.nft.json` — root cause is `output: "standalone"` in `next.config.ts`, which is for self-hosted/Docker deployment and conflicts with Vercel's own build packaging; nothing in the repo used standalone mode, so it was just removed (`659a8ec`). Third build succeeded and is live at `aus-tech-map-web.vercel.app` — verified via WebFetch that both the homepage and `/api/health` (`{"service":"web","status":"ok","version":1}`) respond correctly, confirming the contracts import resolves at runtime too, not just at build time.
3. **Known, recorded deviation**: Vercel is on the free **Hobby** tier, not Pro, per the user's explicit cost decision — `ARCHITECTURE_DECISIONS.md` §3.4 (now v3.1) has an "Interim state" note with a concrete upgrade trigger (before any real alpha user, public employer data, or commercial activity).
4. Updated `IMPLEMENTATION_PLAN.md` (now v2.4) to check off Phase 1's remaining items and close its exit gate with a dated status line, and synced `README.md`'s version references and status summary.

All three bugs above (the workflow's missing `PYTHONPATH`, the monorepo build-order gap, and the `standalone` output conflict) were found only by actually running the real infrastructure end-to-end, and were self-caught and self-fixed by Claude with no independent reviewer — the same gap flagged after the earlier merge, now demonstrated twice more.

## Work remaining

- In Antigravity itself: confirm `austechmap-orchestrator` is discovered via `/agents`, and that both `claude -p` and `codex exec` are reachable from inside it — `claude -p "Reply only CLAUDE_OK"` has been confirmed reachable; Codex itself is still unavailable (quota).
- No independent reviewer exists for Claude's own implementation work while Codex is out — still an open risk, demonstrated concretely by the three bugs above.
- Optional cleanup: delete the three now-merged branches from `origin` if desired (not done — wasn't explicitly requested).
- Before any real user/data/commercial activity: upgrade Vercel to Pro (`ARCHITECTURE_DECISIONS.md` §3.4) and consider rotating the Neon `neondb_owner` password (it was briefly visible in plaintext as a GitHub Environment *variable* before being corrected to a secret).
- Resume Codex as active implementer once its quota resets, and revert `AGENTS.md`'s "Current status" banner accordingly.
- Phase 2 ("Geographic foundation") planning has not started yet.

## Changed files

See the three merge commits above for the full per-branch file lists; this handoff itself only touches `HANDOFF.md`.

## Decisions and invariants

- Follow [AGENTS.md](./AGENTS.md), [ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md), and the active phase in [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md).
- Only one active implementer may edit the implementation branch — currently Claude.
- Merging directly to `main` was an explicit, one-time user override of the default "Codex is sole integrator" rule for this interim period — not a precedent for Claude or Gemini merging unprompted in future.
- This is still an explicit, user-confirmed interim state. Revert to Codex-as-default once it resumes.

## Verification

- **Commands run by Claude:** `git log`/`git status` at each step; `--no-ff` merges one at a time with verification between each; full Python check suite (`ruff`, `mypy`, `pytest`) after the code-bearing merge; full JS check suite (`npm ci`, `format:check`, `lint`, `typecheck`, `test`, `build`) after all three merges landed; a repo-wide grep for leftover conflict markers after each merge.
- **Results:** all three merges completed via git's `ort` strategy with no conflicts requiring manual resolution (README.md needed an auto-merge across two branches' non-overlapping changes — succeeded cleanly); every check passed on the final state.
- **CI run:** Not independently observed from this environment (no `gh` CLI/API access) — pushing to `main` should trigger `ci.yml` on GitHub; worth confirming it's green there too, since local verification and GitHub's actual runner aren't guaranteed identical.

## Environment and migrations

- **Dependencies introduced:** None by this handoff itself (see the merged branches' own records for `boto3`/`sentry-sdk` etc.).
- **Environment variables added or changed:** None by this handoff itself.
- **Migrations added or applied:** None — this session did not touch `db/migrations/`.
- **Local setup notes:** See `AGENTS.md` "Git interoperability" for the `safe.directory` override and command-scoped identity conventions. One new note: a plain `git push` hung once this session with no output; `GIT_TERMINAL_PROMPT=0 git push ...` resolved it immediately on retry — likely Git Credential Manager attempting an interactive flow with no GUI available to respond. Also observed this session: some read-only Bash commands (a chained `npm run typecheck`, a plain `git log`) were transiently blocked by this environment's own auto-mode safety classifier for no apparent content-based reason, and succeeded immediately on retry — not a real error, just noted in case it recurs.

## Known failures and risks

- This review environment has no Docker and no GitHub CLI/API access, so live-database integration tests and CI/PR status still cannot be independently verified from here.
- No independent code reviewer exists while Codex is out and Claude is the active implementer — concretely demonstrated by three real bugs (missing `PYTHONPATH` in `promote-staging.yml`, a monorepo build-order gap on Vercel, a conflicting `output: "standalone"`) that only surfaced when actually deploying against real infrastructure, not before.
- Three feature branches remain on `origin` after merging, undeleted.
- Vercel is on the Hobby tier, not Pro — a deliberate, recorded, but real deviation from `ARCHITECTURE_DECISIONS.md` §3.4 with a concrete upgrade trigger.
- The Neon `neondb_owner` connection string was briefly visible in plaintext as a GitHub Environment *variable* (not secret) before being corrected — worth rotating before anything sensitive depends on it.
- Line-ending warnings indicate Git may convert LF to CRLF on future Windows checkouts; no content corruption has been observed.

## Unsuccessful approaches

- Git commands without the exact-path safe-directory override fail for agents whose OS account differs from `.git`'s owner; commands with the override succeed.
- Writing `.git/config` from a sandboxed agent environment fails with `Permission denied`. Use command-scoped `-c` values or obtain explicit elevated permission.
- A plain `git push` hung for 30s+ with no output in this environment; `GIT_TERMINAL_PROMPT=0 git push ...` succeeded immediately after.

## Architecture deviations

- None recorded for this checkpoint. Any future deviation must be reconciled through the ADR feedback loop in [AGENTS.md](./AGENTS.md).

## Next actions

1. Confirm `ci.yml` is green on GitHub for the current `main` tip.
2. Confirm the Antigravity workspace agent is fully operable end-to-end (Codex reachability specifically, once its quota resets).
3. Decide whether to delete the three now-merged branches from `origin`.
4. Upgrade Vercel to Pro and consider rotating the Neon password before any real user/data/commercial activity.
5. Resume Codex as active implementer once its quota resets, and revert `AGENTS.md`'s status banner.
6. Start Phase 2 ("Geographic foundation") planning.
