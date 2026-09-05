from __future__ import annotations

import os
import struct
import uuid
from datetime import date
from pathlib import Path

import numpy as np
import psycopg
import pytest
from pyogrio.raw import write as ogr_write

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.geography.asgs import (
    AsgsFeature,
    AsgsFieldMapping,
    load_asgs_release,
    parse_asgs_boundary_file,
    run_asgs_import,
)
from austechmap_ingestion.geography.types import GeographyImportError
from austechmap_ingestion.jobs import JobRepository
from austechmap_ingestion.storage import FilesystemSnapshotStore

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


_SQUARE_A = [(151.0, -33.9), (151.1, -33.9), (151.1, -33.8), (151.0, -33.8), (151.0, -33.9)]
_SQUARE_B = [(150.0, -33.9), (150.1, -33.9), (150.1, -33.8), (150.0, -33.8), (150.0, -33.9)]


def _write_sa2_geopackage(path: Path) -> None:
    geometries = np.array([_wkb_polygon(_SQUARE_A), _wkb_polygon(_SQUARE_B)], dtype=object)
    codes = np.array(["101021007", "101021008"])
    names = np.array(["Braidwood", "Karabar"])
    parents = np.array(["101", "101"])
    ogr_write(
        str(path),
        geometry=geometries,
        field_data=[codes, names, parents],
        fields=["SA2_CODE21", "SA2_NAME21", "SA3_CODE21"],
        geometry_type="Polygon",
        crs="EPSG:4326",
        driver="GPKG",
    )


def test_parse_asgs_boundary_file_reads_features(tmp_path: Path) -> None:
    gpkg_path = tmp_path / "sa2.gpkg"
    _write_sa2_geopackage(gpkg_path)

    features = parse_asgs_boundary_file(
        gpkg_path,
        AsgsFieldMapping(
            code_field="SA2_CODE21", name_field="SA2_NAME21", parent_code_field="SA3_CODE21"
        ),
    )

    assert [f.code for f in features] == ["101021007", "101021008"]
    assert [f.name for f in features] == ["Braidwood", "Karabar"]
    assert [f.parent_code for f in features] == ["101", "101"]
    assert all(feature.geometry_wkb[:1] == b"\x01" for feature in features)


def test_parse_asgs_boundary_file_without_parent_field(tmp_path: Path) -> None:
    gpkg_path = tmp_path / "sa2.gpkg"
    _write_sa2_geopackage(gpkg_path)

    features = parse_asgs_boundary_file(
        gpkg_path, AsgsFieldMapping(code_field="SA2_CODE21", name_field="SA2_NAME21")
    )

    assert all(feature.parent_code is None for feature in features)


def _write_sa2_geopackage_with_non_spatial_entity(path: Path) -> None:
    # Real ABS ASGS releases include census accounting entities with no
    # geometry (e.g. "Migratory - Offshore - Shipping", "No usual address",
    # "Outside Australia") alongside genuine spatial polygons.
    geometries = np.array([_wkb_polygon(_SQUARE_A), None, _wkb_polygon(_SQUARE_B)], dtype=object)
    codes = np.array(["101021007", "199999499", "101021008"])
    names = np.array(["Braidwood", "Migratory - Offshore - Shipping (NSW)", "Karabar"])
    parents = np.array(["101", "199", "101"])
    ogr_write(
        str(path),
        geometry=geometries,
        field_data=[codes, names, parents],
        fields=["SA2_CODE21", "SA2_NAME21", "SA3_CODE21"],
        geometry_type="Polygon",
        crs="EPSG:4326",
        driver="GPKG",
    )


def test_parse_asgs_boundary_file_skips_non_spatial_entities(tmp_path: Path) -> None:
    gpkg_path = tmp_path / "sa2_non_spatial.gpkg"
    _write_sa2_geopackage_with_non_spatial_entity(gpkg_path)

    features = parse_asgs_boundary_file(
        gpkg_path,
        AsgsFieldMapping(
            code_field="SA2_CODE21", name_field="SA2_NAME21", parent_code_field="SA3_CODE21"
        ),
    )

    assert [f.code for f in features] == ["101021007", "101021008"]


