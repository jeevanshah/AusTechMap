from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.hiring.company_sources import (
    ACTIVE_BOARD_INTERVAL,
    EMPTY_BOARD_INTERVAL,
    AtsSourceOperationalState,
    AtsSourceOperationError,
    CompanyAtsSource,
    list_active_ats_sources,
    record_ats_source_success,
    record_ats_source_terminal_failure,
    set_ats_source_status,
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


def _create_source(database_url: str) -> CompanyAtsSource:
    suffix = uuid.uuid4().hex
    discovery_source_id = JobRepository(database_url).ensure_source(
        source_key=f"source-operations-test-{suffix}",
        name="Source operations test",
        kind="derived",
    )
    with psycopg.connect(database_url) as connection:
        company_row = connection.execute(
            "INSERT INTO companies (slug, display_name) VALUES (%s, %s) RETURNING id",
            (f"source-operations-{suffix}", f"Source Operations {suffix}"),
        ).fetchone()
        assert company_row is not None
        source_row = connection.execute(
            """
            INSERT INTO company_ats_sources (
              company_id, ats_provider, ats_identifier, discovered_method, source_id
            )
            VALUES (%s, 'lever', %s, 'manual_verified', %s)
            RETURNING id
            """,
            (company_row[0], f"source-{suffix}", discovery_source_id),
        ).fetchone()
        assert source_row is not None
    assert isinstance(source_row[0], uuid.UUID)
    assert isinstance(company_row[0], uuid.UUID)
    return CompanyAtsSource(
        id=source_row[0],
        company_id=company_row[0],
        ats_provider="lever",
        ats_identifier=f"source-{suffix}",
        source_id=discovery_source_id,
    )


def _create_import_run(database_url: str, source: CompanyAtsSource) -> uuid.UUID:
    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            """
            INSERT INTO import_runs (
              run_type, source_id, idempotency_key, scheduled_for, available_at
            )
            VALUES ('ats_source_operations_test', %s, %s, now(), now())
            RETURNING id
            """,
            (source.source_id, uuid.uuid4().hex),
        ).fetchone()
    assert row is not None
    return cast(uuid.UUID, row[0])


def _record_success(
    database_url: str,
    source: CompanyAtsSource,
    *,
    observed_at: datetime,
    fetched_jobs: int,
) -> AtsSourceOperationalState:
    return record_ats_source_success(
        database_url,
        source_id=source.id,
        import_run_id=_create_import_run(database_url, source),
        observed_at=observed_at,
        fetched_jobs=fetched_jobs,
        actor_id="test-worker",
    )


@pytest.mark.integration
def test_success_uses_adaptive_active_and_empty_board_intervals() -> None:
    database_url = _database_url()
    source = _create_source(database_url)
    observed_at = datetime(2026, 9, 8, 1, 2, tzinfo=UTC)

    active = _record_success(
        database_url, source, observed_at=observed_at, fetched_jobs=4
    )
    assert active.next_crawl_at == observed_at + ACTIVE_BOARD_INTERVAL

    empty = _record_success(
        database_url,
        source,
        observed_at=observed_at + ACTIVE_BOARD_INTERVAL,
        fetched_jobs=0,
    )
    assert empty.next_crawl_at == observed_at + ACTIVE_BOARD_INTERVAL + EMPTY_BOARD_INTERVAL


@pytest.mark.integration
def test_due_listing_excludes_future_and_paused_sources() -> None:
    database_url = _database_url()
    source = _create_source(database_url)
    now = datetime(2026, 9, 8, 1, 2, tzinfo=UTC)
    _record_success(
        database_url, source, observed_at=now, fetched_jobs=1
    )

    assert list_active_ats_sources(
        database_url, ats_identifier=source.ats_identifier, due_at=now
    ) == []
    assert [
        item.id
        for item in list_active_ats_sources(
            database_url,
            ats_identifier=source.ats_identifier,
            due_at=now + ACTIVE_BOARD_INTERVAL,
        )
    ] == [source.id]

    set_ats_source_status(
        database_url,
        ats_provider=source.ats_provider,
        ats_identifier=source.ats_identifier,
        status="paused",
        reason="maintenance",
        actor_id="test-operator",
        changed_at=now,
    )
    assert list_active_ats_sources(
        database_url,
        ats_identifier=source.ats_identifier,
        due_at=now + timedelta(days=7),
    ) == []


