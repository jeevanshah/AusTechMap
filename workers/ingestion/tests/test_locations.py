from __future__ import annotations

import os
import struct
import uuid
from datetime import date
from pathlib import Path

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.geography.asgs import AsgsFeature, load_asgs_release
from austechmap_ingestion.geography.locations import (
    is_within_australian_bounds,
    lookup_migration_category,
    resolve_location,
)
from austechmap_ingestion.jobs import JobRepository

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


def _wkb_polygon(coords: list[tuple[float, float]]) -> bytes:
    ring = struct.pack("<I", len(coords)) + b"".join(struct.pack("<dd", x, y) for x, y in coords)
    return struct.pack("<B", 1) + struct.pack("<I", 3) + struct.pack("<I", 1) + ring


# Both squares straddle 151.05, -33.85 (inside Sydney's bounding box), used as
# the "postcode centroid" test point throughout this file.
_SQUARE_A = [(151.0, -33.9), (151.1, -33.9), (151.1, -33.8), (151.0, -33.8), (151.0, -33.9)]
_SQUARE_OVERLAP = [
    (151.02, -33.88),
    (151.08, -33.88),
    (151.08, -33.82),
    (151.02, -33.82),
    (151.02, -33.88),
]
_OUTSIDE_AUSTRALIA = [(0.0, 0.0), (0.1, 0.0), (0.1, 0.1), (0.0, 0.1), (0.0, 0.0)]


def _activate_geography_release(
    connection: psycopg.Connection[tuple[object, ...]],
    *,
    dataset: str,
    release_version: str,
    source_id: uuid.UUID,
    effective_from: date,
    content_hash: str,
) -> uuid.UUID:
    """Directly activate a geography_releases row, superseding any prior
    active release for the same dataset first (mirrors load_asgs_release's
    own pointer-flip logic) so this helper is safe regardless of what other
    tests have already done to this dataset value."""
    connection.execute(
        """
        UPDATE geography_releases SET is_active = false, effective_to = %s
        WHERE dataset = %s AND is_active
        """,
        (effective_from, dataset),
    )
    row = connection.execute(
        """
        INSERT INTO geography_releases (
          dataset, release_version, source_id, effective_from,
          content_hash, is_active, activated_at
        )
        VALUES (%s, %s, %s, %s, %s, true, now())
        RETURNING id
        """,
        (dataset, release_version, source_id, effective_from, content_hash),
    ).fetchone()
    assert row is not None
    return uuid.UUID(str(row[0]))


@pytest.mark.parametrize(
    ("longitude", "latitude", "expected"),
    [
        (151.05, -33.85, True),  # Sydney
        (0.0, 0.0, False),  # off the coast of Africa
        (200.0, -33.85, False),  # longitude out of range
        (151.05, 50.0, False),  # latitude out of range
    ],
)
def test_is_within_australian_bounds(longitude: float, latitude: float, expected: bool) -> None:
    assert is_within_australian_bounds(longitude, latitude) is expected


@pytest.mark.integration
def test_resolve_location_accepted_with_full_region_hierarchy() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"asgs-{suffix}", name="ABS ASGS", kind="government_open_data"
    )
    postcode = "2000"
    load_asgs_release(
        database_url,
        region_type="sa2",
        release_version=f"sa2-{suffix}",
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 7, 1),
        content_hash="1" * 64,
        features=[AsgsFeature("101021007", "Sydney", None, _wkb_polygon(_SQUARE_A))],
    )
    load_asgs_release(
        database_url,
        region_type="lga",
        release_version=f"lga-{suffix}",
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 7, 1),
        content_hash="2" * 64,
        features=[AsgsFeature("10050", "City of Sydney", None, _wkb_polygon(_SQUARE_A))],
    )
    load_asgs_release(
        database_url,
        region_type="poa",
        release_version=f"poa-{suffix}",
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 7, 1),
        content_hash="3" * 64,
        features=[AsgsFeature(postcode, "Sydney", None, _wkb_polygon(_SQUARE_A))],
    )

    result = resolve_location(
        database_url, input_text=postcode, postcode=postcode, as_of=date(2026, 7, 15)
    )

    assert result.status == "accepted"
    assert result.longitude is not None and result.latitude is not None
    assert 151.0 < result.longitude < 151.1
    assert -33.9 < result.latitude < -33.8
    assert set(result.regions) == {"sa2", "lga", "poa"}
    assert result.regions["sa2"].code == "101021007"
    assert result.regions["lga"].code == "10050"
    assert result.regions["poa"].code == postcode


