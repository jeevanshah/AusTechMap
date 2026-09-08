from __future__ import annotations

import csv
import os
import uuid
import zipfile
from dataclasses import replace
from datetime import UTC, date, datetime
from decimal import Decimal
from pathlib import Path

import psycopg
import pytest
from openpyxl import Workbook

from austechmap_ingestion.__main__ import main
from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.hiring.taxonomy_seed import seed_taxonomy
from austechmap_ingestion.jobs import JobRepository
from austechmap_ingestion.regional.jsa import (
    DEFAULT_MAPPING_PATH,
    JsaImportError,
    OccupationRoleMapping,
    RegionalLaborRecord,
    load_occupation_role_mapping,
    load_regional_labor_observations,
    parse_ivi_workbook,
    parse_nero_zip,
    run_ivi_import,
    run_nero_import,
)
from austechmap_ingestion.storage import FilesystemSnapshotStore

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"
FIXED_NOW = datetime(2026, 9, 8, 12, 0, tzinfo=UTC)


def _write_nero_zip(
    path: Path,
    *,
    title: str = "Software and Applications Programmers",
    region_code: str = "101",
) -> None:
    rows = [
        {
            "": "1",
            "state_name": "NSW",
            "sa4_code": region_code,
            "sa4_name": "Capital Region",
            "anzsco4_code": "2613",
            "anzsco4_name": title,
            "date": "2026-08-15",
            "nsc_emp": "125.5",
        },
        {
            "": "2",
            "state_name": "NSW",
            "sa4_code": region_code,
            "sa4_name": "Capital Region",
            "anzsco4_code": "1111",
            "anzsco4_name": "Chief Executives and Managing Directors",
            "date": "2026-08-15",
            "nsc_emp": "500",
        },
    ]
    csv_path = path.with_suffix(".csv")
    with csv_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.write(csv_path, "2026-08_nero/2026-08_shiny_df.csv")


def _write_ivi_workbook(path: Path, *, region_code: str = "101") -> None:
    workbook = Workbook()
    sheet = workbook.active
    assert sheet is not None
    sheet.title = "Averaged"
    sheet.append(
        [
            "Level",
            "State",
            "region_name",
            "region_code",
            "region_level",
            "ANZSCO_CODE",
            "ANZSCO_TITLE",
            datetime(2026, 6, 1),
            datetime(2026, 7, 1),
        ]
    )
    sheet.append([3, "NSW", "Greater Sydney", "1GSYD", "GCCSA", "26", "ICT Professionals", 40, 41])
    sheet.append(
        [3, "NSW", "Capital Region", region_code, "SA4", "26", "ICT Professionals", 10, 12]
    )
    sheet.append([3, "NSW", "Capital Region", region_code, "SA4", "31", "Technicians", 20, 21])
    workbook.save(path)
    workbook.close()


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


def _active_sa4(database_url: str) -> tuple[str, str]:
    repository = JobRepository(database_url)
    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            """
            SELECT region.code, region.name
            FROM regions region
            JOIN geography_releases release ON release.id = region.release_id
            WHERE region.region_type = 'sa4'
              AND release.dataset = 'asgs_sa4'
              AND release.is_active
            ORDER BY region.code
            LIMIT 1
            """
        ).fetchone()
        if row is None:
            suffix = uuid.uuid4().hex
            source_id = repository.ensure_source(
                source_key=f"asgs-jsa-test-{suffix}",
                name="ASGS JSA isolated integration fixture",
                kind="government_open_data",
            )
            release_id = connection.execute(
                """
                INSERT INTO geography_releases (
                  dataset, release_version, source_id, effective_from, content_hash,
                  row_count, is_active, activated_at
                )
                VALUES ('asgs_sa4', %s, %s, '2026-07-01', %s, 1, true, %s)
                RETURNING id
                """,
                (f"jsa-test-{suffix}", source_id, "a" * 64, FIXED_NOW),
            ).fetchone()
            assert release_id is not None
            row = connection.execute(
                """
                INSERT INTO regions (release_id, region_type, code, name, geom)
                VALUES (
                  %s, 'sa4', '999', 'JSA Test Region',
                  ST_Multi(ST_GeomFromText(
                    'POLYGON((151 -34, 151.1 -34, 151.1 -33.9, 151 -33.9, 151 -34))',
                    4326
                  ))
                )
                RETURNING code, name
                """,
                (release_id[0],),
            ).fetchone()
    assert row is not None
    return str(row[0]), str(row[1])


