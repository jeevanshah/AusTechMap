from __future__ import annotations

import os
import uuid
from pathlib import Path

import psycopg
import pytest
from _helpers import unique_valid_abn

from austechmap_ingestion.db.migrations import (
    MigrationError,
    apply_migrations,
    discover_migrations,
)

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"


def test_repository_migrations_are_contiguous_and_cover_foundation_contracts() -> None:
    migrations = discover_migrations(MIGRATIONS_DIRECTORY)

    assert [migration.version for migration in migrations] == [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    combined_sql = "\n".join(migration.sql for migration in migrations)
    assert "CREATE EXTENSION IF NOT EXISTS postgis" in combined_sql
    assert "CREATE TABLE users" in combined_sql
    assert "CREATE TABLE import_runs" in combined_sql
    assert "CREATE TABLE raw_snapshots" in combined_sql
    assert "CREATE TABLE audit_records" in combined_sql
    assert "CREATE TABLE geography_releases" in combined_sql
    assert "CREATE TABLE regions" in combined_sql
    assert "CREATE TABLE postcode_rules" in combined_sql
    assert "CREATE TABLE resolved_locations" in combined_sql
    assert "CREATE TABLE companies" in combined_sql
    assert "CREATE TABLE company_aliases" in combined_sql
    assert "CREATE TABLE evidence" in combined_sql
    assert "CREATE TABLE review_queue_items" in combined_sql
    assert "CREATE TABLE jobs" in combined_sql
    assert "CREATE TABLE job_observations" in combined_sql
    assert "CREATE TABLE role_families" in combined_sql
    assert "CREATE TABLE skills" in combined_sql
    assert "CREATE TABLE company_ats_sources" in combined_sql
    assert "ALTER TYPE ats_provider ADD VALUE 'greenhouse'" in combined_sql


def test_discovery_rejects_a_gap_in_versions(tmp_path: Path) -> None:
    (tmp_path / "0001_first.sql").write_text("SELECT 1;\n", encoding="utf-8")
    (tmp_path / "0003_third.sql").write_text("SELECT 3;\n", encoding="utf-8")

    with pytest.raises(MigrationError, match="contiguous"):
        discover_migrations(tmp_path)


def test_discovery_rejects_an_invalid_filename(tmp_path: Path) -> None:
    (tmp_path / "migration.sql").write_text("SELECT 1;\n", encoding="utf-8")

    with pytest.raises(MigrationError, match="Invalid migration filename"):
        discover_migrations(tmp_path)


@pytest.mark.integration
def test_migrations_apply_idempotently_to_postgis() -> None:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")

    first_application = apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    second_application = apply_migrations(database_url, MIGRATIONS_DIRECTORY)

    assert [migration.version for migration in first_application] in (
        [1, 2, 3, 4, 5, 6, 7],
        [],
    )
    assert second_application == ()

    with psycopg.connect(database_url) as connection:
        extensions = {
            row[0]
            for row in connection.execute(
                """
                SELECT extname
                FROM pg_extension
                WHERE extname IN ('postgis', 'pg_trgm', 'pgcrypto')
                """
            )
        }
        tables = {
            row[0]
            for row in connection.execute(
                """
                SELECT tablename
                FROM pg_tables
                WHERE schemaname = 'public'
                  AND tablename IN ('users', 'import_runs', 'raw_snapshots', 'audit_records')
                """
            )
        }

    assert extensions == {"postgis", "pg_trgm", "pgcrypto"}
    assert tables == {"users", "import_runs", "raw_snapshots", "audit_records"}


@pytest.mark.integration
def test_applied_migration_checksum_is_immutable(tmp_path: Path) -> None:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")

    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    for source in MIGRATIONS_DIRECTORY.glob("*.sql"):
        (tmp_path / source.name).write_bytes(source.read_bytes())
    changed = tmp_path / "0002_auth_and_ingestion_foundation.sql"
    changed.write_text(changed.read_text(encoding="utf-8") + "\n-- changed\n", encoding="utf-8")

    with pytest.raises(MigrationError, match="checksum differs"):
        apply_migrations(database_url, tmp_path)


@pytest.mark.integration
def test_ingestion_constraints_and_append_only_audit_log() -> None:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")

    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    unique_suffix = uuid.uuid4().hex
    with psycopg.connect(database_url, autocommit=True) as connection:
        source_id = connection.execute(
            """
            INSERT INTO data_sources (source_key, name, kind)
            VALUES (%s, %s, 'government_open_data')
            RETURNING id
            """,
            (f"integration-{unique_suffix}", "Integration source"),
        ).fetchone()
        assert source_id is not None
        run_id = connection.execute(
            """
            INSERT INTO import_runs (
              run_type, source_id, idempotency_key, scheduled_for, available_at
            )
            VALUES ('integration', %s, %s, now(), now())
            RETURNING id
            """,
            (source_id[0], unique_suffix),
        ).fetchone()
        assert run_id is not None

        with pytest.raises(psycopg.errors.CheckViolation):
            connection.execute(
                "UPDATE import_runs SET status = 'running' WHERE id = %s",
                (run_id[0],),
            )

        checksum = "a" * 64
        for sequence in (1, 2):
            connection.execute(
                """
                INSERT INTO raw_snapshots (
                  source_id, import_run_id, object_key, sha256, content_type,
                  byte_size, retrieved_at
                )
                VALUES (%s, %s, %s, %s, 'application/json', 2, now())
                """,
                (
                    source_id[0],
                    run_id[0],
                    f"integration/{unique_suffix}/{sequence}.json",
                    checksum,
                ),
            )

        audit_id = connection.execute(
            """
            INSERT INTO audit_records (
              actor_type, actor_id, action, target_type, target_id, request_id
            )
            VALUES ('worker', 'integration', 'created', 'import_run', %s, %s)
            RETURNING id
            """,
            (str(run_id[0]), unique_suffix),
        ).fetchone()
        assert audit_id is not None
        with pytest.raises(psycopg.errors.RaiseException, match="append-only"):
            connection.execute(
                "UPDATE audit_records SET action = 'changed' WHERE id = %s",
                (audit_id[0],),
            )
        with pytest.raises(psycopg.errors.RaiseException, match="append-only"):
            connection.execute("TRUNCATE audit_records")


@pytest.mark.integration
def test_geographic_foundation_constraints() -> None:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")

    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    unique_suffix = uuid.uuid4().hex
    with psycopg.connect(database_url, autocommit=True) as connection:
        source_id = connection.execute(
            """
            INSERT INTO data_sources (source_key, name, kind)
            VALUES (%s, %s, 'government_open_data')
            RETURNING id
            """,
            (f"geography-{unique_suffix}", "Geography source"),
        ).fetchone()
        assert source_id is not None

        # Deactivate any release another test already left active for this
        # dataset first (the "one active per dataset" constraint is global
        # across the whole shared test database, not scoped to this test) so
        # the insert below is guaranteed to succeed regardless of ordering,
        # and the *second* insert a few lines down is what actually proves
        # the constraint fires.
        connection.execute(
            """
            UPDATE geography_releases SET is_active = false
            WHERE dataset = 'home_affairs_regional' AND is_active
            """
        )

        release_id = connection.execute(
            """
            INSERT INTO geography_releases (
              dataset, release_version, source_id, effective_from,
              content_hash, is_active, activated_at
            )
            VALUES ('home_affairs_regional', %s, %s, '2026-07-01', %s, true, now())
            RETURNING id
            """,
            (unique_suffix, source_id[0], "b" * 64),
        ).fetchone()
        assert release_id is not None

        with pytest.raises(psycopg.errors.UniqueViolation):
            connection.execute(
                """
                INSERT INTO geography_releases (
                  dataset, release_version, source_id, effective_from,
                  content_hash, is_active, activated_at
                )
                VALUES ('home_affairs_regional', %s, %s, '2026-07-01', %s, true, now())
                """,
                (f"{unique_suffix}-second", source_id[0], "c" * 64),
            )

        region_id = connection.execute(
            """
            INSERT INTO regions (release_id, region_type, code, name, geom)
            VALUES (
              %s, 'sa2', %s, 'Test Region',
              ST_Multi(ST_GeomFromText(
                'POLYGON((151.0 -33.9, 151.1 -33.9, 151.1 -33.8, 151.0 -33.8, 151.0 -33.9))', 4326
              ))
            )
            RETURNING id
            """,
            (release_id[0], f"sa2-{unique_suffix}"),
        ).fetchone()
        assert region_id is not None

        with pytest.raises(psycopg.errors.CheckViolation):
            connection.execute(
                """
                INSERT INTO postcode_rules (release_id, postcode, category, dama_name, valid_from)
                VALUES (%s, '2000', 'category_2', 'Should not be set', '2026-01-01')
                """,
                (release_id[0],),
            )

        connection.execute(
            """
            INSERT INTO postcode_rules (release_id, postcode, category, valid_from)
            VALUES (%s, '2000', 'category_2', '2026-01-01')
            """,
            (release_id[0],),
        )

        with pytest.raises(psycopg.errors.CheckViolation):
            connection.execute(
                """
                INSERT INTO resolved_locations (input_hash, input_text, status)
                VALUES (%s, 'accepted with no point', 'accepted')
                """,
                ("d" * 64,),
            )

        with pytest.raises(psycopg.errors.CheckViolation):
            connection.execute(
                """
                INSERT INTO resolved_locations (input_hash, input_text, status, method, point)
                VALUES (
                  %s, 'out of Australia', 'accepted', 'postcode_centroid',
                  ST_SetSRID(ST_MakePoint(0, 0), 4326)
                )
                """,
                ("e" * 64,),
            )

        accepted_id = connection.execute(
            """
            INSERT INTO resolved_locations (
              input_hash, input_text, status, method, point, sa2_region_id
            )
            VALUES (
              %s, '2000 NSW', 'accepted', 'postcode_centroid',
              ST_SetSRID(ST_MakePoint(151.05, -33.85), 4326), %s
            )
            RETURNING id
            """,
            ("f" * 64, region_id[0]),
        ).fetchone()
        assert accepted_id is not None


@pytest.mark.integration
def test_employer_identity_constraints() -> None:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")

    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    unique_suffix = uuid.uuid4().hex
    with psycopg.connect(database_url, autocommit=True) as connection:
        source_id = connection.execute(
            """
            INSERT INTO data_sources (source_key, name, kind)
            VALUES (%s, %s, 'government_open_data')
            RETURNING id
            """,
            (f"abr-{unique_suffix}", "ABR"),
        ).fetchone()
        assert source_id is not None
        abn = unique_valid_abn(unique_suffix)

        first_company_id = connection.execute(
            """
            INSERT INTO companies (slug, display_name, abn)
            VALUES (%s, 'Example Pty Ltd', %s)
            RETURNING id
            """,
            (f"example-{unique_suffix}", abn),
        ).fetchone()
        assert first_company_id is not None

        with pytest.raises(psycopg.errors.UniqueViolation):
            connection.execute(
                """
                INSERT INTO companies (slug, display_name, abn)
                VALUES (%s, 'Duplicate ABN Pty Ltd', %s)
                """,
                (f"duplicate-{unique_suffix}", abn),
            )

        second_company_id = connection.execute(
            "INSERT INTO companies (slug, display_name) VALUES (%s, 'Merge Target') RETURNING id",
            (f"target-{unique_suffix}",),
        ).fetchone()
        assert second_company_id is not None

        with pytest.raises(psycopg.errors.CheckViolation):
            connection.execute(
                "UPDATE companies SET status = 'merged' WHERE id = %s", (first_company_id[0],)
            )

        connection.execute(
            """
            UPDATE companies SET status = 'merged', merged_into_company_id = %s
            WHERE id = %s
            """,
            (second_company_id[0], first_company_id[0]),
        )

        # A merged company's ABN no longer blocks a fresh registration of it.
        connection.execute(
            """
            INSERT INTO companies (slug, display_name, abn)
            VALUES (%s, 'Reissued ABN Pty Ltd', %s)
            """,
            (f"reissued-{unique_suffix}", abn),
        )

        alias_id = connection.execute(
            """
            INSERT INTO company_aliases (company_id, alias, alias_type, source_id)
            VALUES (%s, 'Example P/L', 'trading_name', %s)
            RETURNING id
            """,
            (first_company_id[0], source_id[0]),
        ).fetchone()
        assert alias_id is not None

        review_id = connection.execute(
            """
            INSERT INTO review_queue_items (kind, company_id, source_id)
            VALUES ('candidate_match', %s, %s)
            RETURNING id
            """,
            (first_company_id[0], source_id[0]),
        ).fetchone()
        assert review_id is not None

        with pytest.raises(psycopg.errors.CheckViolation):
            connection.execute(
                "UPDATE review_queue_items SET status = 'approved' WHERE id = %s",
                (review_id[0],),
            )
