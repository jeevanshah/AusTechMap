# Cohort location cleanup review waiver — 9 September 2026

## Decision

The user explicitly waived the independent AI review for
`fix/cohort-location-quality` and approved Codex to merge it into `main`.
This waiver covers only commits `1daac35`, `7b763e1`, and `063529a`. It is a
scoped governance exception, not an independent approval and not a permanent
relaxation of the review requirement in `AGENTS.md` Rule 6.

## Change set

- `1daac35` adds a dry-run-first, audited ingestion command that quarantines
  accepted external-geocoder locations selected by an unsupported fixture.
- `7b763e1` adds explicit mixed-fixture handling so only the no-street-number
  entries are selected and documented specific entries are retained.
- `063529a` records the live cleanup outcome and blocks further use of the
  untracked Wave 1/2/3 fixtures pending source-verified address research.

No migration, company, raw address, company-location link, or source evidence
was deleted. The live Neon changes set affected `resolved_locations` rows to
`ambiguous`, clear their map point and regional assignments, and write an
append-only `audit_records` entry for each row.

## Verification evidence

- Ruff and mypy strict passed for all changed ingestion modules.
- Targeted tests passed: 3 passed; 1 integration test skipped because this
  environment cannot run a live PostGIS service.
- The full local ingestion suite previously passed 254 tests with 97
  infrastructure-dependent tests skipped. The full-suite ruff run has
  unrelated existing failures in Antigravity-authored hiring-signal files;
  none overlap this change set.
- Before applying each cleanup, the command ran in dry-run mode against Neon.
  Wave 2 selected 16 locations affecting 199 profiles; Wave 1 selected 173
  locations affecting 188 profiles and explicitly retained Agrifutures and
  Bankwest's numbered-address records.
- A post-apply dry run returned zero remaining accepted targets for both
  waves.

## Residual risks

- No independent AI review was completed for this change set.
- The live-PostGIS integration test still needs CI or a Docker-capable runner
  for independent database-level execution.
- The untracked Wave 1/2/3 fixture CSVs remain preserved for investigation,
  but must not be imported or geocoded until every map-eligible address has
  source evidence and a street-level identifier.