def test_default_occupation_mapping_is_narrow_and_explained() -> None:
    mappings = load_occupation_role_mapping()

    assert DEFAULT_MAPPING_PATH.exists()
    assert set(mappings) == {"2241", "2324", "2613", "2631", "2633", "3131", "3132"}
    assert "2621" not in mappings  # Combined database, systems administration, and security group.
    assert all(mapping.rationale for mapping in mappings.values())


def test_parse_nero_zip_filters_to_mapped_occupations(tmp_path: Path) -> None:
    archive_path = tmp_path / "nero.zip"
    _write_nero_zip(archive_path)
    mappings = {
        "2613": OccupationRoleMapping(
            "2613",
            "Software and Applications Programmers",
            "software-engineering",
            "Direct software work.",
        )
    }

    records = parse_nero_zip(archive_path, mappings=mappings)

    assert records == [
        RegionalLaborRecord(
            dataset="nero",
            region_code="101",
            region_name="Capital Region",
            role_family_key="software-engineering",
            metric_key="employment_anzsco4_2613",
            period_start=date(2026, 8, 1),
            period_end=date(2026, 8, 31),
            value=Decimal("125.5"),
            unit="employed_persons_nowcast",
        )
    ]


def test_parse_nero_zip_rejects_a_changed_mapped_title(tmp_path: Path) -> None:
    archive_path = tmp_path / "nero.zip"
    _write_nero_zip(archive_path, title="Renamed occupation")
    mappings = {
        "2613": OccupationRoleMapping(
            "2613",
            "Software and Applications Programmers",
            "software-engineering",
            "Direct software work.",
        )
    }

    with pytest.raises(JsaImportError, match="title for 2613 changed"):
        parse_nero_zip(archive_path, mappings=mappings)


def test_parse_ivi_workbook_keeps_only_exact_sa4_ict_professional_rows(tmp_path: Path) -> None:
    workbook_path = tmp_path / "ivi.xlsx"
    _write_ivi_workbook(workbook_path)

    records = parse_ivi_workbook(workbook_path)

    assert [(record.period_start, record.value) for record in records] == [
        (date(2026, 6, 1), Decimal("10")),
        (date(2026, 7, 1), Decimal("12")),
    ]
    assert {record.region_code for record in records} == {"101"}
    assert all(record.role_family_key is None for record in records)
    assert all(record.direction is None for record in records)


def test_jsa_cli_requires_database_url(capsys: pytest.CaptureFixture[str], tmp_path: Path) -> None:
    exit_code = main(
        [
            "import-jsa",
            "--dataset",
            "ivi",
            "--source-version",
            "2026-07",
            "--database-url",
            "",
            str(tmp_path / "ivi.xlsx"),
        ]
    )

    assert exit_code == 2
    assert capsys.readouterr().out.strip() == "DATABASE_URL or --database-url is required"


@pytest.mark.integration
def test_run_ivi_import_is_snapshotted_and_idempotent(tmp_path: Path) -> None:
    database_url = _database_url()
    region_code, _region_name = _active_sa4(database_url)
    workbook_path = tmp_path / "ivi.xlsx"
    _write_ivi_workbook(workbook_path, region_code=region_code)
    repository = JobRepository(database_url)
    store = FilesystemSnapshotStore(tmp_path / "snapshots")
    version = f"test-{uuid.uuid4().hex}"

    first = run_ivi_import(
        repository,
        store,
        database_url,
        source_version=version,
        file_path=workbook_path,
        now=FIXED_NOW,
    )
    duplicate = run_ivi_import(
        repository,
        store,
        database_url,
        source_version=version,
        file_path=workbook_path,
        now=FIXED_NOW,
    )

    assert first.created is True
    assert first.records_seen == 2
    assert first.records_inserted == 2
    assert duplicate.created is False
    with psycopg.connect(database_url) as connection:
        rows = connection.execute(
            """
            SELECT observation.value, observation.direction, observation.source_version,
                   snapshot.id IS NOT NULL, source.base_url, source.licence_name,
                   source.licence_url
            FROM regional_labor_observations observation
            JOIN import_runs run ON run.id = observation.import_run_id
            JOIN data_sources source ON source.id = observation.source_id
            LEFT JOIN raw_snapshots snapshot ON snapshot.import_run_id = run.id
            WHERE observation.import_run_id = %s
            ORDER BY observation.period_start
            """,
            (first.run_id,),
        ).fetchall()
    assert rows == [
        (
            Decimal("10"),
            None,
            version,
            True,
            "https://www.jobsandskills.gov.au/data/internet-vacancy-index",
            "Creative Commons Attribution 4.0 International",
            "https://creativecommons.org/licenses/by/4.0/",
        ),
        (
            Decimal("12"),
            None,
            version,
            True,
            "https://www.jobsandskills.gov.au/data/internet-vacancy-index",
            "Creative Commons Attribution 4.0 International",
            "https://creativecommons.org/licenses/by/4.0/",
        ),
    ]


