from __future__ import annotations

import os
import uuid
from pathlib import Path

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.employers.seed import (
    DEFAULT_FIXTURE_PATH,
    SeedImportError,
    _parse_confidence,
    load_seed_fixture,
    run_seed_import,
)

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


def _write_fixture(path: Path, rows: list[tuple[str, str, str, str, str, str]]) -> None:
    lines = ['"name","domain","careers_url","city","reason","confidence"']
    for name, domain, careers_url, city, reason, confidence in rows:
        lines.append(
            f'"{name}","{domain}","{careers_url}","{city}","{reason}","{confidence}"'
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_parse_confidence_splits_tier_from_note() -> None:
    assert _parse_confidence("High") == ("High", None)
    assert _parse_confidence("Medium - verify headcount") == (
        "Medium",
        "verify headcount",
    )


def test_parse_confidence_rejects_unknown_tier() -> None:
    with pytest.raises(SeedImportError, match="unrecognised confidence tier"):
        _parse_confidence("Unsure")


def test_default_fixture_exists_and_parses() -> None:
    assert DEFAULT_FIXTURE_PATH.exists()
    candidates = load_seed_fixture()
    assert len(candidates) == 135
    low_confidence = [c for c in candidates if c.confidence_tier == "Low"]
    assert {c.display_name for c in low_confidence} == {"Tritium", "Openpay"}
    assert all(c.city for c in candidates)


@pytest.mark.integration
def test_run_seed_import_creates_and_skips_low_confidence(tmp_path: Path) -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    fixture_path = tmp_path / "seed.csv"
    _write_fixture(
        fixture_path,
        [
            (
                f"High Co {suffix}",
                f"high-{suffix}.example.com",
                "https://example.com/careers",
                "Sydney",
                "a real employer",
                "High",
            ),
            (
                f"Medium Co {suffix}",
                f"medium-{suffix}.example.com",
                "https://example.com/careers",
                "Melbourne",
                "probably real",
                "Medium - verify headcount",
            ),
            (
                f"Defunct Co {suffix}",
                f"defunct-{suffix}.example.com",
                "https://example.com/careers",
                "Brisbane",
                "in administration",
                "Low - entered administration",
            ),
        ],
    )

    stats = run_seed_import(database_url, fixture_path)

    assert stats.created == 2
    assert stats.matched == 0
    assert stats.review == 0
    assert stats.skipped_low_confidence == (f"Defunct Co {suffix}",)
    assert stats.errors == ()

    with psycopg.connect(database_url) as connection:
        created_names = connection.execute(
            "SELECT display_name FROM companies WHERE domain LIKE %s ORDER BY display_name",
            (f"%-{suffix}.example.com",),
        ).fetchall()
        evidence_count = connection.execute(
            """
            SELECT count(*) FROM evidence
            WHERE claim_type = 'employer_seed_research'
              AND entity_id IN (
                SELECT id::text FROM companies WHERE domain LIKE %s
              )
            """,
            (f"%-{suffix}.example.com",),
        ).fetchone()
    assert created_names == [(f"High Co {suffix}",), (f"Medium Co {suffix}",)]
    assert evidence_count == (2,)


@pytest.mark.integration
def test_run_seed_import_is_idempotent_on_domain(tmp_path: Path) -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    fixture_path = tmp_path / "seed.csv"
    _write_fixture(
        fixture_path,
        [
            (
                f"Repeat Co {suffix}",
                f"repeat-{suffix}.example.com",
                "https://example.com/careers",
                "Sydney",
                "a real employer",
                "High",
            ),
        ],
    )

    first = run_seed_import(database_url, fixture_path)
    second = run_seed_import(database_url, fixture_path)

    assert first.created == 1
    assert second.created == 0
    assert second.matched == 1
    with psycopg.connect(database_url) as connection:
        count = connection.execute(
            "SELECT count(*) FROM companies WHERE domain = %s",
            (f"repeat-{suffix}.example.com",),
        ).fetchone()
    assert count == (1,)
