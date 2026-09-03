# Australia Tech Map — Architecture Decisions

> Satisfies [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) Phase 0: "Record architecture decisions for the database, map provider, storage, hosting, authentication, email, and analytics."
> This document is authoritative for technology choices — where it conflicts with [PRODUCT_SPEC.md](./PRODUCT_SPEC.md)'s recommendations, this document wins.
> Version 3.0 · 4 September 2026

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

This pairs directly with the G-NAF risk control already in the plan (Phase 2 / risk register: keep the national-scale G-NAF reference data in an offline batch pipeline, only write resolved coordinates + ASGS keys to the primary database). That's what keeps Neon's free/low tier viable here — the primary database never has to hold the full national address file.

Use Neon's Free plan only through development/private alpha while §4.4's alpha recovery targets remain sufficient. Upgrade to Neon Launch before private beta so the required seven-day restore window is active and restore-tested before beta data is accepted. Independently reconsider the provider if sustained compute, history, or storage makes Neon's paid cost non-trivial relative to a traditional managed Postgres (Cloud SQL / RDS); perform that comparison again at the Phase 8 launch-dataset milestone using measured load.

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

The normative database-session, role, staff-MFA, recovery, and account-deletion contract is in §4.1.

**Reconsider if:** a future requirement needs enterprise SSO, SCIM provisioning, or heavy fraud/bot protection on sign-up — that's the point where a dedicated provider like Clerk or WorkOS earns its cost.

### 3.7 Email / notifications — Resend

Free tier (3,000 emails/month, 100/day) should comfortably cover V1 alert volume once dedup, digests, and delivery caps (already specified in PRODUCT_SPEC.md Appendix D.3) are in place. Pairs naturally with React Email for building alert/digest templates in the same codebase and language as the app.

**Reconsider if:** volume outgrows the free tier or deliverability at scale becomes a concern — Amazon SES is the standard cost-efficient fallback at higher volume, at the cost of more setup (domain verification, sandbox-mode removal).

### 3.8 Error tracking — Sentry

Free Developer tier (5,000 errors/month) is enough for V1 across both the Next.js app and the Python workers; Sentry supports both natively.

### 3.9 Product analytics — PostHog

Free tier (1M events/month) covers V1; self-hostable later if the "no bundled vendor" preference ever extends to analytics.

## 4. Phase 0 operational contracts

The contracts in this section are normative for implementation. Numbers are initial defaults, stored
in configuration where appropriate and changed only through a reviewed migration or documented
operational change.

### 4.1 Authentication, authorisation, MFA, and deletion

**Sign-in and sessions**

- Use Auth.js with the Postgres adapter and database sessions, not JWT sessions. The browser cookie
  contains only an opaque, `HttpOnly`, `Secure`, `SameSite=Lax` session token; server-side session
  deletion must support immediate revocation and "sign out everywhere."
- V1's public sign-in method is a one-use Resend email magic link that expires after 10 minutes.
  Return the same response whether an account exists, and rate-limit requests per normalised email
  and IP. OAuth may be added later without changing the user or session model; passwords are out of
  scope.
- Normal user sessions expire after 30 days and rotate at least daily. Reviewer/admin sessions expire
  after 8 hours. Role and account status are read from the database on every protected server request;
  client-visible session fields are display hints, never an authorisation boundary.

**Roles and enforcement**

| Role | Permissions |
| :--- | :--- |
| `user` | Manage only the user's own profile, saved searches, watches, notification preferences, and deletion request. |
| `reviewer` | `user` permissions plus review/approve/reject data-quality candidates and corrections; cannot manage roles, secrets, source policy, destructive merges, or system configuration. |
| `admin` | `reviewer` permissions plus employer merges, source disable/re-enable, importer replay, role administration, and operational configuration. |

- New accounts always receive `user`. There is no public staff-role request or self-promotion path.
  Until a second administrator exists, staff roles are granted/revoked through an audited operator CLI
  or migration. Every role change records actor, subject, old/new role, reason, and timestamp.
