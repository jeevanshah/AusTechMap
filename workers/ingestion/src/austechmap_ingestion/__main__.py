import argparse
import json
import os
from collections.abc import Sequence
from pathlib import Path

import psycopg

from austechmap_ingestion.db.migrations import MigrationError, apply_migrations
from austechmap_ingestion.health import build_health
from austechmap_ingestion.jobs import JobError, JobRepository
from austechmap_ingestion.sample_importer import run_sample_import
from austechmap_ingestion.storage import FilesystemSnapshotStore, SnapshotStorageError


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Australia Tech Map ingestion worker")
    subparsers = parser.add_subparsers(dest="command", required=True)
    health_parser = subparsers.add_parser("health", help="emit worker health as JSON")
    health_parser.add_argument("--run-id", default="local")
    migrate_parser = subparsers.add_parser("migrate", help="apply pending database migrations")
    migrate_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    migrate_parser.add_argument("--migrations-dir", type=Path, default=Path("db/migrations"))
    sample_parser = subparsers.add_parser(
        "sample-import", help="persist a local file as an audited sample import"
    )
    sample_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    sample_parser.add_argument("--source-key", default="sample-source")
    sample_parser.add_argument("--content-type", default="application/json")
    sample_parser.add_argument("--worker-id", default="sample-importer")
    sample_parser.add_argument(
        "--snapshot-root",
        type=Path,
        default=Path(os.environ.get("RAW_SNAPSHOT_ROOT", ".local/raw-snapshots")),
    )
    sample_parser.add_argument("input", type=Path)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "health":
        print(json.dumps(build_health(args.run_id), separators=(",", ":"), sort_keys=True))
        return 0

    if args.command == "migrate":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            applied = apply_migrations(args.database_url, args.migrations_dir)
        except (MigrationError, psycopg.Error) as error:
            print(f"Migration failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "applied": [migration.filename for migration in applied],
                    "count": len(applied),
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    if args.command == "sample-import":
        if not args.database_url:
            print("DATABASE_URL or --database-url is required")
            return 2
        try:
            result = run_sample_import(
                JobRepository(args.database_url),
                FilesystemSnapshotStore(args.snapshot_root),
                source_key=args.source_key,
                content=args.input.read_bytes(),
                content_type=args.content_type,
                worker_id=args.worker_id,
            )
        except (JobError, OSError, SnapshotStorageError, ValueError, psycopg.Error) as error:
            print(f"Sample import failed: {error}")
            return 1
        print(
            json.dumps(
                {
                    "created": result.created,
                    "runId": str(result.run_id),
                    "snapshotId": str(result.snapshot_id) if result.snapshot_id else None,
                },
                separators=(",", ":"),
                sort_keys=True,
            )
        )
        return 0

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
