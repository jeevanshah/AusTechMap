# Australia Tech Map

A map-first opportunity-intelligence platform for Australian technology employment — discover employers, track hiring and evidence-backed sponsorship information, and monitor regional opportunity, all traceable to a source.

## Documents

- **[PRODUCT_SPEC.md](./PRODUCT_SPEC.md)** — full product specification: vision, scope, data model, and policy. v2.4
- **[IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)** — delivery phases, tasks, dependencies, and exit gates. v2.8
- **[ARCHITECTURE_DECISIONS.md](./ARCHITECTURE_DECISIONS.md)** — authoritative technology choices; overrides PRODUCT_SPEC.md's recommendations where they conflict. v3.4
- **[AGENTS.md](./AGENTS.md)** — coding-agent roles (Codex/Claude/Gemini), orchestration, tooling, quota-based switching, workflow rules, and quality gates. v1.6
- **[docs/golden-queries.md](./docs/golden-queries.md)** — Phase 0 relevance fixtures and measurable search acceptance gates. v1.0
- **[docs/deployment.md](./docs/deployment.md)** — staging promotion and web/worker deployment: what's built vs. what needs real account credentials. v1.0

## Status

Implementation is underway. Phase 0 and Phase 1 are both closed. Phase 1's web/worker/CI foundation, database schema, fenced ingestion job lifecycle, and observability are merged; the sample importer persists a reviewed, audited snapshot; staging promotion and the Vercel web deployment have both run successfully against real infrastructure. Phase 2's geographic-foundation schema, ASGS/G-NAF/Home Affairs importers, and point-in-polygon resolution are built and tested, but no real ABS/G-NAF data has actually been imported yet. Phase 3 has real progress against real infrastructure: 133 real, researched employers are seeded into the real Neon database (0 unresolved duplicates, 100% provenance), and real street addresses for all 133 are ready to geocode via the Mapbox Geocoding API (`employers/geocoding.py`, `employers/locations_seed.py`, CLI `seed-locations` — a deliberate interim stand-in for Phase 2's not-yet-loaded G-NAF pipeline, see ARCHITECTURE_DECISIONS.md §4.3's interim-state note). Neither phase's exit gate is closed yet — Phase 2 needs real ABS/G-NAF imports; Phase 3 needs the location-seed run actually executed against the real database and its coverage reports produced. See IMPLEMENTATION_PLAN.md's Phase 1-3 exit gates for specifics, and ARCHITECTURE_DECISIONS.md §3.4 and §4.1 for the other known, deliberate interim deviations (Vercel Hobby tier, and unauthenticated admin pages) that must close before any real user or commercial activity.

## Delivery approach

Ship a private alpha first — 100–200 curated employers across Sydney, Melbourne, Brisbane, and selected regional centres, three ATS integrations, map/search/profiles, and sponsorship evidence — before building Opportunity Match, alerts, or scaling to the full 1,000-employer V1 target. See IMPLEMENTATION_PLAN.md §5 for the milestone breakdown.
