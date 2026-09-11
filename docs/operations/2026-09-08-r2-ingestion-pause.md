# R2 and production ingestion pause — 8 September 2026

## Decision

The user explicitly chose to pause Cloudflare R2 setup and continue product development. This was
superseded on 11 September 2026 after the R2 verification and first production crawl gates below
were completed; the original decision and constraints are retained as an audit record.

Until this pause is lifted:

- do not run `crawl-jobs --due`, `crawl-jobs --all`, or an individual production ATS crawl;
- do not use the local filesystem snapshot backend with the production database;
- do not enqueue production account deletion, because its encrypted suppression ledger also needs
  durable R2 storage; and
- development that does not need raw snapshot storage may continue on fixtures, local/CI PostGIS,
  and read-only production checks.

## Why

Production migration `0015` reports ten active sources as due, but the current environment has no R2
credentials. Crawling now would write immutable snapshot bytes to one machine while production rows
referenced those object keys. Replay and recovery would therefore stop working when that machine or
working directory changed.

## Resume gate

Resume production ingestion only after a private R2 bucket and bucket-scoped read/write credentials
are configured in the worker runtime, one test object passes write/read/checksum verification, and
the user explicitly approves the first production crawl.

## Status update — 11 September 2026

The R2 provisioning portion of this pause is complete. The user created private Standard bucket
`austechmap-raw-production`, saved bucket-scoped object read/write credentials in the GitHub
`production` environment, and manually ran `Verify R2 storage`. GitHub Actions run `34571167209`
completed successfully: it wrote one small unique content-addressed probe, read it back, and
verified its SHA-256 without touching Neon.

The first production `Crawl due ATS sources` remains separately gated by explicit user approval.

## Resume completed — 11 September 2026

The user explicitly approved the first production `Crawl due ATS sources` run after the R2 probe
passed. GitHub Actions run [`34571550432`](https://github.com/jeevanshah/AusTechMap/actions/runs/34571550432)
completed successfully on `main` (06:48–07:27 UTC).

- The manual workflow processed every due source sequentially: 56 `ats_job_fetch` runs succeeded,
  with no retry, dead-letter, or failed run; no active source remained due at completion.
- Production read-back confirmed 56 immutable raw-snapshot records backed by R2 (23,018,197 bytes),
  56 append-only crawl-metric records, zero initial job-count anomalies, and 2,156 job observations.
  Worker attempt metrics reported 2,068 fetched postings, 91 created jobs, 21 updated jobs,
  1,956 unchanged jobs, and 89 expired jobs.
- The workflow remains manual-only. A recurring production schedule is still deferred until the
  approved Railway worker/freshness-SLA milestone; no automatic crawl was enabled by this run.
