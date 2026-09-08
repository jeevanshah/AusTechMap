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
  gates. v1.8
- **[docs/golden-queries.md](./docs/golden-queries.md)** — relevance fixtures and measurable search
  acceptance gates. v1.0
- **[docs/deployment.md](./docs/deployment.md)** — staging promotion and web/worker deployment. v1.0

## Status

As of 8 September 2026, Phases 0–3 are closed against real infrastructure and data. The private-alpha
core is live with 133 researched employers, mapped geography and regional classification, three ATS
adapters, 92 observed jobs across 9 companies, employer search/profiles, and sponsorship filtering.

Phase 6A's sponsorship-evidence slice is deployed: Home Affairs labour-agreement evidence and
job-derived claims are source-linked, confidence-scored, lifecycle-managed, and reviewable. Production
migrations run through `0014`; health, homepage, and company search were verified after deployment.
Authentication, database sessions, staff TOTP MFA, role-gated admin routes, and account-deletion code
are built. Cloudflare R2 configuration for the deletion suppression ledger remains deliberately
deferred until real users are admitted.

Phase 5 now includes checksum-verified snapshot replay, adaptive due-time scheduling, automatic source
quarantine, and audited operator kill switches. The current priority is expanding verified source
coverage and proving the refresh cadence in production, followed by private-alpha feedback. Phase 7
matching, saved-state, and alerts remain gated on that feedback checkpoint.

## Delivery approach

Ship and validate a private alpha first — 100–200 curated employers, three ATS integrations,
map/search/profiles, and sponsorship evidence — before building Opportunity Match, alerts, or scaling
to the 1,000-employer V1 target. See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the
authoritative sequence.
