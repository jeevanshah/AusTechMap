from __future__ import annotations

import os
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.hiring.signals import (
    METHODOLOGY_VERSION,
    HiringSignalsStats,
    derive_employer_hiring_signals,
)

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


@pytest.mark.integration
def test_derive_employer_hiring_signals_insufficient_sample_size() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    today = datetime.now(timezone.utc).date()

    with psycopg.connect(database_url, autocommit=True) as conn:
        # Create company
        company_id = conn.execute(
            "INSERT INTO companies (slug, display_name, domain) VALUES (%s, %s, %s) RETURNING id",
            (f"sig-co-{suffix}", f"Signals Co {suffix}", f"sig-{suffix}.example.com"),
        ).fetchone()[0]

        # Get role family and data source
        role_family_id = conn.execute("SELECT id FROM role_families LIMIT 1").fetchone()[0]
        source_id = conn.execute("SELECT id FROM data_sources LIMIT 1").fetchone()[0]

        # Insert 2 jobs (sample size 2 < 3)
        job1_id = conn.execute(
            """
            INSERT INTO jobs (
                company_id, source_id, source_system, external_id, title,
                normalized_title, role_family_id, source_url, content_hash,
                first_seen_at, last_seen_at
            )
            VALUES (%s, %s, 'test', %s, 'Job 1', 'job 1', %s, 'https://example.com/1',
                    repeat('a', 64), now(), now())
            RETURNING id
            """,
            (company_id, source_id, f"ext-1-{suffix}", role_family_id),
        ).fetchone()[0]

        # Add single observation
        conn.execute(
            """
            INSERT INTO job_observations (job_id, observed_at, active, content_hash, source_id)
            VALUES (%s, now(), true, repeat('a', 64), %s)
            """,
            (job1_id, source_id),
        )

    stats = derive_employer_hiring_signals(database_url, period_end=today)
    assert stats.companies_considered >= 1

    with psycopg.connect(database_url) as conn:
        sig = conn.execute(
            """
            SELECT active_jobs, new_jobs, momentum, sample_size, sufficient
            FROM employer_role_signals
            WHERE company_id = %s AND role_family_id = %s
            """,
            (company_id, role_family_id),
        ).fetchone()

    assert sig is not None
    assert sig[0] == 1  # active_jobs
    assert sig[1] == 1  # new_jobs
    assert sig[2] is None  # momentum is None because insufficient
    assert sig[3] == 1  # sample_size
    assert sig[4] is False  # sufficient is False


@pytest.mark.integration
def test_derive_employer_hiring_signals_sufficient_cadence() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    today = datetime.now(timezone.utc).date()
    t_minus_20 = datetime.now(timezone.utc) - timedelta(days=20)
    t_minus_5 = datetime.now(timezone.utc) - timedelta(days=5)

    with psycopg.connect(database_url, autocommit=True) as conn:
        company_id = conn.execute(
            "INSERT INTO companies (slug, display_name, domain) VALUES (%s, %s, %s) RETURNING id",
            (f"sig-suff-{suffix}", f"Sufficient Co {suffix}", f"suff-{suffix}.example.com"),
        ).fetchone()[0]

        role_family_id = conn.execute("SELECT id FROM role_families LIMIT 1").fetchone()[0]
        source_id = conn.execute("SELECT id FROM data_sources LIMIT 1").fetchone()[0]

        # Insert 3 jobs
        job_ids = []
        for i in range(3):
            jid = conn.execute(
                """
                INSERT INTO jobs (
                    company_id, source_id, source_system, external_id, title,
                    normalized_title, role_family_id, source_url, content_hash,
                    first_seen_at, last_seen_at
                )
                VALUES (%s, %s, 'test', %s, %s, %s, %s, %s,
                        repeat('b', 64), now(), now())
                RETURNING id
                """,
                (company_id, source_id, f"ext-suff-{i}-{suffix}", f"Job {i}", f"job {i}", role_family_id, f"https://example.com/{i}"),
            ).fetchone()[0]
            job_ids.append(jid)

        # Observations across 2 dates 15 days apart, total sample size 3
        conn.execute(
            "INSERT INTO job_observations (job_id, observed_at, active, content_hash, source_id) VALUES (%s, %s, true, repeat('b', 64), %s)",
            (job_ids[0], t_minus_20, source_id),
        )
        conn.execute(
            "INSERT INTO job_observations (job_id, observed_at, active, content_hash, source_id) VALUES (%s, %s, true, repeat('b', 64), %s)",
            (job_ids[1], t_minus_5, source_id),
        )
        conn.execute(
            "INSERT INTO job_observations (job_id, observed_at, active, content_hash, source_id) VALUES (%s, %s, true, repeat('b', 64), %s)",
            (job_ids[2], t_minus_5, source_id),
        )

    stats = derive_employer_hiring_signals(database_url, period_end=today)

    with psycopg.connect(database_url) as conn:
        sig = conn.execute(
            """
            SELECT active_jobs, new_jobs, momentum, sample_size, sufficient
            FROM employer_role_signals
            WHERE company_id = %s AND role_family_id = %s
            """,
            (company_id, role_family_id),
        ).fetchone()

    assert sig is not None
    assert sig[0] == 3  # active_jobs
    assert sig[3] == 3  # sample_size
    assert sig[4] is True  # sufficient is True (3 observations, 15 days span)
    assert sig[2] is not None  # momentum computed
