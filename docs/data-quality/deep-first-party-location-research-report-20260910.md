# Deep first-party location research — 10 September 2026

This completed a structured-data pass across all 178 reachable records from the full 312-record sweep that had no visible street candidate. It fetched only canonical company pages, standard contact/location paths, same-origin location-shaped links, and public structured data embedded by those sites.

| Outcome | Companies |
| --- | ---: |
| Deep-pass targets | 178 |
| New complete first-party address candidates | 6 |
| No address after deep pass | 172 |

All six candidates are unique per company and complete, so they form `deep-first-party-location-repair-preflight-20260910.csv`. They pass strict fixture validation but have not been geocoded or imported.

After combining this result with the full earlier sweep, the residual queue is 304 records: 127 unreachable domains, 172 reachable without an address after both passes, and five official-site cases with multiple or mismatched offices. No location was inferred from a non-first-party source.
