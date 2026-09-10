# Australia Tech Map

A map-first opportunity-intelligence platform for Australian technology employment — discover
employers, track hiring and evidence-backed sponsorship information, and monitor regional
opportunity, all traceable to a source.

## Documents

- **[PRODUCT_SPEC.md](./PRODUCT_SPEC.md)** — product vision, scope, data model, and policy. v2.4
- **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** — delivery phases, dependencies, current
  status, and exit gates. v4.3
- **[ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md)** — authoritative technology and
  operational decisions. v3.10
- **[AGENTS.md](./AGENTS.md)** — Codex/Claude/Gemini roles, orchestration, workflow rules, and quality
  gates. v1.9
- **[docs/golden-queries.md](./docs/golden-queries.md)** — relevance fixtures and measurable search
  acceptance gates. v1.0
- **[docs/deployment.md](./docs/deployment.md)** — staging promotion and web/worker deployment. v1.0

## Status

As of 9 September 2026, Phases 0–8 foundation work is live against Neon, with private-alpha
discovery (map/search/profiles), Opportunity Match, retention/alerts, and launch hardening in place.
The employer cohort has **908** companies and **506** companies with an accepted, evidence-backed
location (see `HANDOFF.md` for the latest live counts).

**Cohort data-quality (Waves 1–3), 9 September 2026:** low-specificity city-centre pins were
quarantined earlier. Evidence-backed homepage seed preflights are committed under
`docs/data-quality/`. Wave 2/3 Neon `seed-employers` imported homepage evidence (**131** matched /
**113** created). First-party location discovery found **39** (Wave 2) and **32** (Wave 3) AU-state
street-address candidates — discovery-only; no geocode or `seed-locations` until each address has a
verified source URL and passes `validate-address-fixture`. Pipeline notes:
[`docs/data-quality/README.md`](./docs/data-quality/README.md),
[`docs/operations/delivery-log.md`](./docs/operations/delivery-log.md).

**Current location status, 10 September 2026:** 42 first-party-backed repair locations have now been user-approved and imported to Neon. The 84 ambiguous links superseded by accepted locations were audited and unlinked; **304** ambiguous links remain research-only because they have no active first-party location evidence. This paragraph supersedes the earlier discovery-only wording above.

Cloudflare R2 for the account-deletion ledger remains deliberately deferred until real users are
admitted. Current priorities: verify street-level locations for map-eligible companies, expand ATS
coverage, and run controlled beta onboarding per `docs/operations/beta-launch-guide.md`.

## Delivery approach

Ship and validate a private alpha first — curated employers, ATS integrations, map/search/profiles,
and sponsorship evidence — before scaling to the 1,000-employer V1 target. See
[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the authoritative sequence.
