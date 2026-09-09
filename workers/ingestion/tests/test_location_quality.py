from __future__ import annotations

import os
import uuid
from pathlib import Path

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.employers.geocoding import GeocodeResult
from austechmap_ingestion.employers.location_quality import (
    LocationQualityError,
    quarantine_low_specificity_locations,
    street_address_lacks_number,
    validate_low_specificity_candidates,
)
from austechmap_ingestion.employers.locations_seed import (
    AddressCandidate,
    run_location_seed_import,
)

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


def _write_fixture(path: Path, rows: list[tuple[str, str, str, str, str]]) -> None:
    lines = ["domain,street_address,suburb,state,postcode,source_confidence,source_note"]
    for domain, street, suburb, state, postcode in rows:
        lines.append(f'{domain},"{street}",{suburb},{state},{postcode},High,"test"')
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def test_street_address_lacks_number() -> None:
    assert street_address_lacks_number("George Street")
    assert not street_address_lacks_number("341 George Street")


def test_validation_refuses_a_mixed_specificity_fixture() -> None:
    candidates = [
        AddressCandidate("generic.example", "George Street", "Sydney", "NSW", "2000", "High", "x"),
        AddressCandidate(
            "specific.example", "341 George Street", "Sydney", "NSW", "2000", "High", "x"
        ),
    ]
    with pytest.raises(LocationQualityError, match="mixed-specificity"):
        validate_low_specificity_candidates(candidates)


@pytest.mark.integration
def test_quarantine_hides_low_specificity_location_and_audits(tmp_path: Path) -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    domains = (f"quality-one-{suffix}.example.com", f"quality-two-{suffix}.example.com")
    fixture_path = tmp_path / "unsupported-addresses.csv"
    _write_fixture(
        fixture_path,
        [(domain, "George Street", "Sydney", "NSW", "2000") for domain in domains],
    )

    with psycopg.connect(database_url, autocommit=True) as connection:
        for index, domain in enumerate(domains):
            connection.execute(
                "INSERT INTO companies (slug, display_name, domain) VALUES (%s, %s, %s)",
                (f"quality-{suffix}-{index}", f"Quality {suffix} {index}", domain),
            )

    def geocode(_token: str, query: str) -> GeocodeResult:
        return GeocodeResult(151.2093, -33.8688, query)

    run_location_seed_import(database_url, "unused", fixture_path, geocode_fn=geocode)
    preview = quarantine_low_specificity_locations(
        database_url,
        fixture_path=fixture_path,
        actor_id="test-cleanup",
        reason="test unsupported address fixture",
    )
    assert preview.affected_locations == 1
    assert preview.affected_companies == 2
    assert not preview.applied

    applied = quarantine_low_specificity_locations(
        database_url,
        fixture_path=fixture_path,
        actor_id="test-cleanup",
        reason="test unsupported address fixture",
        apply=True,
    )
    assert applied.affected_locations == 1
    with psycopg.connect(database_url) as connection:
        location = connection.execute(
            """
            SELECT rl.status, rl.point IS NULL
            FROM resolved_locations rl
            JOIN company_locations cl ON cl.resolved_location_id = rl.id
            JOIN companies c ON c.id = cl.company_id
            WHERE c.domain = %s
            """,
            (domains[0],),
        ).fetchone()
        audits = connection.execute(
            """
            SELECT count(*) FROM audit_records
            WHERE action = 'location_quarantined_low_specificity'
              AND actor_id = 'test-cleanup'
            """
        ).fetchone()
    assert location == ("ambiguous", True)
    assert audits == (1,)

    retry = quarantine_low_specificity_locations(
        database_url,
        fixture_path=fixture_path,
        actor_id="test-cleanup",
        reason="test unsupported address fixture",
        apply=True,
    )
    assert retry.affected_locations == 0
