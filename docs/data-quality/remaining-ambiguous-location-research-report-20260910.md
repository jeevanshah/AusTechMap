# Remaining ambiguous-location research report — 10 September 2026

This bounded pass rechecked every live ambiguous company-location link that has no active first-party location evidence. It used only each company's own public site, its canonical redirects, standard contact/location paths, and same-origin location-shaped links. It did not use Google Maps, infer addresses, geocode, or write to Neon.

| Outcome | Companies |
| --- | ---: |
| Complete queue researched | 312 |
| Unreachable after HTTPS/`www`/HTTP variants | 127 |
| Reachable, but no Australian street candidate found | 178 |
| First-party street candidate found | 7 |
| Safe selections matching the existing ambiguous locality | 2 |
| Candidate-bearing, but quarantined due to an office mismatch or multiple offices | 5 |

The two safe selections are in `remaining-ambiguous-location-repair-preflight-20260910.csv`; they pass strict fixture validation but have **not** been geocoded or imported. The complete per-company result is `remaining-ambiguous-location-research-20260910.csv`; exact candidate/source pairs are in `remaining-ambiguous-location-candidates-20260910.csv`.

The five candidate-bearing but quarantined domains are `geographe.com.au`, `legalvision.com.au`, `seqta.com.au`, `splend.com.au`, and `vantage-dc.com`. Their official pages expose multiple offices, no office matching the existing locality, or only a US location. Keeping them unresolved is intentional.
