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

`ambiguous-location-*-20260910.csv` records the next bulk repair pass against the live ambiguous-location queue. The process was deliberately first-party-only and non-mutating: 357 domains without active location-source evidence were triaged; 191 were reachable, 190 homepages were captured, and the standard home/contact/contact-us/locations/support sweep found street-address text for 29 domains. A second bounded pass followed location-shaped links from the remaining 161 reachable homepages, finding six more domains. A canonical host/scheme retry recovered 36 of the 166 initially unreachable domains and found four more address-bearing sites. `ambiguous-location-repair-preflight-20260910.csv` contains the resulting 28 complete, unambiguous selections (including two selections that exactly match the existing ambiguous locality) and passed `validate-address-fixture`. The user approved its Neon import on 10 September 2026: 24 locations were newly resolved and four were reused, with all 28 source-evidence/location links verified afterwards. The matching `*-review-*` artifact preserves 11 multi-office or incomplete cases, while domains without an address candidate remain quarantined.

`ambiguous-location-review-repair-preflight-20260910.csv` resolves the review subset where raw first-party page context supplied a missing postcode or a unique locality match. Its six rows pass `validate-address-fixture`; `ambiguous-location-review-resolution-20260910.csv` records the five remaining cases that are deliberately quarantined. The user approved its Neon import on 10 September 2026: all six locations resolved with active first-party source evidence verified afterwards.

`ambiguous-location-cleanup-inventory-20260910.csv` is the pre-cleanup post-import queue audit. Of its 388 ambiguous company-location links, 76 were superseded by an accepted location for the same company. The user approved their audited unlinking on 10 September 2026: all 76 were removed with no job references, leaving 312 ambiguous links, all without active first-party location evidence and therefore research-only.

`remaining-ambiguous-location-research-20260910.csv` and its candidate manifest record a complete bounded first-party recheck of those 312 remaining links. Two domains had complete official addresses matching the existing locality and were user-approved for Neon import on 10 September 2026; both resolved and their active evidence links were verified. The user also approved unlinking their two superseded ambiguous links, leaving 310 unresolved records: 127 could not be reached, 178 had no street candidate, and five had only ambiguous or mismatched official office candidates. See the matching research report for the full breakdown.

`deep-first-party-location-candidates-20260910.csv` records a final structured-data pass across all 178 reachable no-candidate records. It found six complete, unique first-party office addresses; the user approved their Neon import on 10 September 2026, producing four new resolutions and two reused locations with all six evidence links verified. Their original ambiguous links are now superseded cleanup candidates. After this exhaustive bounded process, 304 records remain unresolved: 127 unreachable, 172 with no address after both passes, and five with only mismatched or multi-office evidence.