def test_parse_asgs_boundary_file_raises_for_missing_field(tmp_path: Path) -> None:
    gpkg_path = tmp_path / "sa2.gpkg"
    _write_sa2_geopackage(gpkg_path)

    with pytest.raises(GeographyImportError, match="missing expected field"):
        parse_asgs_boundary_file(
            gpkg_path, AsgsFieldMapping(code_field="NOT_A_FIELD", name_field="SA2_NAME21")
        )


def test_load_asgs_release_rejects_empty_feature_list() -> None:
    with pytest.raises(GeographyImportError, match="empty"):
        load_asgs_release(
            "postgresql://unused",
            region_type="sa2",
            release_version="2026",
            source_id=uuid.uuid4(),
            import_run_id=None,
            effective_from=date(2026, 1, 1),
            content_hash="a" * 64,
            features=[],
        )


@pytest.mark.integration
def test_load_asgs_release_creates_regions_and_activates_release() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"asgs-{suffix}", name="ABS ASGS", kind="government_open_data"
    )
    features = [
        AsgsFeature("101021007", "Braidwood", "101", _wkb_polygon(_SQUARE_A)),
        AsgsFeature("101021008", "Karabar", "101", _wkb_polygon(_SQUARE_B)),
    ]

    result = load_asgs_release(
        database_url,
        region_type="sa2",
        release_version=suffix,
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 7, 1),
        content_hash="b" * 64,
        features=features,
    )

    assert result.region_count == 2
    with psycopg.connect(database_url) as connection:
        release = connection.execute(
            "SELECT is_active, dataset FROM geography_releases WHERE id = %s",
            (result.release_id,),
        ).fetchone()
        region_count = connection.execute(
            "SELECT count(*) FROM regions WHERE release_id = %s", (result.release_id,)
        ).fetchone()
    assert release == (True, "asgs_sa2")
    assert region_count == (2,)


@pytest.mark.integration
def test_load_asgs_release_is_idempotent_on_retry() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"asgs-{suffix}", name="ABS ASGS", kind="government_open_data"
    )
    features = [AsgsFeature("101021007", "Braidwood", None, _wkb_polygon(_SQUARE_A))]
    kwargs = dict(
        region_type="sa2",
        release_version=suffix,
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 7, 1),
        content_hash="c" * 64,
        features=features,
    )

    first = load_asgs_release(database_url, **kwargs)  # type: ignore[arg-type]
    second = load_asgs_release(database_url, **kwargs)  # type: ignore[arg-type]

    assert first.release_id == second.release_id
    with psycopg.connect(database_url) as connection:
        region_count = connection.execute(
            "SELECT count(*) FROM regions WHERE release_id = %s", (first.release_id,)
        ).fetchone()
    assert region_count == (1,)


@pytest.mark.integration
def test_load_asgs_release_rejects_mismatched_retry() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"asgs-{suffix}", name="ABS ASGS", kind="government_open_data"
    )
    load_asgs_release(
        database_url,
        region_type="sa2",
        release_version=suffix,
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 7, 1),
        content_hash="d" * 64,
        features=[AsgsFeature("101021007", "Braidwood", None, _wkb_polygon(_SQUARE_A))],
    )

    with pytest.raises(GeographyImportError, match="already has"):
        load_asgs_release(
            database_url,
            region_type="sa2",
            release_version=suffix,
            source_id=source_id,
            import_run_id=None,
            effective_from=date(2026, 7, 1),
            content_hash="d" * 64,
            features=[
                AsgsFeature("101021007", "Braidwood", None, _wkb_polygon(_SQUARE_A)),
                AsgsFeature("101021008", "Karabar", None, _wkb_polygon(_SQUARE_B)),
            ],
        )


