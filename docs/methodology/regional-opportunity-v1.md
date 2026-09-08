# Regional Tech Opportunity Score — methodology v1

Status: the schema and suppression-first scorer are deployed, but no production score has been
generated. Raw NERO/IVI import is implemented, but production ingestion remains paused pending R2.

## Purpose

The score orders evidence-backed SA4 regional opportunity records. It is not a prediction of whether
a person will find work, qualify for a visa, or receive sponsorship. A missing input reduces
confidence; materially incomplete inputs suppress the whole score rather than silently counting as
zero.

## Components

| Component                         | Weight | v1 normalisation                                                                                                |
| :-------------------------------- | -----: | :-------------------------------------------------------------------------------------------------------------- |
| Relevant employer depth           |    20% | mapped employers ÷ 25, capped at 1                                                                              |
| Current relevant vacancies        |    20% | active location-confirmed jobs ÷ 20, capped at 1                                                                |
| Hiring momentum                   |    15% | neutral 0.5 plus one quarter of the relative change between the current and prior 30-day windows, capped to 0–1 |
| JSA employment/vacancy direction  |    15% | mean of NERO and IVI direction values after mapping −1/0/+1 to 0/0.5/1                                          |
| Employer/industry diversity       |    10% | distinct observed categories ÷ 8, capped at 1                                                                   |
| Remote/hybrid opportunity         |     5% | share of location-confirmed active jobs marked remote, hybrid, or flexible mixed                                |
| Graduate/early-career opportunity |     5% | share of location-confirmed active jobs marked graduate, internship, or junior                                  |
| Sponsorship evidence density      |     5% | share of mapped employers with active explicit-current or labour-agreement evidence                             |
| Regional migration context        |     5% | strongest observed location context: none 0, Category 2 0.25, Category 3 0.75, DAMA 1                           |

The published value is the weighted sum multiplied by 100 and rounded to two decimal places. Every
stored record retains raw values, normalised values, weights, period, methodology version, and a
SHA-256 fingerprint of the full input structure.

## Sufficiency gates

A v1 score is published only when all conditions pass:

- at least five mapped employers;
- at least 60% of mapped employers have an active monitored ATS source;
- at least three active jobs have an exact `company_location_id` in the SA4;
- the hiring observation span is at least 14 days across at least three distinct dates; and
- both a NERO and IVI direction observation exist for the period.

Failed gates are stored as explicit suppression reasons alongside a `null` score. Employer-wide jobs
without a resolved job location do not count toward regional vacancies, because attributing them to
every employer office would create false regional precision.

## Review questions before production

- Confirm that the Product Spec's illustrative weights should become the fixed v1 weights.
- Confirm the 25-employer, 20-vacancy, and 8-industry saturation points against real distributions.
- Confirm that Category 2/3/DAMA should contribute 0.25/0.75/1 rather than remain descriptive only.
- Independently review the narrow NERO ANZSCO-4 mapping documented in
  [`jsa-regional-labor-import-v1.md`](jsa-regional-labor-import-v1.md).
- Define and review the NERO/IVI comparison intervals and neutral thresholds before populating
  direction; the importer deliberately leaves direction null until then.
- Decide how to handle IVI's GCCSA capital-city rows without manufacturing SA4 precision.
