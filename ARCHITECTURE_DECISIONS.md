# Australia Tech Map — Architecture Decisions

> Satisfies [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) Phase 0: "Record architecture decisions for the database, map provider, storage, hosting, authentication, email, and analytics."
> This document is authoritative for technology choices — where it conflicts with [PRODUCT_SPEC.md](./PRODUCT_SPEC.md)'s recommendations, this document wins.
> Version 2.1 · 3 September 2026

## 1. Decision summary

| Layer | Decision | Why (one line) |
| :--- | :--- | :--- |
| Web framework | Next.js + TypeScript + React | SSR/SSG for SEO, matches spec, no change from original recommendation |
| Styling | Tailwind CSS | No controversy, no change |
| Database | **Neon** (Postgres + PostGIS) | Serverless Postgres, scales to zero, best free tier of the plain-Postgres options, no bundled auth/storage layer |
| Scheduled ingestion compute (alpha) | **GitHub Actions** scheduled workflows | CI/CD, manual imports, low-frequency government imports, and early crawling — free, zero setup |
| Scheduled ingestion compute (production) | **Railway**: short cron enqueuer + always-on worker | Graduates off GitHub Actions once freshness SLAs (Phase 5's 24h refresh gate) become a live product commitment; Fly.io's native scheduling is too limited for this role, Cloud Run Jobs is stronger but not worth a new GCP account for it |
| Raw snapshot storage | **Cloudflare R2** | S3-compatible, zero egress fees (snapshots get replayed/reprocessed repeatedly), generous free tier |
| Web hosting/deployment | **Vercel** (Pro from day one) | Zero-config Next.js feature support (ISR, image optimization, edge caching); Hobby's non-commercial terms don't fit even a private alpha here |
| Map | **Mapbox GL JS** | Best-in-class clustering/UX, free tier covers V1-scale traffic |
| Authentication | **NextAuth / Auth.js** | Runs inside the Next.js app, no separate service or vendor, works against plain Postgres |
| Email / notifications | **Resend** | Generous free tier, modern API, pairs with React Email for templates |
| Error tracking | **Sentry** | Free tier sufficient for V1 volume |
| Product analytics | **PostHog** | Free tier sufficient for V1 volume, self-hostable later if ever needed |
| Domain / DNS | **Spaceship** | Founder's choice; ~US$10–12/year |
| Search | Postgres FTS + `pg_trgm` | Runs inside Neon — not a separate service, no change from original recommendation |
| Scoring / event engine | Versioned SQL/Python, DB-backed scheduled derivation | GitHub Actions job during alpha; runs inside the Railway worker from Phase 5 onward |
| Browser crawling | Playwright, invoked from the same ingestion runner | GitHub Actions during alpha, the Railway worker from Phase 5 onward; only for sources requiring dynamic rendering |

## 2. Why this departs from the spec's original recommendation

PRODUCT_SPEC.md §4.2 suggested Supabase Postgres + Cloud Run Jobs/Scheduler + Cloudflare R2 as a starting point. Founder preference is to avoid a bundled BaaS service layer (auth/storage/realtime tied to one platform) and to minimize monthly cost pre-launch. This ADR keeps the parts of the original recommendation that were already unbundled (PostGIS, Postgres FTS, R2, Playwright-only-when-needed) and replaces the bundled/paid pieces with unbundled equivalents:

| Layer | Spec's suggestion | This decision | Reason for change |
| :--- | :--- | :--- | :--- |
| Database | Supabase Postgres | Neon | Plain Postgres, no bundled auth/storage/realtime billed together |
| Compute for workers | Cloud Run Jobs + Cloud Scheduler | GitHub Actions through alpha, then Railway | Cloud Run Jobs is operationally stronger out of the box, but not worth a new GCP account here; Railway plus a database-backed job system covers the same need |
| Authentication | Not specified — PRODUCT_SPEC.md named only Supabase Postgres, not Supabase Auth | NextAuth / Auth.js | Decouples auth from the database vendor entirely; IMPLEMENTATION_PLAN.md's Phase 0 checklist had named Supabase Auth as one illustrative example, corrected here |

## 3. Decisions in detail

### 3.1 Database — Neon (Postgres + PostGIS)

Serverless Postgres with autosuspend (scales to zero when idle, so the dev/staging databases cost nothing between work sessions) and a branching model that's useful for testing migrations against production-like data. Confirm `postgis` and `pg_trgm` extension availability as part of [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) Phase 1's "Provision local and managed PostgreSQL with PostGIS and `pg_trgm`" task — both have long-standing Neon support, but verify at provisioning time since extension lists do change.

This pairs directly with the G-NAF risk control already in the plan (Phase 2 / risk register: keep the 15.8M-row G-NAF reference data in an offline batch pipeline, only write resolved coordinates + ASGS keys to the primary database). That's what keeps Neon's free/low tier viable here — the primary database never has to hold the full national address file.

**Reconsider if:** sustained compute or storage pushes past Neon's free tier and the paid tier's cost stops being trivial relative to a traditional managed Postgres (Cloud SQL / RDS) — re-evaluate at the Phase 8 launch-dataset milestone once real query volume exists.

### 3.2 Scheduled ingestion compute — GitHub Actions through alpha, then a Railway worker

Every Python workload in the V1 architecture is periodic, not a persistent service: government importers (monthly/quarterly), ATS/careers crawlers (6–24h or daily per the freshness schedule), event derivation, and notification dispatch. Through Phase 0–4 and the private alpha (CI/CD, manual imports, low-frequency government imports, early scheduled crawling), GitHub Actions' scheduled workflows (`on: schedule`) cover this for free, with no separate service to run.

Before any freshness guarantee or public alert becomes a live product commitment — in practice, before Phase 5's ">95% of monitored sources checked within SLA" and "24h active-job refresh" gates go live — move production ingestion to **Railway**. GitHub Actions has two limits that stop being acceptable once freshness is a real commitment rather than a development convenience: scheduled workflows can be delayed under platform load with no SLA, and GitHub auto-disables scheduled workflows on a repository after 60 days of inactivity.

The production pattern on Railway:

- A short Railway cron task that only enqueues due work — idempotent and fast, so a delayed or skipped run never causes duplicate or missed enqueues.
- An always-on Railway worker that claims jobs from a Postgres-backed job table, processes them, and reports back.
- Leases, heartbeats, exponential retries, dead-letter status, and a reconciliation pass on that job table.

Railway over Fly.io for this role: Fly.io's native scheduled Machines are approximate and limited to hourly/daily/weekly/monthly cycles, and its more robust Cron Manager needs additional infrastructure to run. Railway supports conventional cron expressions plus persistent workers directly, fitting the enqueue/claim pattern above with fewer moving parts. Cloud Run Jobs would be operationally stronger still — native job-execution tracking, cancellation, logging, IAM, and scheduler integration — but that means standing up a new GCP account solely for this, which isn't worth it at this scale; Railway plus the database-backed job system above is sufficient. Railway's own caveat — cron executions can be delayed by a few minutes, and it skips a scheduled run if the previous one is still running — is irrelevant here specifically because the cron task's only job is a fast, idempotent enqueue, never the crawl itself.

Track every ingestion run in that same database-backed job table (part of Phase 1's "sources, snapshots, import runs" migration). That table, not the choice of runner, is what actually delivers reliability.

**Reconsider if:** enqueued work needs to exceed what a single Railway worker can process in a reasonable window, or queue depth consistently outpaces worker throughput — both point toward horizontally scaling the worker before reaching for anything more exotic.

### 3.3 Raw snapshot storage — Cloudflare R2

S3-compatible object storage for the immutable raw snapshot policy already defined in PRODUCT_SPEC.md §7.4. R2's free tier (10 GB storage, no egress fees ever) matters specifically here because snapshots get replayed for parser debugging and reprocessing — an S3-equivalent that billed egress would make replay-heavy debugging expensive.

**Reconsider if:** never, realistically, unless Cloudflare's terms or reliability become a problem — this is the lowest-risk decision in the stack since it's a pure storage primitive with no lock-in beyond the S3 API itself.

### 3.4 Web hosting/deployment — Vercel

Use Pro (~US$20/month) from Phase 0, not just from public launch. Vercel's Hobby tier is restricted to personal, non-commercial use — a private alpha of a company with a monetisation roadmap doesn't qualify even before it's public, so deferring Pro to launch was wrong in the earlier cost estimate. For an SEO-first, SSR-heavy product (map/search/employer/region pages), Vercel's zero-config ISR, image optimization, and edge caching are worth the fee relative to the developer time cost of replicating them elsewhere.

**Reconsider if:** cost sensitivity is tight enough to justify hand-rolling image optimization and caching — Railway or Fly.io can run Next.js as a plain Node service for less, at the cost of owning that configuration yourself. Flagging this as the one deliberately-not-cheapest choice in the stack, made on a time-vs-money trade-off rather than a technical constraint.

### 3.5 Map — Mapbox GL JS

Confirmed per founder decision. Free tier (~50,000 map loads/month) should cover V1 traffic; monitor usage from first public launch since this is the one usage-metered layer most exposed to organic traffic spikes.

**Reconsider if:** map loads approach the free tier ceiling — MapLibre GL (API-compatible fork) plus a free/self-hosted tile source (Protomaps, MapTiler free tier) is the documented fallback, and because MapLibre shares Mapbox's GL JS API surface, the migration cost is real but bounded (mostly style/tile-source config, not application logic).

### 3.6 Authentication — NextAuth / Auth.js

Runs inside the Next.js app itself against the Postgres database (via an adapter) — no separate service, no separate bill, no vendor dependency beyond an open-source library. This matches V1's "accounts are lightweight utility, not a gate" principle (PRODUCT_SPEC.md §3.2) — auth only needs to support saved searches and watchlists, not a complex identity system.

**Reconsider if:** a future requirement needs enterprise SSO, SCIM provisioning, or heavy fraud/bot protection on sign-up — that's the point where a dedicated provider like Clerk or WorkOS earns its cost.

### 3.7 Email / notifications — Resend

Free tier (3,000 emails/month, 100/day) should comfortably cover V1 alert volume once dedup, digests, and delivery caps (already specified in PRODUCT_SPEC.md Appendix D.3) are in place. Pairs naturally with React Email for building alert/digest templates in the same codebase and language as the app.

**Reconsider if:** volume outgrows the free tier or deliverability at scale becomes a concern — Amazon SES is the standard cost-efficient fallback at higher volume, at the cost of more setup (domain verification, sandbox-mode removal).

### 3.8 Error tracking — Sentry

Free Developer tier (5,000 errors/month) is enough for V1 across both the Next.js app and the Python workers; Sentry supports both natively.

### 3.9 Product analytics — PostHog

Free tier (1M events/month) covers V1; self-hostable later if the "no bundled vendor" preference ever extends to analytics.

## 4. Estimated monthly cost

| Stage | Estimated cost | Notes |
| :--- | :--- | :--- |
| Phase 0–4 / private alpha | ~US$20/month | Vercel Pro from day one (§3.4); everything else sits inside its free tier at build-time usage levels |
| Phase 5 onward (production-grade freshness) | ~US$25–35/month | Adds a small Railway bill (cron enqueuer + always-on worker) once ingestion moves off GitHub Actions |
| Phase 8+ (public launch) | ~US$25–55/month | Same components, scaling gradually with usage; Neon/Mapbox/Resend stay near $0 until traffic or data volume crosses their free-tier ceilings |

Plus the domain itself: ~US$10–12/year at Spaceship, independent of build/launch stage.

Verify current pricing/limits for each provider at signup — free-tier terms shift, and these figures are estimates, not quotes.

## 5. Open items this doesn't resolve

Phase 0 isn't complete while these remain open — tracked as explicit action items in IMPLEMENTATION_PLAN.md's Phase 0 checklist:

- Exact p95 latency SLOs and the relevance-acceptance method for golden queries.
- Authentication roles, admin MFA enforcement, and the account-deletion procedure.
- Production job scheduling detail: retry policy, lease/heartbeat model, and failure-recovery procedure for the import-run table.
- G-NAF storage, indexing, update cadence, and batch-processing procedure in enough detail to build against.
- Database backup, restore, and retention policy, and its expected storage cost.
