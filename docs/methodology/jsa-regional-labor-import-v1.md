# JSA regional labour import — methodology v1

Status: version 1 is implemented with fixture and live-PostGIS integration coverage. Production
imports remain paused until durable Cloudflare R2 snapshot storage is configured and the user lifts
the pause in `docs/operations/2026-09-08-r2-ingestion-pause.md`.

## Sources and supported releases

The importer accepts files downloaded manually from two Jobs and Skills Australia (JSA) products:

- [Nowcast of Employment by Region and Occupation (NERO)](https://www.jobsandskills.gov.au/data/nero):
  the official ZIP containing the release CSV. Version 1 was verified against the August 2026
  release, published 2 September 2026.
- [Internet Vacancy Index (IVI)](https://www.jobsandskills.gov.au/data/internet-vacancy-index): the
  official ANZSCO 2-digit occupation by GCCSA and SA4 XLSX workbook. Version 1 was verified against
  the July 2026 release, published 19 August 2026.

The operator supplies the official release month as `source_version`; the file's SHA-256 digest is
also part of the import-run idempotency key. Every successful run stores the unmodified source file
as a content-addressed raw snapshot and links every appended observation to both the source and run.

JSA website material is used under CC BY 4.0. User-facing surfaces must link the relevant product
page, show the release version, retain the caveats in this document, and preserve the applicable
attribution: NERO's product-specific attribution text or `© Commonwealth of Australia` for IVI.
The product must not imply that JSA endorses Australia Tech Map or its derived score.

## NERO contract

NERO supplies monthly modelled employment nowcasts at ANZSCO 4-digit occupation × SA4. The parser:

- reads the archive's single CSV without extracting it to disk;
- rejects unsafe archive paths, oversized content, suspicious compression ratios, missing columns,
  invalid values, duplicate natural keys, and changed titles for mapped occupation codes;
- retains only the explicit mappings in
  `workers/ingestion/src/austechmap_ingestion/regional/fixtures/anzsco4_role_family_v1.csv`; and
- stores one `employment_anzsco4_{code}` observation per mapped occupation, SA4, and month.

The mapping is intentionally narrow. Combined or managerial ANZSCO groups are excluded when their
members span multiple product role families. A new mapping requires an explicit rationale and exact
source-title validation; it is not inferred from keywords at import time.

NERO is experimental modelled data, not an administrative count. Smaller series can be volatile,
and JSA advises interpreting scale and direction rather than treating estimates as exact. Values
must not be summed across occupation or geography levels.

## IVI contract and grain limitation

The public regional IVI workbook supplies a three-month moving average at ANZSCO 2-digit occupation.
Capital-city labour markets are GCCSAs while the remaining regional rows are SA4s. Version 1 imports
only exact `SA4` rows for ANZSCO code `26`, `ICT Professionals`:

- GCCSA rows are excluded; the importer never manufactures SA4 values for a capital-city GCCSA.
- The ANZSCO-2 value is stored with a null `role_family_id`, because assigning the broad ICT total
  to software, data, design, or infrastructure would create false precision.
- The metric key is `vacancies_anzsco2_26_3mma`; the unit records that it is an online-advertisement
  three-month moving average.

IVI covers advertisements collected from SEEK, CareerOne, and Workforce Australia. It is neither a
count of all vacancies nor necessarily a count of positions: one advertisement can represent more
than one position, and some vacancies are never advertised online. JSA's regional series was added
and backcast to January 2019. Seasonally adjusted and trend series are not additive.

## Direction and score readiness

Version 1 stores `direction = null` for both products. It does not silently choose a month-over-month
or year-over-year comparison, and it does not mix a NERO role-family series with the broader IVI
ANZSCO-2 signal. Consequently, the regional opportunity scorer continues to emit a suppressed
record under its existing `both a NERO and IVI direction observation` sufficiency gate.

Before direction can be populated, an independently reviewed methodology must define:

1. the comparison interval and neutral threshold for each dataset;
2. how revised historical releases affect derived direction;
3. whether IVI's broad ANZSCO-2 value is used only for an all-tech regional score or allocated by a
   separately evidenced rule; and
4. how GCCSA-only capital-city IVI coverage is represented without inventing SA4 precision.

## Operational command

For fixture or disposable-development use only:

```powershell
$env:PYTHONPATH = "workers/ingestion/src"
workers/ingestion/.venv/Scripts/python.exe -m austechmap_ingestion import-jsa `
  --dataset nero --source-version 2026-08 --snapshot-root .local/raw-snapshots `
  C:\path\to\2026-08_nero.zip
```

Use `--dataset ivi --source-version 2026-07` for the IVI workbook. Do not combine a filesystem
snapshot root with the production database. Production use requires the configured R2 backend and
an explicit lifting of the current ingestion pause.
