# Development

## Prerequisites

- Node.js 22 or newer and npm
- Python 3.12 or newer

Docker is not required for the initial foundation slice. Phase 0's database-operating decisions are
closed; the repeatable local PostGIS workflow has not yet been provisioned and is the next Phase 1
database slice.

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
