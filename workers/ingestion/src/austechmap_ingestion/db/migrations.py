"""Forward-only, checksum-locked PostgreSQL migration runner."""

from __future__ import annotations

import hashlib
import re
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import cast

import psycopg
from psycopg import Connection

MIGRATION_FILENAME = re.compile(r"^(?P<version>[0-9]{4})_[a-z0-9_]+\.sql$")
MIGRATION_LOCK_ID = 0x41555354454348


class MigrationError(RuntimeError):
    """Raised when migration discovery or application is unsafe."""


@dataclass(frozen=True)
class Migration:
    version: int
    filename: str
    checksum: str
    sql: str


def discover_migrations(directory: Path) -> tuple[Migration, ...]:
    """Read and validate a contiguous migration sequence from a directory."""
    if not directory.is_dir():
        raise MigrationError(f"Migration directory does not exist: {directory}")

    migrations: list[Migration] = []
    for path in sorted(directory.glob("*.sql")):
        match = MIGRATION_FILENAME.fullmatch(path.name)
        if match is None:
            raise MigrationError(f"Invalid migration filename: {path.name}")
        raw = path.read_bytes()
        try:
            sql = raw.decode("utf-8")
        except UnicodeDecodeError as error:
            raise MigrationError(f"Migration is not UTF-8: {path.name}") from error
        if not sql.strip():
            raise MigrationError(f"Migration is empty: {path.name}")
        migrations.append(
            Migration(
                version=int(match.group("version")),
                filename=path.name,
                checksum=hashlib.sha256(raw).hexdigest(),
                sql=sql,
            )
        )

    if not migrations:
        raise MigrationError(f"No migrations found in: {directory}")

    versions = [migration.version for migration in migrations]
    expected = list(range(1, len(migrations) + 1))
    if versions != expected:
        raise MigrationError(
            "Migration versions must be contiguous from 0001; "
            f"found {versions}, expected {expected}"
        )
    return tuple(migrations)


def apply_migrations(database_url: str, directory: Path) -> tuple[Migration, ...]:
    """Apply pending migrations transactionally while holding a database-wide lock."""
    migrations = discover_migrations(directory)
    with psycopg.connect(database_url, autocommit=True) as connection:
        connection.execute("SELECT pg_advisory_lock(%s)", (MIGRATION_LOCK_ID,))
        try:
            _ensure_metadata_table(connection)
            applied = _load_applied_migrations(connection)
            _validate_applied_migrations(migrations, applied)

            completed: list[Migration] = []
            for migration in migrations:
                if migration.version in applied:
                    continue
                with connection.transaction():
                    connection.execute(migration.sql, prepare=False)
                    connection.execute(
                        """
                        INSERT INTO schema_migrations (version, filename, checksum)
                        VALUES (%s, %s, %s)
                        """,
                        (migration.version, migration.filename, migration.checksum),
                    )
                completed.append(migration)
            return tuple(completed)
        finally:
            connection.execute("SELECT pg_advisory_unlock(%s)", (MIGRATION_LOCK_ID,))


def _ensure_metadata_table(connection: Connection[tuple[object, ...]]) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY CHECK (version > 0),
          filename TEXT NOT NULL UNIQUE,
          checksum CHAR(64) NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )


def _load_applied_migrations(
    connection: Connection[tuple[object, ...]],
) -> dict[int, tuple[str, str]]:
    rows = connection.execute(
        "SELECT version, filename, checksum FROM schema_migrations ORDER BY version"
    ).fetchall()
    typed_rows = cast(list[tuple[int, str, str]], rows)
    return {version: (filename, checksum) for version, filename, checksum in typed_rows}


def _validate_applied_migrations(
    migrations: Sequence[Migration], applied: dict[int, tuple[str, str]]
) -> None:
    discovered = {migration.version: migration for migration in migrations}
    unknown = sorted(set(applied) - set(discovered))
    if unknown:
        raise MigrationError(f"Database contains migrations absent from disk: {unknown}")

    for version, (filename, checksum) in applied.items():
        migration = discovered[version]
        if filename != migration.filename:
            raise MigrationError(
                f"Migration {version:04d} filename changed: database has {filename}, "
                f"disk has {migration.filename}"
            )
        if checksum != migration.checksum:
            raise MigrationError(
                f"Migration {migration.filename} checksum differs from the applied version"
            )