@pytest.mark.integration
def test_load_asgs_release_links_parent_region_and_counts_missing() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"asgs-{suffix}", name="ABS ASGS", kind="government_open_data"
    )
    parent = load_asgs_release(
        database_url,
        region_type="sa3",
        release_version=f"sa3-{suffix}",
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 7, 1),
        content_hash="e" * 64,
        features=[AsgsFeature("101", "Queanbeyan", None, _wkb_polygon(_SQUARE_A))],
    )
    child = load_asgs_release(
        database_url,
        region_type="sa2",
        release_version=f"sa2-{suffix}",
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 7, 1),
        content_hash="f" * 64,
        features=[
            AsgsFeature("101021007", "Braidwood", "101", _wkb_polygon(_SQUARE_A)),
            AsgsFeature("101021008", "Karabar", "999999", _wkb_polygon(_SQUARE_B)),
        ],
        parent_region_type="sa3",
    )

    assert child.missing_parent_count == 1
    with psycopg.connect(database_url) as connection:
        parent_id = connection.execute(
            "SELECT parent_region_id FROM regions WHERE release_id = %s AND code = %s",
            (child.release_id, "101021007"),
        ).fetchone()
        missing_parent_id = connection.execute(
            "SELECT parent_region_id FROM regions WHERE release_id = %s AND code = %s",
            (child.release_id, "101021008"),
        ).fetchone()
    with psycopg.connect(database_url) as connection:
        parent_region_ids = connection.execute(
            "SELECT id FROM regions WHERE release_id = %s", (parent.release_id,)
        ).fetchall()
    assert parent_id == (parent_region_ids[0][0],)
    assert missing_parent_id == (None,)


@pytest.mark.integration
def test_load_asgs_release_deactivates_previous_release() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"asgs-{suffix}", name="ABS ASGS", kind="government_open_data"
    )
    first = load_asgs_release(
        database_url,
        region_type="sa4",
        release_version=f"v1-{suffix}",
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 1, 1),
        content_hash="1" * 64,
        features=[AsgsFeature("101", "Capital Region", None, _wkb_polygon(_SQUARE_A))],
    )
    second = load_asgs_release(
        database_url,
        region_type="sa4",
        release_version=f"v2-{suffix}",
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 7, 1),
        content_hash="2" * 64,
        features=[AsgsFeature("101", "Capital Region", None, _wkb_polygon(_SQUARE_A))],
    )

    with psycopg.connect(database_url) as connection:
        first_state = connection.execute(
            "SELECT is_active, effective_to FROM geography_releases WHERE id = %s",
            (first.release_id,),
        ).fetchone()
        second_state = connection.execute(
            "SELECT is_active FROM geography_releases WHERE id = %s", (second.release_id,)
        ).fetchone()
    assert first_state == (False, date(2026, 7, 1))
    assert second_state == (True,)


@pytest.mark.integration
def test_run_asgs_import_end_to_end_is_idempotent(tmp_path: Path) -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    store = FilesystemSnapshotStore(tmp_path / "store")
    gpkg_path = tmp_path / "sa2.gpkg"
    _write_sa2_geopackage(gpkg_path)
    suffix = uuid.uuid4().hex

    first = run_asgs_import(
        repository,
        store,
        database_url,
        region_type="sa2",
        source_key=f"abs-asgs-sa2-{suffix}",
        release_version=f"2026-{suffix}",
        effective_from=date(2026, 7, 1),
        file_path=gpkg_path,
        mapping=AsgsFieldMapping(code_field="SA2_CODE21", name_field="SA2_NAME21"),
    )
    duplicate = run_asgs_import(
        repository,
        store,
        database_url,
        region_type="sa2",
        source_key=f"abs-asgs-sa2-{suffix}",
        release_version=f"2026-{suffix}",
        effective_from=date(2026, 7, 1),
        file_path=gpkg_path,
        mapping=AsgsFieldMapping(code_field="SA2_CODE21", name_field="SA2_NAME21"),
    )

    assert first.created is True
    assert first.region_count == 2
    assert duplicate.created is False
    assert duplicate.run_id == first.run_id
    with psycopg.connect(database_url) as connection:
        snapshot_count = connection.execute(
            "SELECT count(*) FROM raw_snapshots WHERE import_run_id = %s", (first.run_id,)
        ).fetchone()
    assert snapshot_count == (1,)
