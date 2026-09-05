from __future__ import annotations

import hashlib
import itertools
import os
import struct
import uuid
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.geography.asgs import AsgsFeature, load_asgs_release
from austechmap_ingestion.geography.gnaf import GnafMatchResult
from austechmap_ingestion.geography.gnaf_upgrade import (
    activate_gnaf_release,
    apply_gnaf_match_to_location,
    apply_gnaf_matches,
)
from austechmap_ingestion.geography.types import GeographyImportError
from austechmap_ingestion.jobs import JobRepository

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"

# Deliberately far from other test files' synthetic region footprints --
# resolve_point checks every active region regardless of which test or
# dataset created it, so reusing another file's coordinates would leak
# false matches (same reasoning as test_locations.py's own comment).
_SQUARE = [(133.8, -23.7), (133.9, -23.7), (133.9, -23.6), (133.8, -23.6), (133.8, -23.7)]
_INSIDE_SQUARE = (133.85, -23.65)
_OUTSIDE_EVERYTHING = (140.0, -25.0)


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


def _wkb_polygon(coords: list[tuple[float, float]]) -> bytes:
    ring = struct.pack("<I", len(coords)) + b"".join(struct.pack("<dd", x, y) for x, y in coords)
    return struct.pack("<B", 1) + struct.pack("<I", 3) + struct.pack("<I", 1) + ring


# dataset='gnaf' is shared, real state across every test in this file
# (unlike release_version, which is uuid-suffixed) -- activating a
# release deactivates whatever the *previous* activation anywhere in this
# file left active, and geography_releases' `effective_to >= effective_from`
# CHECK means each call's effective_from must never be earlier than
# whatever's currently active. A hardcoded date here previously caused a
# real CI failure, the same shared-test-state class of bug fixed twice
# earlier this session in test_taxonomy_seed.py/test_category_seed.py.
# This counter guarantees every call in this file gets a strictly later
# date than the last, regardless of how many tests exist or their order
# (pytest runs a single file's tests sequentially, in definition order,
# with no xdist/randomization configured here).
_gnaf_effective_from_counter = itertools.count()


def _next_gnaf_effective_from() -> date:
    return date(2026, 8, 1) + timedelta(days=next(_gnaf_effective_from_counter))


def _insert_interim_resolved_location(
    connection: psycopg.Connection[tuple[object, ...]], *, input_text: str
) -> uuid.UUID:
    """A minimal resolved_locations row simulating Phase 3's existing
    interim Nominatim state, at a point far from _SQUARE -- the "before"
    state an upgrade should overwrite."""
    input_hash = hashlib.sha256(input_text.encode()).hexdigest()
    row = connection.execute(
        """
        INSERT INTO resolved_locations (input_hash, input_text, status, method, point)
        VALUES (%s, %s, 'accepted', 'external_geocoder',
                ST_SetSRID(ST_MakePoint(151.2, -33.9), 4326))
        RETURNING id
        """,
        (input_hash, input_text),
    ).fetchone()
    assert row is not None
    return uuid.UUID(str(row[0]))


@pytest.mark.integration
def test_activate_gnaf_release_creates_and_activates_a_release() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"gnaf-{suffix}", name="G-NAF", kind="government_open_data"
    )

    release_id = activate_gnaf_release(
        database_url,
        release_version=suffix,
        source_id=source_id,
        effective_from=_next_gnaf_effective_from(),
        content_hash="a" * 64,
        row_count=16_970_406,
    )

    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            "SELECT dataset, is_active, row_count FROM geography_releases WHERE id = %s",
            (release_id,),
        ).fetchone()
    assert row == ("gnaf", True, 16_970_406)


@pytest.mark.integration
def test_activate_gnaf_release_is_idempotent_on_retry() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"gnaf-{suffix}", name="G-NAF", kind="government_open_data"
    )
    kwargs = dict(
        release_version=suffix,
        source_id=source_id,
        effective_from=_next_gnaf_effective_from(),
        content_hash="b" * 64,
        row_count=100,
    )

    first = activate_gnaf_release(database_url, **kwargs)  # type: ignore[arg-type]
    second = activate_gnaf_release(database_url, **kwargs)  # type: ignore[arg-type]

    assert first == second


