from __future__ import annotations

import os
import uuid
from pathlib import Path

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.employers.geocoding import GeocodeResult, GeocodingError
from austechmap_ingestion.employers.locations_seed import (
    DEFAULT_FIXTURE_PATH,
    AddressCandidate,
    GeocodeFn,
    _query_text,
    _query_variants,
    load_address_fixture,
    run_location_seed_import,
)
from austechmap_ingestion.employers.seed import DEFAULT_FIXTURE_PATH as EMPLOYER_FIXTURE_PATH
from austechmap_ingestion.employers.seed import load_seed_fixture

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


def _write_fixture(path: Path, rows: list[tuple[str, str, str, str, str, str, str]]) -> None:
    lines = ['domain,street_address,suburb,state,postcode,source_confidence,source_note']
    for domain, street, suburb, state, postcode, confidence, note in rows:
        lines.append(f'{domain},"{street}",{suburb},{state},{postcode},{confidence},"{note}"')
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _fake_geocoder(longitude: float, latitude: float) -> tuple[list[str], GeocodeFn]:
    calls: list[str] = []

    def geocode(_token: str, query_text: str) -> GeocodeResult:
        calls.append(query_text)
        return GeocodeResult(longitude=longitude, latitude=latitude, full_address=query_text)

    return calls, geocode


def test_query_text_formats_the_full_address() -> None:
    candidate = AddressCandidate(
        domain="example.com",
        street_address="341 George Street",
        suburb="Sydney",
        state="NSW",
        postcode="2000",
        source_confidence="High",
        source_note="test",
    )
    assert _query_text(candidate) == "341 George Street, Sydney NSW 2000, Australia"


def test_query_variants_strips_leading_level_and_suite_segments() -> None:
    candidate = AddressCandidate(
        domain="example.com",
        street_address="Level 7, Suite 7.01, 155 Clarence Street",
        suburb="Sydney",
        state="NSW",
        postcode="2000",
        source_confidence="High",
        source_note="test",
    )
    variants = _query_variants(candidate)
    assert variants[0] == "Level 7, Suite 7.01, 155 Clarence Street, Sydney NSW 2000, Australia"
    assert "Suite 7.01, 155 Clarence Street, Sydney NSW 2000, Australia" in variants
    assert "155 Clarence Street, Sydney NSW 2000, Australia" in variants
    assert variants[-1] == "Sydney NSW 2000, Australia"


def test_query_variants_strips_unit_slash_prefix() -> None:
    candidate = AddressCandidate(
        domain="example.com",
        street_address="1/61-63 Primary School Court",
        suburb="Maroochydore",
        state="QLD",
        postcode="4558",
        source_confidence="High",
        source_note="test",
    )
    variants = _query_variants(candidate)
    assert "61-63 Primary School Court, Maroochydore QLD 4558, Australia" in variants


def test_query_variants_has_no_duplicates_for_a_simple_address() -> None:
    candidate = AddressCandidate(
        domain="example.com",
        street_address="341 George Street",
        suburb="Sydney",
        state="NSW",
        postcode="2000",
        source_confidence="High",
        source_note="test",
    )
    variants = _query_variants(candidate)
    assert variants == [
        "341 George Street, Sydney NSW 2000, Australia",
        "Sydney NSW 2000, Australia",
    ]


def test_default_fixture_exists_and_matches_employer_fixture_domains() -> None:
    assert DEFAULT_FIXTURE_PATH.exists()
    addresses = load_address_fixture()
    assert len(addresses) == 133

    employers = load_seed_fixture(EMPLOYER_FIXTURE_PATH)
    seeded_domains = {
        c.domain for c in employers if c.confidence_tier != "Low" and c.domain is not None
    }
    address_domains = {a.domain for a in addresses}
    assert address_domains <= seeded_domains


@pytest.mark.integration
def test_run_location_seed_import_resolves_and_links(tmp_path: Path) -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    domain = f"geocode-{suffix}.example.com"
    fixture_path = tmp_path / "addresses.csv"
    _write_fixture(
        fixture_path,
        [(domain, "341 George Street", f"Sydney {suffix}", "NSW", "2000", "High", "test office")],
    )

    with psycopg.connect(database_url, autocommit=True) as connection:
        inserted = connection.execute(
            "INSERT INTO companies (slug, display_name, domain) VALUES (%s, %s, %s) RETURNING id",
            (f"geocode-co-{suffix}", f"Geocode Co {suffix}", domain),
        ).fetchone()
        assert inserted is not None
        company_id = inserted[0]

    calls, geocode = _fake_geocoder(151.2093, -33.8688)
    stats = run_location_seed_import(
        database_url, "fake-token", fixture_path, geocode_fn=geocode
    )

    assert stats.resolved == 1
    assert stats.reused == 0
    assert stats.errors == ()
    assert stats.unmatched_domains == ()
    assert len(calls) == 1

    with psycopg.connect(database_url) as connection:
        location = connection.execute(
            """
            SELECT cl.location_type, ST_X(rl.point), ST_Y(rl.point), rl.method, rl.status
            FROM company_locations cl
            JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
            WHERE cl.company_id = %s
            """,
            (company_id,),
        ).fetchone()
    assert location == ("head_office", 151.2093, -33.8688, "external_geocoder", "accepted")