@pytest.mark.integration
def test_three_terminal_failures_quarantine_and_audit_the_source() -> None:
    database_url = _database_url()
    source = _create_source(database_url)
    failed_at = datetime(2026, 9, 8, 1, 2, tzinfo=UTC)

    first = record_ats_source_terminal_failure(
        database_url,
        source_id=source.id,
        failed_at=failed_at,
        error_code="FetchError",
        actor_id="test-worker",
    )
    second = record_ats_source_terminal_failure(
        database_url,
        source_id=source.id,
        failed_at=failed_at + timedelta(days=1),
        error_code="FetchError",
        actor_id="test-worker",
    )
    third = record_ats_source_terminal_failure(
        database_url,
        source_id=source.id,
        failed_at=failed_at + timedelta(days=2),
        error_code="ParseError",
        actor_id="test-worker",
    )

    assert (first.status, first.consecutive_failures) == ("active", 1)
    assert (second.status, second.consecutive_failures) == ("active", 2)
    assert (third.status, third.consecutive_failures) == ("quarantined", 3)
    with pytest.raises(AtsSourceOperationError, match="active ATS source not found"):
        record_ats_source_terminal_failure(
            database_url,
            source_id=source.id,
            failed_at=failed_at + timedelta(days=3),
            error_code="FetchError",
            actor_id="test-worker",
        )

    with psycopg.connect(database_url) as connection:
        audit_row = connection.execute(
            """
            SELECT action, metadata->>'error_code'
            FROM audit_records
            WHERE target_type = 'company_ats_source' AND target_id = %s
            ORDER BY occurred_at DESC LIMIT 1
            """,
            (str(source.id),),
        ).fetchone()
    assert audit_row == ("ats_source_quarantined", "ParseError")


@pytest.mark.integration
def test_manual_kill_switch_and_reactivation_are_audited() -> None:
    database_url = _database_url()
    source = _create_source(database_url)
    changed_at = datetime(2026, 9, 8, 1, 2, tzinfo=UTC)

    disabled = set_ats_source_status(
        database_url,
        ats_provider=source.ats_provider,
        ats_identifier=source.ats_identifier,
        status="disabled",
        reason="provider terms changed",
        actor_id="test-operator",
        changed_at=changed_at,
    )
    assert disabled.status == "disabled"
    assert list_active_ats_sources(
        database_url, ats_identifier=source.ats_identifier
    ) == []

    active = set_ats_source_status(
        database_url,
        ats_provider=source.ats_provider,
        ats_identifier=source.ats_identifier,
        status="active",
        reason="terms reviewed and approved",
        actor_id="test-operator",
        changed_at=changed_at + timedelta(hours=1),
    )
    assert active.status == "active"
    assert active.consecutive_failures == 0
    assert active.next_crawl_at == changed_at + timedelta(hours=1)

    with psycopg.connect(database_url) as connection:
        audit_count = connection.execute(
            """
            SELECT count(*) FROM audit_records
            WHERE action = 'ats_source_status_changed'
              AND target_type = 'company_ats_source'
              AND target_id = %s
            """,
            (str(source.id),),
        ).fetchone()
    assert audit_count == (2,)


@pytest.mark.integration
def test_job_count_collapse_is_recorded_and_audited_after_three_crawls() -> None:
    database_url = _database_url()
    source = _create_source(database_url)
    observed_at = datetime(2026, 9, 8, 1, 2, tzinfo=UTC)

    for offset, count in enumerate((20, 22, 24, 10)):
        _record_success(
            database_url,
            source,
            observed_at=observed_at + timedelta(days=offset),
            fetched_jobs=count,
        )

    with psycopg.connect(database_url) as connection:
        metric = connection.execute(
            """
            SELECT reported_job_count, baseline_job_count, baseline_sample_size,
                   baseline_method, is_job_count_anomaly
            FROM ats_source_crawl_metrics
            WHERE company_ats_source_id = %s
            ORDER BY observed_at DESC
            LIMIT 1
            """,
            (source.id,),
        ).fetchone()
        audit = connection.execute(
            """
            SELECT action, metadata->>'reported_job_count', metadata->>'baseline_job_count'
            FROM audit_records
            WHERE target_type = 'company_ats_source' AND target_id = %s
              AND action = 'ats_source_job_count_anomaly_detected'
            """,
            (str(source.id),),
        ).fetchone()

    assert metric == (10, 22, 3, "median_previous_3_successful_crawls_v1", True)
    assert audit == ("ats_source_job_count_anomaly_detected", "10", "22")
