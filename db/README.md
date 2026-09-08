# Database

Forward-only PostgreSQL migrations live in `db/migrations` and are applied in filename order by the
Python worker's checksum-locked migration command. Applied filenames and SHA-256 values are recorded
in `public.schema_migrations`; changing an applied migration is an error. Correct deployed mistakes
with a new migration. Recover destructive mistakes using the backup/restore contract rather than a
down migration.

The target is Neon PostgreSQL. Local development and CI use PostgreSQL 17 with PostGIS 3.5 through
the official `postgis/postgis:17-3.5` image. Migration `0001` enables `postgis`, `pg_trgm`, and
`pgcrypto`; `0002` establishes the Auth.js-compatible identity schema and ingestion control plane;
`0003` hardens deletion-state and append-only audit constraints; `0004` permits repeated database
observations of one content-addressed object; and `0005` enforces the six-attempt ceiling. Later
forward migrations add the geographic, employer, hiring, authentication, and evidence-lifecycle
schemas. In particular, `0012` creates the authentication rate-limit buckets, `0013` adds evidence
lifecycle states, `0014` serializes rate-limit decisions so locks survive window boundaries, and
`0015` adds adaptive ATS scheduling, quarantine state, and source-level operational controls.
Migration `0016` establishes append-only JSA regional observations and reproducible regional
opportunity scores. It was promoted to production Neon on 8 September 2026; the initial observation
and score tables were deliberately empty. A fixture-backed NERO/IVI importer is being developed on
`feat/phase-6b-jsa-importers`, but production ingestion and score generation remain paused pending
durable R2 snapshot storage and the documented methodology gates.

From the repository root:

```powershell
docker compose up -d postgres
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/austechmap"
$env:PYTHONPATH = "workers/ingestion/src"
workers/ingestion/.venv/Scripts/python.exe -m austechmap_ingestion migrate
```

Set `DATABASE_URL` to target a non-default database. Never point local development at production.
