import argparse
import json
import os
from collections.abc import Sequence
from pathlib import Path

import psycopg

from austechmap_ingestion.db.migrations import MigrationError, apply_migrations
from austechmap_ingestion.health import build_health


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Australia Tech Map ingestion worker")
    subparsers = parser.add_subparsers(dest="command", required=True)
    health_parser = subparsers.add_parser("health", help="emit worker health as JSON")
    health_parser.add_argument("--run-id", default="local")
    migrate_parser = subparsers.add_parser("migrate", help="apply pending database migrations")
    migrate_parser.add_argument("--database-url", default=os.environ.get("DATABASE_URL"))
    migrate_parser.add_argument("--migrations-dir", type=Path, default=Path("db/migrations"))
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

    return 2


if __name__ == "__main__":
    raise SystemExit(main())
