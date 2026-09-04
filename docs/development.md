# Development

## Prerequisites

- Node.js 22 or newer and npm
- Python 3.12 or newer
- Docker Desktop (or another Docker Compose implementation) for local PostGIS

The database workflow uses PostgreSQL 17 with PostGIS 3.5, matching CI. If Docker is unavailable,
the non-integration worker tests still run; use a disposable Neon development database for live
migration testing, never a shared or production database.

## JavaScript workspace

On Windows PowerShell systems that block `npm.ps1`, use `npm.cmd` in the commands below.

```powershell
npm.cmd install
npm.cmd run dev
```

The web application runs at `http://localhost:3000`; its health endpoint is
`http://localhost:3000/api/health`.

## Python worker

```powershell
python -m venv workers/ingestion/.venv
workers/ingestion/.venv/Scripts/python.exe -m pip install -r workers/ingestion/requirements-dev.lock
$env:PYTHONPATH = "workers/ingestion/src"
workers/ingestion/.venv/Scripts/python.exe -m austechmap_ingestion health --run-id local
```

## Database

Use the local values from `.env.example`, then start PostGIS and apply the forward-only migrations:

```powershell
docker compose up -d postgres
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/austechmap"
$env:PYTHONPATH = "workers/ingestion/src"
workers/ingestion/.venv/Scripts/python.exe -m austechmap_ingestion migrate
```

The migration runner takes a PostgreSQL advisory lock, applies each file in its own transaction,
and records its SHA-256 checksum. Never edit an applied migration; add the next numbered SQL file.
To stop the database, run `docker compose down`. The named volume preserves local data; use
`docker compose down --volumes` only when you intentionally want to erase that local database.

To exercise the Phase 1 importer end to end against the local database and filesystem snapshot
store:

```powershell
$env:RAW_SNAPSHOT_ROOT = ".local/raw-snapshots"
workers/ingestion/.venv/Scripts/python.exe -m austechmap_ingestion sample-import `
  --source-key phase-1-fixture `
  workers/ingestion/tests/fixtures/sample_source.json
```

The command is idempotent for the same source and content hash. Raw objects use
`raw/{source_key}/{sha256_prefix}/{sha256}` keys, matching the content-addressed layout intended for
R2. The local `.local/` directory is ignored by Git. Worker lifecycle events are emitted as
privacy-safe JSON on stderr; set `LOG_LEVEL` to control their minimum level.

To use a private Cloudflare R2 bucket instead, set `RAW_SNAPSHOT_BACKEND=r2`,
`RAW_SNAPSHOT_BUCKET`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, and `R2_SECRET_ACCESS_KEY`. These are
server-side credentials and must never use a `NEXT_PUBLIC_` prefix. Uploads use conditional writes,
so an existing content-addressed object cannot be overwritten; an identical object is treated as an
idempotent success. Passing `--snapshot-root` explicitly forces filesystem storage for that command.

Set the server-side `SENTRY_DSN` to enable worker exception reporting. `APP_ENV` and `APP_RELEASE`
label reports. Sentry's default PII collection and performance tracing are disabled; reports contain
only the approved run, source, company, parser-version, and correlation identifiers.

## Quality checks

```powershell
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
workers/ingestion/.venv/Scripts/python.exe -m ruff check workers/ingestion
workers/ingestion/.venv/Scripts/python.exe -m mypy --config-file workers/ingestion/pyproject.toml workers/ingestion/src workers/ingestion/tests
workers/ingestion/.venv/Scripts/python.exe -m pytest -c workers/ingestion/pyproject.toml
```

Integration tests run when `TEST_DATABASE_URL` is set. CI always runs them against its disposable
PostGIS service. Locally, set it to the Compose URL above before running pytest.
