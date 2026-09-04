# Deployment and staging

> Closes the remaining gap in IMPLEMENTATION_PLAN.md's Phase 1 exit gate: "a migration can be promoted through staging, web and worker deployments are repeatable." The mechanism here is built and ready; the account-level setup below can only be done by whoever owns the Neon/Vercel accounts (it needs real credentials no agent has access to).

## Staging database (Neon)

1. Create a Neon project if one doesn't exist yet (neon.tech), Postgres 17, with the `postgis` and `pg_trgm` extensions available (Neon supports both — confirm at creation time per `ARCHITECTURE_DECISIONS.md` §3.1).
2. Inside that project, create a **branch** named `staging`, separate from whatever branch backs local development. Neon's branching model is exactly why it was chosen (§3.1) — a staging branch is a real, isolated Postgres instance, not a shared schema inside the same database.
3. Copy that branch's connection string (the `postgresql://...` URL Neon gives you for it).
4. Add it as a GitHub Actions secret named `STAGING_DATABASE_URL`:
   - **Recommended:** Settings → Environments → New environment → name it `staging` → add `STAGING_DATABASE_URL` as an environment secret. This scopes the credential to only the one workflow that declares `environment: staging`, rather than exposing it to every workflow in the repository.
   - **Simpler alternative:** Settings → Secrets and variables → Actions → New repository secret, same name. Works, but is visible to any workflow in the repo, not just this one.
5. Run the **Promote staging** workflow manually: Actions tab → "Promote staging" → Run workflow. It applies `db/migrations/` to the staging branch using the same checksum-locked runner CI already uses (`workers/ingestion/src/austechmap_ingestion/db/migrations.py`) — the same mechanism, a different target database. A green run here is the actual proof this exit-gate criterion is met, not just that the code exists.

This workflow is deliberately **manual** (`workflow_dispatch`, not triggered on every push) — migrations are a deliberate action, not something that should fire unattended before the team trusts the process. Until `STAGING_DATABASE_URL` is configured, running it will fail with a clear "database URL is required" message; that's expected, and because it isn't wired to automatic triggers, it won't show up as a failing check on ordinary pushes or PRs.

## Web deployment (Vercel)

Connect the GitHub repository to Vercel directly (vercel.com → Add New → Project → import this repo) rather than hand-rolling a custom deploy workflow. Vercel's own GitHub integration is the "repeatable deployment" mechanism here: every PR gets an automatic preview deployment, every merge to `main` deploys to production, with zero custom CI code required. This matches the Vercel Pro decision already recorded in `ARCHITECTURE_DECISIONS.md` §3.4 — set the project to the Pro plan/team when connecting, not Hobby, per that ADR's reasoning (Hobby's terms are non-commercial-only).

Vercel auto-detects the Next.js app at `apps/web` in this monorepo; if it doesn't, set the project's root directory to `apps/web` explicitly in its dashboard settings.

## Worker deployment

Per `ARCHITECTURE_DECISIONS.md` §3.2, the ingestion worker's actual production runner (Railway, with a cron-enqueuer + always-on worker) is Phase 5 scope, gated behind Phase 5's freshness SLAs going live — there's no real ingestion work yet for it to run continuously against. What "repeatable" means at Phase 1's bar, and what's already true today:

- The worker builds, lints, type-checks, and passes its full test suite in CI on every push, against the same `postgis/postgis:17-3.5` image used for local development (`compose.yaml`) — the same environment, not a close approximation.
- Every worker operation is a scripted CLI command (`health`, `migrate`, `sample-import`), not a manual procedure — see `docs/development.md`.
- Extending this workflow file with a second job that deploys the worker to Railway once Phase 5 needs it to run continuously is a small addition when that time comes, not a redesign.

## What still can't be verified without real credentials

No agent in this workflow has Neon, Vercel, or Railway account access. The mechanism above is built and reviewed; running it end-to-end (steps 1-5 above, plus connecting Vercel) is a one-time setup step for whoever owns those accounts. Once done, re-running the "Promote staging" workflow and observing a green Vercel deployment are the actual, provable closes of this exit-gate criterion — not something to mark done from documentation alone.