- Enforce authorisation in server actions/route handlers and again in the domain/service operation.
  Protect both `/admin` pages and their APIs; hiding navigation is not access control. Return `401` for
  no valid session and `403` for insufficient role.
- Destructive merges, source disablement, role changes, and importer replay require `admin` plus an
  MFA assertion no older than 15 minutes; all staff mutations write an immutable audit record.

**Staff MFA**

- MFA is mandatory for both `reviewer` and `admin` before any staff route or API is usable. Use
  RFC 6238 TOTP initially: 30-second period, six digits, SHA-1 for authenticator compatibility, one
  adjacent time step permitted, and successful time steps cannot be replayed.
- Encrypt each TOTP seed with AES-256-GCM using a versioned key held in Vercel secret management,
  never in Postgres or logs. Generate ten single-use 128-bit recovery codes and store only keyed
  SHA-256 digests under a separate secret. Regeneration invalidates all previous codes.
- TOTP/recovery attempts are limited to five per account and IP per 15 minutes, followed by a
  15-minute lock. Staff sessions carry a server-side `mfa_verified_at`; staff access requires it to be
  within the eight-hour session, while destructive operations prompt again after 15 minutes. It is
  invalidated immediately after a role, email, MFA, or recovery-code change.
- Lost-factor recovery is manual during the single-founder stage: verify control of the login email
  plus an operator-held recovery procedure, revoke every session, reset MFA, and audit the event. Do
  not implement security questions or email-only MFA bypass.

**Account deletion**

1. An authenticated user starts deletion and confirms with a fresh magic link. Staff accounts must
   first be demoted by another administrator; the last administrator cannot delete itself.
2. Immediately disable the account, revoke all sessions/verification tokens, and suppress queued
   notifications. Complete the deletion job within 24 hours with an idempotency key.
3. Delete Auth.js accounts and user-owned saved searches, watches, preferences, and undelivered
   notifications. Remove or irreversibly de-identify user identifiers in delivery/product analytics;
   retain only aggregate counts and a non-identifying audit event containing request ID, timestamps,
   outcome, and policy version.
4. Write an encrypted restore-suppression record outside the database containing the deletion request
   ID, user ID, and keyed digest of the normalised email. Retain it for 40 days so any backup restore
   can replay deletions, then destroy it.
5. Personal data in encrypted backups is beyond normal application access and expires within 35
   days. Every restore must replay the external deletion ledger before reopening traffic.

This is a technical baseline, not a claim that the business is necessarily an APP entity. It follows
the OAIC APP 11 principle of destroying or de-identifying personal information when no longer needed
and documenting reasonable technical and organisational steps.

### 4.2 Import-run scheduling and failure recovery

Execution is **at least once**. Exactly-once business effects come from idempotency keys, unique
constraints, fencing tokens, and transactional upserts—not from assuming a scheduler runs once.
GitHub Actions uses this contract during alpha; Railway's enqueuer and worker use the same tables from
Phase 5.

**Required records**

- `import_runs`: UUID, `run_type`, optional `source_id`, versioned JSON payload, priority,
  `idempotency_key`, status, `scheduled_for`, `available_at`, `attempt_count`, `max_attempts`,
  `lease_owner`, `lease_token`, `lease_expires_at`, `heartbeat_at`, first/last timestamps, cancellation
  fields, terminal error summary, and created/updated timestamps. Uniqueness is
  `(run_type, idempotency_key)`.
- `import_run_attempts`: immutable row per claim with attempt number, worker ID, lease token,
  started/heartbeat/finished timestamps, outcome, retry classification, structured error fields,
  metrics, and log correlation ID.
- Allowed run states are `queued`, `running`, `retry_wait`, `succeeded`, `dead_letter`, and
  `cancelled`. State transitions are validated in one repository function and covered by table-driven
  tests.

**Enqueue and claim**

- The enqueuer runs every five minutes, computes every due logical run, and inserts with
  `ON CONFLICT DO NOTHING`. It performs no crawl/import work and must finish within two minutes.
