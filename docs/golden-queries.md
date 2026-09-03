# Golden discovery queries

> Version 1.0 · 4 September 2026

This is the fixed Phase 0 relevance set for map, search, and Opportunity Match. It defines user
intent and hard assertions before production data exists. Expected employer judgements are added as
the reviewed seed cohort lands; changing an assertion requires a reviewed fixture-version change,
not an undocumented test edit.

## Judgement scale

- `3` — directly satisfies the query and all hard constraints.
- `2` — strongly related, with a clearly explained adjacent-role, skill, or location match.
- `1` — weakly related but defensible as a lower-ranked exploratory result.
- `0` — irrelevant or violates a hard constraint.

Every returned result must include its matched fields, evidence timestamp, data-quality state, and
methodology version. Location, work-style, active-hiring, and sponsorship filters are hard constraints
when explicitly selected; missing evidence never counts as a positive match.

## Query set

| ID | User query / filters | Primary coverage | Required assertions |
| :--- | :--- | :--- | :--- |
| GQ-01 | `Atlassian` | Exact employer | Canonical employer is first; aliases do not create duplicates. |
| GQ-02 | `atlassain` | Employer typo | The intended employer is in the top three through trigram matching. |
| GQ-03 | `Afterpay` | Employer alias | The canonical current employer appears once; the historical brand match is explained. |
| GQ-04 | `data engineer`, skills `Python, SQL`, locations `Sydney, Newcastle`, work style `hybrid` | Multi-signal role search | Every result satisfies the location and work-style constraints; role and skill evidence are explained separately. |
| GQ-05 | `backend engineer`, skill `Go`, location `Melbourne`, category `fintech` | Role + skill + category | Category is evidenced; generic software employers rank below directly evidenced fintech employers. |
| GQ-06 | `cyber security`, location `Canberra` | Synonym + city | Cybersecurity aliases map to the canonical family; no non-Canberra office-only result passes the hard filter. |
| GQ-07 | `platform engineer`, skills `AWS, Kubernetes`, location `Brisbane` | Platform taxonomy | Adjacent DevOps/SRE roles may appear only with an adjacency explanation. |
| GQ-08 | `machine learning engineer`, skill `Python`, location `Australia`, remote `remote` | National remote | Office location is not incorrectly required; remote evidence must be current. |
| GQ-09 | `frontend engineer`, skill `React`, remote `remote` | Skill + work style | React evidence is sourced from jobs or verified submissions; inferred remote status is prohibited. |
| GQ-10 | `product manager`, location `Melbourne`, remote `hybrid` | Non-engineering tech role | Product roles are not collapsed into software engineering; hard filters are respected. |
| GQ-11 | `graduate software engineer`, location `Adelaide` | Seniority | Graduate/entry-level evidence outranks unspecified-seniority roles. |
| GQ-12 | `data analyst`, postcode `2300` | Postcode | Postcode resolves to the correct geography and does not broaden silently to all NSW. |
| GQ-13 | `software engineer`, suburb `Fortitude Valley` | Suburb | Suburb matching uses a canonical locality; ambiguous names require region context. |
| GQ-14 | `robotics`, location `Adelaide` | Specialised niche | Niche evidence is shown; keyword-only false positives are graded zero. |
| GQ-15 | `mining technology`, location `Perth` | Industry technology | Mining-tech employers outrank generic miners without technology-employment evidence. |
| GQ-16 | `agritech`, region `regional NSW` | Regional discovery | Results are inside the selected regional classification version; metro spillover is zero relevance. |
| GQ-17 | `healthtech`, location `Brisbane` | Category + city | Health providers without technology-employer evidence do not rank as direct matches. |
| GQ-18 | `climate tech`, region `Tasmania` | Sparse regional results | Honest low coverage or empty state is preferred to relaxing the region constraint. |
| GQ-19 | `software engineer`, location `Sydney`, sponsorship evidence `current explicit` | Sponsorship evidence | Only current explicit evidence qualifies; historical or inferred evidence is labelled and excluded. |
| GQ-20 | `data engineer`, region `DAMA`, sponsorship evidence `any sourced` | Migration context | Regional-program context is not presented as employer sponsorship or individual eligibility. |
| GQ-21 | `cloud engineer`, location `regional`, remote `hybrid` | Combined regional filters | Both regional classification and current hybrid evidence are mandatory. |
| GQ-22 | `solution architect`, locations `Sydney, Melbourne` | Multi-location OR | Either selected city may match; an employer with both cities appears once. |
| GQ-23 | `C++ embedded engineer`, location `Australia` | Punctuation and skill parsing | `C++` remains a distinct skill and embedded roles outrank generic C/C++ mentions. |
| GQ-24 | `quantum blockchain astronaut`, location `Hobart` | Zero-result behaviour | Returns an honest empty state and useful filter guidance, not unrelated employers. |
| GQ-25 | Blank text with map viewport over central Sydney and category `software` | Map-only discovery | Results are bounded to the viewport, clustered at low zoom, and contain no full-profile payloads. |

## Acceptance method

1. Build a versioned judgement file from the reviewed employer seed using the `0`–`3` scale above.
   The founder approves initial judgements; later changes require a reason and reviewer.
2. For queries with at least one relevant result, achieve `nDCG@10 >= 0.80` overall and for each of
   the role, location/regional, remote, and sponsorship slices.
3. Put a grade-`3` result in the top three for at least 85% of eligible queries and a grade-`2` or
   grade-`3` result in the top ten for at least 95%.
4. Permit zero hard-constraint violations in the top ten. GQ-19 and GQ-20 also require zero
   unsupported sponsorship or visa-eligibility claims at any rank.
5. GQ-24 must remain an empty result unless the underlying reviewed dataset genuinely changes.
6. A candidate release fails if overall `nDCG@10` drops by more than `0.03`, any slice drops by more
   than `0.05`, or any critical query (GQ-01, GQ-04, GQ-19, GQ-20, GQ-24, GQ-25) regresses.

Run the suite against a frozen database snapshot and record dataset version, taxonomy version,
methodology version, commit SHA, per-query metrics, and failures. These are release gates, not live
training signals; production clicks can inform proposed judgements but never rewrite them
automatically.