@pytest.mark.integration
def test_resolve_location_ambiguous_when_regions_overlap() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"asgs-{suffix}", name="ABS ASGS", kind="government_open_data"
    )
    postcode = "2001"
    load_asgs_release(
        database_url,
        region_type="sa2",
        release_version=f"sa2-{suffix}",
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 7, 1),
        content_hash="4" * 64,
        features=[
            AsgsFeature("101021007", "Sydney", None, _wkb_polygon(_SQUARE_A)),
            AsgsFeature("101021999", "Overlap", None, _wkb_polygon(_SQUARE_OVERLAP)),
        ],
    )
    load_asgs_release(
        database_url,
        region_type="poa",
        release_version=f"poa-{suffix}",
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 7, 1),
        content_hash="5" * 64,
        features=[AsgsFeature(postcode, "Sydney", None, _wkb_polygon(_SQUARE_A))],
    )

    result = resolve_location(
        database_url, input_text=postcode, postcode=postcode, as_of=date(2026, 7, 15)
    )

    assert result.status == "ambiguous"
    assert result.longitude is None
    assert result.regions == {}


@pytest.mark.integration
def test_resolve_location_no_match_for_unknown_postcode() -> None:
    database_url = _database_url()
    postcode = f"9{uuid.uuid4().int % 1000:03d}"

    result = resolve_location(
        database_url, input_text=postcode, postcode=postcode, as_of=date(2026, 7, 15)
    )

    assert result.status == "no_match"


@pytest.mark.integration
def test_resolve_location_out_of_bounds() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"asgs-{suffix}", name="ABS ASGS", kind="government_open_data"
    )
    postcode = "0001"
    load_asgs_release(
        database_url,
        region_type="poa",
        release_version=f"poa-{suffix}",
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 7, 1),
        content_hash="6" * 64,
        features=[AsgsFeature(postcode, "Not Australia", None, _wkb_polygon(_OUTSIDE_AUSTRALIA))],
    )

    result = resolve_location(
        database_url, input_text=postcode, postcode=postcode, as_of=date(2026, 7, 15)
    )

    assert result.status == "out_of_bounds"
    assert result.longitude is None


@pytest.mark.integration
def test_resolve_location_is_idempotent() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"asgs-{suffix}", name="ABS ASGS", kind="government_open_data"
    )
    postcode = "2010"
    load_asgs_release(
        database_url,
        region_type="poa",
        release_version=f"poa-{suffix}",
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 7, 1),
        content_hash="7" * 64,
        features=[AsgsFeature(postcode, "Surry Hills", None, _wkb_polygon(_SQUARE_A))],
    )

    first = resolve_location(
        database_url, input_text=postcode, postcode=postcode, as_of=date(2026, 7, 15)
    )
    second = resolve_location(
        database_url, input_text=postcode, postcode=postcode, as_of=date(2026, 7, 15)
    )

    assert first.id == second.id
    with psycopg.connect(database_url) as connection:
        count = connection.execute(
            "SELECT count(*) FROM resolved_locations WHERE id = %s", (first.id,)
        ).fetchone()
    assert count == (1,)


@pytest.mark.integration
def test_lookup_migration_category_prefers_dama() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"home-affairs-{suffix}", name="Home Affairs", kind="government_open_data"
    )
    postcode = "2620"
    with psycopg.connect(database_url, autocommit=True) as connection:
        release_id = _activate_geography_release(
            connection,
            dataset="home_affairs_dama",
            release_version=suffix,
            source_id=source_id,
            effective_from=date(2026, 1, 1),
            content_hash="8" * 64,
        )
        connection.execute(
            """
            INSERT INTO postcode_rules (release_id, postcode, category, valid_from)
            VALUES (%s, %s, 'category_2', '2026-01-01')
            """,
            (release_id, postcode),
        )
        connection.execute(
            """
            INSERT INTO postcode_rules (release_id, postcode, category, dama_name, valid_from)
            VALUES (%s, %s, 'dama', 'Regional DAMA', '2026-01-01')
            """,
            (release_id, postcode),
        )

        result = lookup_migration_category(connection, postcode, date(2026, 7, 1))

    assert result == ("dama", "Regional DAMA")