- A worker claims one eligible `queued`/`retry_wait` row in a short transaction using
  `FOR UPDATE SKIP LOCKED`, increments `attempt_count`, creates the attempt row, assigns a random
  fencing `lease_token`, and sets a 10-minute lease. No network or parsing work occurs while the
  claim transaction is open.
- The worker heartbeats every 60 seconds and extends the lease to 10 minutes from heartbeat time.
  Every checkpoint, canonical write, and completion update must match run ID, worker ID, and current
  lease token. A stale worker that lost its lease may upload a content-addressed raw object but cannot
  commit database effects or mark the run complete.

**Retries and terminal failure**

- Default `max_attempts` is six total attempts. Retry delays after attempts 1–5 are 1 minute,
  5 minutes, 30 minutes, 2 hours, and 6 hours, each with ±20% jitter. A valid `Retry-After` may extend
  (never shorten) the delay up to 24 hours. Job-type configuration may reduce attempts but cannot
  create infinite retries.
- Retry network timeouts, connection resets, 408/425/429, 5xx responses, database serialization or
  connection failures, and unexpected worker termination. Do not retry policy/licence disablement,
  unsupported content type, deterministic validation errors, or other 4xx responses except the
  explicit transient codes. Parser/schema drift gets one retry from a fresh snapshot, then
  `dead_letter` plus quarantine.
- Each network operation has an explicit timeout below the lease window; each run type has a hard
  wall-clock limit. Hitting the hard limit is a retryable failure until attempts are exhausted.
- The reconciler runs every minute. It requeues expired leases using the retry schedule or moves them
  to `dead_letter` when attempts are exhausted; finalises orphan attempt rows; finds due work the
  enqueuer missed; and alerts on dead letters, repeated source failure, or queue age beyond the source
  freshness SLA.
- Operators may replay a dead-letter run only with a reason. Replay creates a new run linked to the
  original and normally reuses its idempotency key/business keys, so already-committed effects remain
  harmless. Never change `attempt_count` or erase failure history to make a replay look clean.

### 4.3 G-NAF offline processing

The full national address file does not enter Neon. It is a versioned offline reference used only for
batch geocoding the comparatively small set of employer addresses.

**Storage and release lifecycle**

- Acquire the official open-data PSV archive from data.gov.au. Record source URL, licence version,
  release identifier/effective date, byte size, SHA-256, retrieval timestamp, and importer version
  before extraction; reject a checksum or schema mismatch.
- Store the compressed archive privately in R2 Standard under
  `raw/gnaf/{release_id}/{sha256}/...`, subject to the recorded licence. Keep the current and previous
  releases; expire any release older than the immediately previous one 90 days after it was
  superseded. At current R2 pricing, storage above the shared 10 GB-month free allowance is budgeted
  at US$0.015/GB-month.
- Extract and build a release-specific DuckDB database on an encrypted local/ephemeral worker volume.
  Preflight free space of at least the larger of 50 GB or four times the compressed archive size.
  The processed DuckDB file is reproducible and is not uploaded or backed up.
- Check for a new official release monthly (G-NAF is expected quarterly). Never update the active
  release in place: download, validate, build, regress, then atomically change the active release
  pointer. Retain the prior processed release locally for 90 days where disk permits.

**Offline index and match contract**

- Load only the relational tables required to compose addresses and select the default geocode:
  address detail, street locality, locality, state, address alias/secondary relationships, default
  geocode, and their authority-code tables. Preserve `address_detail_pid`, geocode type/reliability,
  source CRS, and release ID.
- Materialise a canonical Australian match key from normalised unit/level, street number and suffix,
  street name/type/suffix, locality, state, and postcode. Index `address_detail_pid`, the complete
  canonical key, `(postcode, locality)`, and the street/locality components. Normalisation rules and
  abbreviation tables are versioned fixtures, not ad-hoc string edits.
- Process immutable batches of at most 10,000 input addresses. Each row carries input ID, raw-address
  hash, normaliser version, G-NAF release, and prior match state, making restart and replay safe.
