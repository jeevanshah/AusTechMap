# Australia Tech Map

A map-first opportunity-intelligence platform for Australian technology employment — discover employers, track hiring and evidence-backed sponsorship information, and monitor regional opportunity, all traceable to a source.

## Documents

- **[PRODUCT_SPEC.md](./PRODUCT_SPEC.md)** — full product specification: vision, scope, data model, and policy. v2.4
- **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** — delivery phases, tasks, dependencies, and exit gates. v2.4
- **[ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md)** — authoritative technology choices; overrides PRODUCT_SPEC.md's recommendations where they conflict. v3.1
- **[AGENTS.md](./AGENTS.md)** — coding-agent roles (Codex/Claude/Gemini), orchestration, tooling, quota-based switching, workflow rules, and quality gates. v1.6
- **[docs/golden-queries.md](./docs/golden-queries.md)** — Phase 0 relevance fixtures and measurable search acceptance gates. v1.0
- **[docs/deployment.md](./docs/deployment.md)** — staging promotion and web/worker deployment: what's built vs. what needs real account credentials. v1.0

## Status

Implementation is underway. Phase 0 and Phase 1 are both closed. Phase 1's web/worker/CI foundation, database schema, fenced ingestion job lifecycle, and observability are merged; the sample importer persists a reviewed, audited snapshot; staging promotion and the Vercel web deployment have both run successfully against real infrastructure. See IMPLEMENTATION_PLAN.md's Phase 1 exit gate for what closed it, and ARCHITECTURE_DECISIONS.md §3.4 for a known, deliberate interim deviation (Vercel Hobby tier, not yet Pro).

## Delivery approach

Ship a private alpha first — 100–200 curated employers across Sydney, Melbourne, Brisbane, and selected regional centres, three ATS integrations, map/search/profiles, and sponsorship evidence — before building Opportunity Match, alerts, or scaling to the full 1,000-employer V1 target. See IMPLEMENTATION_PLAN.md §5 for the milestone breakdown.
