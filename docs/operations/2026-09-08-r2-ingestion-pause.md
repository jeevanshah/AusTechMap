# R2 and production ingestion pause — 8 September 2026

## Decision

The user explicitly chose to pause Cloudflare R2 setup and continue product development.

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
