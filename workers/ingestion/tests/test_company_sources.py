from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.hiring.company_sources import (
    ACTIVE_BOARD_INTERVAL,
    EMPTY_BOARD_INTERVAL,
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


@pytest.mark.integration
def test_success_uses_adaptive_active_and_empty_board_intervals() -> None:
    database_url = _database_url()
    source = _create_source(database_url)
    observed_at = datetime(2026, 9, 8, 1, 2, tzinfo=UTC)

    active = record_ats_source_success(
        database_url,
        source_id=source.id,
        observed_at=observed_at,
        fetched_jobs=4,
    )
    assert active.next_crawl_at == observed_at + ACTIVE_BOARD_INTERVAL

    empty = record_ats_source_success(
        database_url,
        source_id=source.id,
        observed_at=observed_at + ACTIVE_BOARD_INTERVAL,
        fetched_jobs=0,
    )
    assert empty.next_crawl_at == observed_at + ACTIVE_BOARD_INTERVAL + EMPTY_BOARD_INTERVAL


@pytest.mark.integration
def test_due_listing_excludes_future_and_paused_sources() -> None:
    database_url = _database_url()
    source = _create_source(database_url)
    now = datetime(2026, 9, 8, 1, 2, tzinfo=UTC)
    record_ats_source_success(
        database_url, source_id=source.id, observed_at=now, fetched_jobs=1
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
            ORDER BY created_at DESC LIMIT 1
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
