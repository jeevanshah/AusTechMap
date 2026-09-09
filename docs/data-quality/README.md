# Cohort research manifests

These files are bulk-review artifacts, not import fixtures. A reachable domain only establishes a technical first pass; it does **not** establish that a candidate is an eligible technology employer, nor that a map point is appropriate.

Candidates may move into a seed fixture only after a public first-party source URL and a specific technology rationale are recorded. A location needs separate first-party, street-level address evidence and must pass `validate-address-fixture` before it can be geocoded.

`unreachable_needs_manual_review` is deliberately not a rejection: provider outages, bot controls, and TLS errors can all produce that result. It blocks automatic seeding until an authoritative company source is found.

`wave1-seed-preflight-20260909.csv` is the bulk preflight derived from the homepage-evidence manifest. Its entries meet the fixture's syntactic source-evidence contract, but it is **not** an import instruction: applying it to Neon remains a production write requiring explicit user approval.

`wave1-location-candidates-20260909.csv` is a bulk, first-party page sweep. Its address text is discovery-only: every candidate still needs its exact supporting page URL and a strict address-fixture validation before geocoding.

Wave 2 / Wave 3 follow the same non-mutating pipeline (`triage` → `homepage-evidence` → `seed-preflight` → `location-candidates`). Counts as of 9 September 2026:

| Wave | Triage reachable | Metadata captured | Seed preflight | Location candidates |
| --- | ---: | ---: | ---: | ---: |
| 2 | 152 | 140 | 135 | 39 |
| 3 | 141 | 121 | 114 | 32 |

`wave2-seed-preflight-20260909.csv` / `wave3-seed-preflight-20260909.csv` and the matching `*-location-candidates-20260909.csv` files are review artifacts. Wave 2/3 Neon `seed-employers` was user-approved on 9 September 2026 (see `docs/operations/delivery-log.md`). Location text remains discovery-only: every candidate still needs its exact supporting page URL and `validate-address-fixture` before geocoding. Neon `seed-locations` / geocoding still need explicit user approval.

`wave23-location-candidate-sources-20260909.csv` attaches exact first-party page URLs to the Wave 2/3 discovery candidates. It is still not an address fixture: a company may have multiple offices, and each candidate requires selection and address-field validation before any map action.

`wave23-location-selection-preflight-20260909.csv` contains the 51 unambiguous, complete address candidates selected from that source-linked set. It passed `validate-address-fixture`; it is ready for a single, explicitly approved production geocode/import only.

`wave23-location-repair-preflight-20260909.csv` is the small follow-up fixture for the canonical-domain corrections discovered during the approved Wave 2/3 import. Skilio is deliberately excluded pending a complete first-party street address.