@pytest.mark.integration
def test_activate_gnaf_release_rejects_mismatched_row_count_on_retry() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"gnaf-{suffix}", name="G-NAF", kind="government_open_data"
    )
    retry_effective_from = _next_gnaf_effective_from()
    activate_gnaf_release(
        database_url,
        release_version=suffix,
        source_id=source_id,
        effective_from=retry_effective_from,
        content_hash="c" * 64,
        row_count=100,
    )

    with pytest.raises(GeographyImportError, match="already has"):
        activate_gnaf_release(
            database_url,
            release_version=suffix,
            source_id=source_id,
            effective_from=retry_effective_from,
            content_hash="c" * 64,
            row_count=200,
        )


@pytest.mark.integration
def test_activate_gnaf_release_deactivates_the_previous_release() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"gnaf-{suffix}", name="G-NAF", kind="government_open_data"
    )

    first_effective_from = _next_gnaf_effective_from()
    second_effective_from = _next_gnaf_effective_from()
    first = activate_gnaf_release(
        database_url,
        release_version=f"v1-{suffix}",
        source_id=source_id,
        effective_from=first_effective_from,
        content_hash="d" * 64,
        row_count=100,
    )
    second = activate_gnaf_release(
        database_url,
        release_version=f"v2-{suffix}",
        source_id=source_id,
        effective_from=second_effective_from,
        content_hash="e" * 64,
        row_count=200,
    )

    with psycopg.connect(database_url) as connection:
        first_state = connection.execute(
            "SELECT is_active, effective_to FROM geography_releases WHERE id = %s", (first,)
        ).fetchone()
        second_state = connection.execute(
            "SELECT is_active FROM geography_releases WHERE id = %s", (second,)
        ).fetchone()
    assert first_state == (False, second_effective_from)
    assert second_state == (True,)


@pytest.mark.integration
def test_apply_gnaf_match_to_location_upgrades_the_row_and_records_prior_state() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"gnaf-upgrade-{suffix}", name="G-NAF upgrade test", kind="derived"
    )
    load_asgs_release(
        database_url,
        region_type="sa2",
        release_version=f"sa2-{suffix}",
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 7, 1),
        content_hash="1" * 64,
        features=[AsgsFeature("999021007", "Alice Springs Test", None, _wkb_polygon(_SQUARE))],
    )
    gnaf_release_id = activate_gnaf_release(
        database_url,
        release_version=f"gnaf-{suffix}",
        source_id=source_id,
        effective_from=_next_gnaf_effective_from(),
        content_hash="2" * 64,
        row_count=1,
    )

    with psycopg.connect(database_url) as connection:
        resolved_location_id = _insert_interim_resolved_location(
            connection, input_text=f"1 Test Street, Testville {suffix}"
        )
        connection.commit()

    match = GnafMatchResult(
        input_id="row-1",
        status="accepted",
        address_detail_pid="GATEST0000001",
        longitude=_INSIDE_SQUARE[0],
        latitude=_INSIDE_SQUARE[1],
        candidate_count=1,
    )
    observed_at = datetime(2026, 9, 5, tzinfo=UTC)
    with psycopg.connect(database_url) as connection, connection.transaction():
        apply_gnaf_match_to_location(
            connection,
            resolved_location_id=resolved_location_id,
            match=match,
            gnaf_release_id=gnaf_release_id,
            source_id=source_id,
            now=observed_at,
        )

    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            """
            SELECT method, matched_gnaf_pid, gnaf_release_id,
                   ST_X(point), ST_Y(point), sa2_region_id
            FROM resolved_locations WHERE id = %s
            """,
            (resolved_location_id,),
        ).fetchone()
        evidence_row = connection.execute(
            """
            SELECT claim_value FROM evidence
            WHERE entity_type = 'resolved_location' AND entity_id = %s
              AND claim_type = 'gnaf_upgrade_prior_state'
            """,
            (str(resolved_location_id),),
        ).fetchone()
    assert row is not None
    method, pid, release_id, lng, lat, sa2_region_id = row
    assert method == "gnaf_exact_match"
    assert pid == "GATEST0000001"
    assert release_id == gnaf_release_id
    assert lng == pytest.approx(_INSIDE_SQUARE[0])
    assert lat == pytest.approx(_INSIDE_SQUARE[1])
    assert sa2_region_id is not None
    assert evidence_row is not None
    assert evidence_row[0]["previous_method"] == "external_geocoder"