- Auto-accept only a unique exact canonical-key match during the initial Phase 2 implementation.
  Ambiguous exact matches, component/fuzzy matches, locality-only geocodes, and coordinates failing
  Australian bounds go to review. Automated fuzzy acceptance requires a labelled accuracy set and a
  separately reviewed threshold/margin version.
- Output candidate PID, score/components, match method, longitude/latitude, geocode type/reliability,
  and release ID. Transform coordinates to EPSG:4326 explicitly when necessary and reject unknown
  CRS. Only accepted employer result, provenance, and match metadata enter Neon; no national address
  rows do.

Activation requires schema/count checks, duplicate-PID checks, coordinate bounds, state-level count
deltas, exact-match regression fixtures, and a sample comparison against the previous release. A
failed gate leaves the prior release active and creates a failed auditable import run.

### 4.4 Database backup, restore, and retention

**Environments and recovery targets**

| Environment/stage | Protection | RPO | RTO |
| :--- | :--- | :--- | :--- |
| Local/development | Rebuild from migrations and approved fixtures; no personal production data. | Not applicable | 1 working day |
| Staging | Isolated Neon project/branch, disposable except test evidence; refresh only with de-identified or synthetic data. | 24 hours | 4 hours |
| Private alpha | Neon's available restore window plus nightly encrypted logical backup. | 24 hours | 4 hours |
| Private beta and production | Neon Launch or higher with a configured 7-day restore window, plus nightly encrypted logical backup. | 5 minutes | 2 hours |

**Backup policy**

- At 02:00 UTC daily, run `pg_dump` in custom format with schema, data, ownership-neutral restore
  options, and a manifest containing Postgres version, migration version, row counts, checksum, and
  backup job ID. Encrypt before upload with an operator-controlled `age` public key; keep the private
  recovery key outside Vercel, Neon, R2, and the repository.
- Store backups in private R2 Standard with bucket public access disabled and least-privilege service
  credentials. Retain each nightly backup for 35 days. Create an additional named Neon snapshot before
  a destructive/high-risk migration and retain it for seven days or until release verification,
  whichever is later.
- A backup job is not successful until upload, checksum verification, and manifest write complete.
  Alert after one missed backup and page/escalate after two consecutive misses.
- Run an automated manifest/checksum verification weekly. Quarterly—and before public launch—restore
  the latest logical backup into an isolated database, run migrations/constraints/smoke queries,
  replay the external deletion ledger, record achieved RPO/RTO, and destroy the drill environment.
- Restoration is create-and-verify first: restore to a new branch/database, verify integrity and
  deletion replay, place writes in maintenance mode, switch the connection, smoke test, then reopen.
  Keep the replaced branch for 24 hours when safe, then remove it.

The private-alpha backup is expected to remain inside R2's shared 10 GB-month free allowance; beyond
that, Standard storage is currently US$0.015/GB-month with free egress. Moving to Neon Launch for the
7-day restore window adds usage-based database cost (Neon currently illustrates roughly US$15/month
for an intermittent 1 GB workload) plus history storage based on changed data. Budget alerts fire at
US$5 and US$15 above the expected monthly baseline.

### 4.5 Performance and relevance SLOs

**Server/API budgets** (staging and production, excluding client network time)

| Surface | p95 target | p99 ceiling | Additional invariant |
| :--- | :--- | :--- | :--- |
| Warm map viewport/cluster API | <= 300 ms | <= 750 ms | Compressed response <= 250 KB; never return the full employer dataset. |
| Uncached map viewport/cluster API | <= 750 ms | <= 1.5 s | Query is bounding-box/index backed and capped by zoom-level policy. |
| Search/autocomplete API | <= 500 ms | <= 1.0 s | Maximum 20 results; hard filters applied in SQL, not after pagination. |
| Employer/region detail API | <= 500 ms | <= 1.0 s | Evidence and freshness fetched without per-row query loops. |

