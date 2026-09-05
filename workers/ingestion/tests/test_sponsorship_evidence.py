from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.employers.sponsorship_evidence import (
    derive_sponsorship_evidence_from_jobs,
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


def _setup_company(database_url: str, suffix: str) -> tuple[uuid.UUID, uuid.UUID]:
    source_id = JobRepository(database_url).ensure_source(
        source_key=f"sponsorship-evidence-test-{suffix}", name="Test source", kind="derived"
    )
    with psycopg.connect(database_url, autocommit=True) as connection:
        row = connection.execute(
            "INSERT INTO companies (slug, display_name) VALUES (%s, %s) RETURNING id",
            (f"sponsorship-evidence-test-{suffix}", f"Sponsorship Evidence Test Co {suffix}"),
        ).fetchone()
    assert row is not None
    return row[0], source_id


def _insert_job(
    database_url: str,
    *,
    company_id: uuid.UUID,
    source_id: uuid.UUID,
    external_id: str,
    title: str,
    description_text: str,
    expired: bool,
) -> uuid.UUID:
    now = datetime.now(UTC)
    with psycopg.connect(database_url, autocommit=True) as connection:
        row = connection.execute(
            """
            INSERT INTO jobs (
              company_id, source_id, source_system, external_id, title, normalized_title,
              source_url, description_text, content_hash, first_seen_at, last_seen_at, expired_at
            )
            VALUES (%s, %s, 'lever', %s, %s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING id
            """,
            (
                company_id,
                source_id,
                external_id,
                title,
                title.lower(),
                f"https://example.test/{external_id}",
                description_text,
                "a" * 64,
                now,
                now,
                now if expired else None,
            ),
        ).fetchone()
    assert row is not None
    return cast(uuid.UUID, row[0])


@pytest.mark.integration
def test_derive_sponsorship_evidence_creates_current_evidence_for_an_active_match() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id, source_id = _setup_company(database_url, suffix)
    job_id = _insert_job(
        database_url,
        company_id=company_id,
        source_id=source_id,
        external_id="ext-1",
        title="Software Engineer",
        description_text="We offer visa sponsorship for the right candidate.",
        expired=False,
    )

    stats = derive_sponsorship_evidence_from_jobs(database_url)

    assert stats.current_evidence_created >= 1
    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            """
            SELECT claim_type, claim_value ->> 'job_id' FROM evidence
            WHERE entity_type = 'company' AND entity_id = %s
            """,
            (str(company_id),),
        ).fetchone()
    assert row == ("sponsorship_current_explicit", str(job_id))


@pytest.mark.integration
def test_derive_sponsorship_evidence_creates_historical_evidence_for_an_expired_match() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id, source_id = _setup_company(database_url, suffix)
    _insert_job(
        database_url,
        company_id=company_id,
        source_id=source_id,
        external_id="ext-2",
        title="Backend Engineer",
        description_text="No sponsorship mention here.",
        expired=False,
    )
    _insert_job(
        database_url,
        company_id=company_id,
        source_id=source_id,
        external_id="ext-3",
        title="Frontend Engineer",
        description_text="Sponsorship available for this role.",
        expired=True,
    )

    derive_sponsorship_evidence_from_jobs(database_url)

    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            "SELECT claim_type FROM evidence WHERE entity_type = 'company' AND entity_id = %s",
            (str(company_id),),
        ).fetchone()
    assert row == ("sponsorship_historical_explicit",)


@pytest.mark.integration
def test_derive_sponsorship_evidence_skips_a_company_with_no_match() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id, source_id = _setup_company(database_url, suffix)
    _insert_job(
        database_url,
        company_id=company_id,
        source_id=source_id,
        external_id="ext-4",
        title="Data Analyst",
        description_text="Join our friendly team in Melbourne.",
        expired=False,
    )

    derive_sponsorship_evidence_from_jobs(database_url)

    with psycopg.connect(database_url) as connection:
        count = connection.execute(
            "SELECT count(*) FROM evidence WHERE entity_type = 'company' AND entity_id = %s",
            (str(company_id),),
        ).fetchone()
    assert count == (0,)


@pytest.mark.integration
def test_derive_sponsorship_evidence_prefers_active_over_historical_match() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id, source_id = _setup_company(database_url, suffix)
    _insert_job(
        database_url,
        company_id=company_id,
        source_id=source_id,
        external_id="ext-5",
        title="Platform Engineer",
        description_text="Visa sponsorship available for exceptional candidates.",
        expired=True,
    )
    _insert_job(
        database_url,
        company_id=company_id,
        source_id=source_id,
        external_id="ext-6",
        title="Site Reliability Engineer",
        description_text="We will sponsor a visa for this role.",
        expired=False,
    )

    derive_sponsorship_evidence_from_jobs(database_url)

    with psycopg.connect(database_url) as connection:
        rows = connection.execute(
            "SELECT claim_type FROM evidence WHERE entity_type = 'company' AND entity_id = %s",
            (str(company_id),),
        ).fetchall()
    assert [row[0] for row in rows] == ["sponsorship_current_explicit"]


@pytest.mark.integration
def test_derive_sponsorship_evidence_is_idempotent_on_retry() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id, source_id = _setup_company(database_url, suffix)
    _insert_job(
        database_url,
        company_id=company_id,
        source_id=source_id,
        external_id="ext-7",
        title="Cloud Engineer",
        description_text="We are happy to sponsor a visa for this position.",
        expired=False,
    )

    derive_sponsorship_evidence_from_jobs(database_url)
    derive_sponsorship_evidence_from_jobs(database_url, now=datetime.now(UTC) + timedelta(days=1))

    with psycopg.connect(database_url) as connection:
        count = connection.execute(
            "SELECT count(*) FROM evidence WHERE entity_type = 'company' AND entity_id = %s",
            (str(company_id),),
        ).fetchone()
    assert count == (1,)