@pytest.mark.integration
def test_apply_gnaf_match_to_location_rejects_a_non_accepted_match() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"gnaf-upgrade-reject-{suffix}", name="G-NAF upgrade test", kind="derived"
    )
    gnaf_release_id = activate_gnaf_release(
        database_url,
        release_version=f"gnaf-{suffix}",
        source_id=source_id,
        effective_from=_next_gnaf_effective_from(),
        content_hash="3" * 64,
        row_count=1,
    )
    with psycopg.connect(database_url) as connection:
        resolved_location_id = _insert_interim_resolved_location(
            connection, input_text=f"2 Test Street, Testville {suffix}"
        )
        connection.commit()

    ambiguous_match = GnafMatchResult(
        input_id="row-2", status="ambiguous", address_detail_pid=None,
        longitude=None, latitude=None, candidate_count=3,
    )
    with (
        psycopg.connect(database_url) as connection,
        connection.transaction(),
        pytest.raises(GeographyImportError, match="non-accepted"),
    ):
        apply_gnaf_match_to_location(
            connection,
            resolved_location_id=resolved_location_id,
            match=ambiguous_match,
            gnaf_release_id=gnaf_release_id,
            source_id=source_id,
        )

    with psycopg.connect(database_url) as connection:
        method = connection.execute(
            "SELECT method FROM resolved_locations WHERE id = %s", (resolved_location_id,)
        ).fetchone()
    assert method == ("external_geocoder",)


@pytest.mark.integration
def test_apply_gnaf_matches_skips_non_accepted_and_applies_accepted() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"gnaf-upgrade-batch-{suffix}", name="G-NAF upgrade test", kind="derived"
    )
    gnaf_release_id = activate_gnaf_release(
        database_url,
        release_version=f"gnaf-{suffix}",
        source_id=source_id,
        effective_from=_next_gnaf_effective_from(),
        content_hash="4" * 64,
        row_count=1,
    )
    with psycopg.connect(database_url) as connection:
        accepted_id = _insert_interim_resolved_location(
            connection, input_text=f"3 Test Street, Testville {suffix}"
        )
        skipped_id = _insert_interim_resolved_location(
            connection, input_text=f"4 Test Street, Testville {suffix}"
        )
        connection.commit()

    stats = apply_gnaf_matches(
        database_url,
        gnaf_release_id=gnaf_release_id,
        source_id=source_id,
        matches=[
            (
                accepted_id,
                GnafMatchResult(
                    input_id="row-3", status="accepted", address_detail_pid="GATEST0000002",
                    longitude=_OUTSIDE_EVERYTHING[0], latitude=_OUTSIDE_EVERYTHING[1],
                    candidate_count=1,
                ),
            ),
            (
                skipped_id,
                GnafMatchResult(
                    input_id="row-4", status="no_match", address_detail_pid=None,
                    longitude=None, latitude=None, candidate_count=0,
                ),
            ),
        ],
    )

    assert stats.upgraded == 1
    assert stats.skipped_not_accepted == 1
    with psycopg.connect(database_url) as connection:
        methods = connection.execute(
            "SELECT id, method FROM resolved_locations WHERE id IN (%s, %s)",
            (accepted_id, skipped_id),
        ).fetchall()
    methods_by_id: dict[uuid.UUID, str] = dict(methods)
    assert methods_by_id[accepted_id] == "gnaf_exact_match"
    assert methods_by_id[skipped_id] == "external_geocoder"