Measure each endpoint after a five-minute warm-up for 10 minutes at 20 concurrent virtual users,
using a frozen launch-like fixture of at least 1,000 employers, dense metro points, jobs/evidence, and
a 90/10 representative/common-to-cold query mix. Record commit, database statistics, cache state,
region, tool version, throughput, error rate, and payload percentiles. The gate requires <0.5% server
errors and every p95/p99/invariant above to pass in three consecutive runs.

**Browser/network budgets**

- Desktop broadband: p95 initial map usable <= 2.5 seconds and search submission to stable results
  <= 1.0 second.
- Fast-4G mobile emulation (1.6 Mbps down, 750 Kbps up, 150 ms RTT, 4x CPU slowdown): p95 initial map
  usable <= 4.0 seconds and search submission to stable results <= 2.0 seconds.
- In field data, also target Core Web Vitals at p75: LCP <= 2.5 seconds, INP <= 200 ms, and CLS <= 0.1.
  Core Web Vitals use p75 by definition; they do not replace the explicit p95 product gates above.

Run browser gates on the critical desktop and mobile journeys at least 20 times per profile after a
warm-up, with cold browser cache for initial-load measurements. Alert in production when an API p95
breaches its target for three consecutive five-minute windows with at least 100 requests total; use a
30-minute window at lower traffic.

Relevance is evaluated by [the 25 golden queries](./docs/golden-queries.md). The release gate is
`nDCG@10 >= 0.80` overall and per major slice, grade-3 top-three success >= 85%, grade-2-or-3 top-ten
success >= 95%, and zero hard-constraint or unsupported sponsorship violations. The golden-query
document defines regression thresholds, empty-state requirements, judgement ownership, and recorded
test metadata.

## 5. Estimated monthly cost

| Stage | Estimated cost | Notes |
| :--- | :--- | :--- |
| Phase 0–4 / private alpha | ~US$20–25/month | Vercel Pro from day one (§3.4); Neon Free plus nightly encrypted R2 backups while data fits the alpha recovery target; modest R2 overage/operations allowance |
| Private beta / Phase 5 freshness | ~US$40–55/month | Adds Neon Launch for 7-day restore history and Railway's cron enqueuer + always-on worker; actual Neon compute/history is usage-based |
| Phase 8+ / public launch | ~US$40–75/month | Same components with storage, restore history, Mapbox, and email usage scaling gradually; excludes unusual traffic spikes |

Plus the domain itself: ~US$10–12/year at Spaceship, independent of build/launch stage.

Verify current pricing/limits for each provider at signup — free-tier terms shift, and these figures are estimates, not quotes.

## 6. Phase 0 status and external basis

Section 4 resolves the five previously open operational decisions. Together with the product/data
contracts already present in PRODUCT_SPEC.md and the golden-query set, no known Phase 0 decision now
blocks database implementation. Implementation still requires normal migration review and service
provisioning verification.

External capabilities and guidance verified on 4 September 2026:

- [Auth.js role-based access control](https://authjs.dev/guides/role-based-access-control) documents
  database-persisted roles and server-side checks; [session strategies](https://authjs.dev/concepts/session-strategies)
  documents immediate server-side revocation with database sessions.
- [OAIC APP 11 guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information)
  covers reasonable security, destruction/de-identification, backup loss, and "beyond use" controls.
- [Neon pricing and restore limits](https://neon.com/pricing) and
  [snapshot restore behaviour](https://neon.com/docs/ai/ai-database-versioning) support the staged
  recovery targets and cost assumptions above; verify them again when provisioning.
- [Geoscape's G-NAF delivery documentation](https://docs.geoscape.com.au/projects/gnaf_desc/en/stable/data_product_delivery.html)
  confirms the government open-data PSV delivery, and the
  [data.gov.au dataset](https://www.data.gov.au/data/dataset/geocoded-national-address-file-g-naf)
  carries the applicable open G-NAF licence reference.
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) supports the backup and raw
  archive storage estimate; [Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds)
  provide the separate p75 field-performance targets.