@pytest.mark.integration
def test_run_nero_import_maps_an_exact_occupation_to_a_role_family(tmp_path: Path) -> None:
    database_url = _database_url()
    region_code, _region_name = _active_sa4(database_url)
    seed_taxonomy(database_url)
    archive_path = tmp_path / "nero.zip"
    _write_nero_zip(archive_path, region_code=region_code)
    repository = JobRepository(database_url)
    store = FilesystemSnapshotStore(tmp_path / "snapshots")
    version = f"test-{uuid.uuid4().hex}"

    result = run_nero_import(
        repository,
        store,
        database_url,
        source_version=version,
        file_path=archive_path,
        now=FIXED_NOW,
    )

    assert result.records_seen == 1
    assert result.records_inserted == 1
    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            """
            SELECT role.key, observation.metric_key, observation.direction
            FROM regional_labor_observations observation
            JOIN role_families role ON role.id = observation.role_family_id
            WHERE observation.import_run_id = %s
            """,
            (result.run_id,),
        ).fetchone()
    assert row == ("software-engineering", "employment_anzsco4_2613", None)


@pytest.mark.integration
def test_loader_rejects_changed_values_for_one_immutable_source_version() -> None:
    database_url = _database_url()
    region_code, region_name = _active_sa4(database_url)
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"jsa-conflict-{suffix}",
        name="JSA conflict test",
        kind="government_open_data",
    )
    first_run = repository.enqueue(
        run_type="jsa_ivi_import",
        idempotency_key=f"first-{suffix}",
        source_id=source_id,
        payload={},
        scheduled_for=FIXED_NOW,
    )
    first_claim = repository.claim_run(first_run.run_id, worker_id="test", now=FIXED_NOW)
    second_run = repository.enqueue(
        run_type="jsa_ivi_import",
        idempotency_key=f"second-{suffix}",
        source_id=source_id,
        payload={},
        scheduled_for=FIXED_NOW,
    )
    second_claim = repository.claim_run(second_run.run_id, worker_id="test", now=FIXED_NOW)
    assert first_claim is not None
    assert second_claim is not None
    record = RegionalLaborRecord(
        dataset="ivi",
        region_code=region_code,
        region_name=region_name,
        role_family_key=None,
        metric_key=f"vacancies_test_{suffix}",
        period_start=date(2026, 7, 1),
        period_end=date(2026, 7, 31),
        value=Decimal("10"),
        unit="online_job_advertisements_3_month_moving_average",
    )
    try:
        load_regional_labor_observations(
            database_url,
            records=[record],
            source_version=f"version-{suffix}",
            source_id=source_id,
            import_run_id=first_claim.run_id,
            observed_at=FIXED_NOW,
        )
        with pytest.raises(JsaImportError, match="conflicts with an immutable observation"):
            load_regional_labor_observations(
                database_url,
                records=[replace(record, value=Decimal("11"))],
                source_version=f"version-{suffix}",
                source_id=source_id,
                import_run_id=second_claim.run_id,
                observed_at=FIXED_NOW,
            )
    finally:
        repository.fail(
            first_claim,
            retryable=False,
            error_code="test_cleanup",
            error_message="integration test cleanup",
            now=FIXED_NOW,
        )
        repository.fail(
            second_claim,
            retryable=False,
            error_code="test_cleanup",
            error_message="integration test cleanup",
            now=FIXED_NOW,
        )