@pytest.mark.integration
def test_run_location_seed_import_is_idempotent_on_retry(tmp_path: Path) -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    domain = f"repeat-geocode-{suffix}.example.com"
    fixture_path = tmp_path / "addresses.csv"
    _write_fixture(
        fixture_path,
        [(domain, "1 Test Street", f"Melbourne {suffix}", "VIC", "3000", "High", "test office")],
    )

    with psycopg.connect(database_url, autocommit=True) as connection:
        inserted = connection.execute(
            "INSERT INTO companies (slug, display_name, domain) VALUES (%s, %s, %s) RETURNING id",
            (f"repeat-co-{suffix}", f"Repeat Co {suffix}", domain),
        ).fetchone()
        assert inserted is not None
        company_id = inserted[0]

    _, geocode = _fake_geocoder(144.9631, -37.8136)
    first = run_location_seed_import(database_url, "fake-token", fixture_path, geocode_fn=geocode)
    second = run_location_seed_import(database_url, "fake-token", fixture_path, geocode_fn=geocode)

    assert first.resolved == 1
    assert second.resolved == 0
    assert second.reused == 1
    with psycopg.connect(database_url) as connection:
        count = connection.execute(
            "SELECT count(*) FROM company_locations WHERE company_id = %s", (company_id,)
        ).fetchone()
    assert count == (1,)


@pytest.mark.integration
def test_run_location_seed_import_falls_back_past_unit_prefix(tmp_path: Path) -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    domain = f"fallback-{suffix}.example.com"
    fixture_path = tmp_path / "addresses.csv"
    suburb = f"Sydney {suffix}"
    _write_fixture(
        fixture_path,
        [
            (
                domain,
                "Level 6, 341 George Street",
                suburb,
                "NSW",
                "2000",
                "High",
                "test office",
            )
        ],
    )

    with psycopg.connect(database_url, autocommit=True) as connection:
        inserted = connection.execute(
            "INSERT INTO companies (slug, display_name, domain) VALUES (%s, %s, %s) RETURNING id",
            (f"fallback-co-{suffix}", f"Fallback Co {suffix}", domain),
        ).fetchone()
        assert inserted is not None
        company_id = inserted[0]

    calls: list[str] = []

    def flaky_geocode(_token: str, query_text: str) -> GeocodeResult:
        calls.append(query_text)
        if "Level 6" in query_text:
            raise GeocodingError(f"no geocoding match for: {query_text!r}")
        return GeocodeResult(longitude=151.2093, latitude=-33.8688, full_address=query_text)

    stats = run_location_seed_import(
        database_url, "fake-token", fixture_path, geocode_fn=flaky_geocode
    )

    assert stats.resolved == 1
    assert stats.errors == ()
    assert calls == [
        f"Level 6, 341 George Street, {suburb} NSW 2000, Australia",
        f"341 George Street, {suburb} NSW 2000, Australia",
    ]

    with psycopg.connect(database_url) as connection:
        input_text = connection.execute(
            """
            SELECT rl.input_text
            FROM company_locations cl
            JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
            WHERE cl.company_id = %s
            """,
            (company_id,),
        ).fetchone()
    assert input_text == (f"341 George Street, {suburb} NSW 2000, Australia",)


@pytest.mark.integration
def test_run_location_seed_import_reports_unmatched_domain(tmp_path: Path) -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    domain = f"missing-{suffix}.example.com"
    fixture_path = tmp_path / "addresses.csv"
    _write_fixture(
        fixture_path,
        [(domain, "1 Nowhere Street", "Perth", "WA", "6000", "High", "no such company seeded")],
    )

    _, geocode = _fake_geocoder(115.8613, -31.9523)
    stats = run_location_seed_import(database_url, "fake-token", fixture_path, geocode_fn=geocode)

    assert stats.unmatched_domains == (domain,)
    assert stats.resolved == 0
