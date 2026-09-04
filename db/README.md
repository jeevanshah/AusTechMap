# Database

Forward-only PostgreSQL migrations live in `db/migrations` and are applied in filename order by the
Python worker's checksum-locked migration command. Applied filenames and SHA-256 values are recorded
in `public.schema_migrations`; changing an applied migration is an error. Correct deployed mistakes
with a new migration. Recover destructive mistakes using the backup/restore contract rather than a
down migration.

The target is Neon PostgreSQL. Local development and CI use PostgreSQL 17 with PostGIS 3.5 through
the official `postgis/postgis:17-3.5` image. Migration `0001` enables `postgis`, `pg_trgm`, and
`pgcrypto`; `0002` establishes the Auth.js-compatible identity schema and ingestion control plane.

From the repository root:

```powershell
docker compose up -d postgres
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/austechmap"
$env:PYTHONPATH = "workers/ingestion/src"
workers/ingestion/.venv/Scripts/python.exe -m austechmap_ingestion migrate
```

Set `DATABASE_URL` to target a non-default database. Never point local development at production.
