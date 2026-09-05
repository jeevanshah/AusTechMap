from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.hiring.normalisation import NormalisedJob
from austechmap_ingestion.hiring.persistence import mark_expired_jobs, persist_job_posting
from austechmap_ingestion.hiring.types import RawJobPosting
from austechmap_ingestion.jobs import JobRepository

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


def _setup_company_and_source(database_url: str, suffix: str) -> tuple[uuid.UUID, uuid.UUID]:
    source_id = JobRepository(database_url).ensure_source(
        source_key=f"persistence-test-{suffix}", name="Persistence test source", kind="derived"
    )
    with psycopg.connect(database_url, autocommit=True) as connection:
        row = connection.execute(
            "INSERT INTO companies (slug, display_name) VALUES (%s, %s) RETURNING id",
            (f"persistence-test-{suffix}", f"Persistence Test Co {suffix}"),
        ).fetchone()
    assert row is not None
    return row[0], source_id


def _posting(external_id: str, title: str = "Senior Platform Engineer") -> RawJobPosting:
    return RawJobPosting(
        external_id=external_id,
        title=title,
        department="Engineering",
        team="Engineering",
        location_text="Sydney",
        employment_type_raw="FullTime",
        remote_type_raw="Hybrid",
        country=None,
        posted_at=None,
        source_url=f"https://example.test/{external_id}",
        apply_url=None,
        description_html=None,
        description_text="Some description.",
        raw={},
    )


def _normalised(content_hash: str) -> NormalisedJob:
    return NormalisedJob(
        normalized_title="senior platform engineer",
        role_family_key=None,
        seniority="senior",
        remote_type="hybrid",
        graduate_role=False,
        internship_role=False,
        salary_min=None,
        salary_max=None,
        salary_period=None,
        content_hash=content_hash,
    )


@pytest.mark.integration
def test_persist_job_posting_creates_a_new_job() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id, source_id = _setup_company_and_source(database_url, suffix)
    observed_at = datetime.now(UTC)

    with psycopg.connect(database_url) as connection:
        result = persist_job_posting(
            connection,
            company_id=company_id,
            source_id=source_id,
            run_id=None,
            source_system="lever",
            posting=_posting("ext-1"),
            normalised=_normalised("a" * 64),
            skill_matches=[],
            observed_at=observed_at,
        )
        connection.commit()

    assert result.created is True
    assert result.content_changed is True

    with psycopg.connect(database_url) as connection:
        job = connection.execute(
            "SELECT first_seen_at, last_seen_at, expired_at FROM jobs WHERE id = %s",
            (result.job_id,),
        ).fetchone()
        observation_count = connection.execute(
            "SELECT count(*) FROM job_observations WHERE job_id = %s", (result.job_id,)
        ).fetchone()
    assert job is not None
    assert job[2] is None
    assert observation_count == (1,)


@pytest.mark.integration
def test_persist_job_posting_updates_in_place_preserving_first_seen_at() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id, source_id = _setup_company_and_source(database_url, suffix)
    first_observed = datetime.now(UTC)
    second_observed = first_observed + timedelta(days=1)

    with psycopg.connect(database_url) as connection:
        first = persist_job_posting(
            connection,
            company_id=company_id,
            source_id=source_id,
            run_id=None,
            source_system="lever",
            posting=_posting("ext-2"),
            normalised=_normalised("a" * 64),
            skill_matches=[],
            observed_at=first_observed,
        )
        connection.commit()

    with psycopg.connect(database_url) as connection:
        first_seen_before = connection.execute(
            "SELECT first_seen_at FROM jobs WHERE id = %s", (first.job_id,)
        ).fetchone()
        assert first_seen_before is not None

        # Content changed (different hash) -- title also changes.
        second = persist_job_posting(
            connection,
            company_id=company_id,
            source_id=source_id,
            run_id=None,
            source_system="lever",
            posting=_posting("ext-2", title="Staff Platform Engineer"),
            normalised=_normalised("b" * 64),
            skill_matches=[],
            observed_at=second_observed,
        )
        connection.commit()

    assert second.job_id == first.job_id
    assert second.created is False
    assert second.content_changed is True

    with psycopg.connect(database_url) as connection:
        job = connection.execute(
            "SELECT title, first_seen_at, last_seen_at FROM jobs WHERE id = %s", (first.job_id,)
        ).fetchone()
        observation_count = connection.execute(
            "SELECT count(*) FROM job_observations WHERE job_id = %s", (first.job_id,)
        ).fetchone()
    assert job is not None
    assert job[0] == "Staff Platform Engineer"
    assert job[1] == first_seen_before[0]
    assert job[2] == second_observed
    assert observation_count == (2,)


@pytest.mark.integration
def test_persist_job_posting_appends_an_observation_even_when_content_is_unchanged() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id, source_id = _setup_company_and_source(database_url, suffix)
    first_observed = datetime.now(UTC)
    second_observed = first_observed + timedelta(days=1)

    with psycopg.connect(database_url) as connection:
        first = persist_job_posting(
            connection,
            company_id=company_id,
            source_id=source_id,
            run_id=None,
            source_system="lever",
            posting=_posting("ext-3"),
            normalised=_normalised("a" * 64),
            skill_matches=[],
            observed_at=first_observed,
        )
        connection.commit()

    with psycopg.connect(database_url) as connection:
        second = persist_job_posting(
            connection,
            company_id=company_id,
            source_id=source_id,
            run_id=None,
            source_system="lever",
            posting=_posting("ext-3"),
            normalised=_normalised("a" * 64),
            skill_matches=[],
            observed_at=second_observed,
        )
        connection.commit()

    assert second.created is False
    assert second.content_changed is False
    with psycopg.connect(database_url) as connection:
        observation_count = connection.execute(
            "SELECT count(*) FROM job_observations WHERE job_id = %s", (first.job_id,)
        ).fetchone()
    assert observation_count == (2,)


@pytest.mark.integration
def test_mark_expired_jobs_expires_a_job_no_longer_seen_and_unexpires_on_reappearance() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id, source_id = _setup_company_and_source(database_url, suffix)
    first_observed = datetime.now(UTC)
    expiry_observed = first_observed + timedelta(days=1)
    reappear_observed = first_observed + timedelta(days=2)

    with psycopg.connect(database_url) as connection:
        created = persist_job_posting(
            connection,
            company_id=company_id,
            source_id=source_id,
            run_id=None,
            source_system="lever",
            posting=_posting("ext-4"),
            normalised=_normalised("a" * 64),
            skill_matches=[],
            observed_at=first_observed,
        )
        connection.commit()

    with psycopg.connect(database_url) as connection:
        expired_count = mark_expired_jobs(
            connection,
            company_id=company_id,
            source_system="lever",
            source_id=source_id,
            run_id=None,
            seen_external_ids=set(),
            observed_at=expiry_observed,
        )
        connection.commit()
    assert expired_count == 1

    with psycopg.connect(database_url) as connection:
        job = connection.execute(
            "SELECT expired_at FROM jobs WHERE id = %s", (created.job_id,)
        ).fetchone()
    assert job is not None
    assert job[0] == expiry_observed

    with psycopg.connect(database_url) as connection:
        reappeared = persist_job_posting(
            connection,
            company_id=company_id,
            source_id=source_id,
            run_id=None,
            source_system="lever",
            posting=_posting("ext-4"),
            normalised=_normalised("a" * 64),
            skill_matches=[],
            observed_at=reappear_observed,
        )
        connection.commit()

    assert reappeared.job_id == created.job_id
    with psycopg.connect(database_url) as connection:
        job = connection.execute(
            "SELECT expired_at FROM jobs WHERE id = %s", (created.job_id,)
        ).fetchone()
    assert job is not None
    assert job[0] is None


@pytest.mark.integration
def test_persist_job_posting_writes_skill_links() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id, source_id = _setup_company_and_source(database_url, suffix)

    with psycopg.connect(database_url, autocommit=True) as connection:
        skill_row = connection.execute(
            "INSERT INTO skills (key, label, category) VALUES (%s, %s, %s) RETURNING id",
            (f"python-{suffix}", "Python", "language"),
        ).fetchone()
    assert skill_row is not None

    with psycopg.connect(database_url) as connection:
        result = persist_job_posting(
            connection,
            company_id=company_id,
            source_id=source_id,
            run_id=None,
            source_system="lever",
            posting=_posting("ext-5"),
            normalised=_normalised("a" * 64),
            skill_matches=[(f"python-{suffix}", 0.7)],
            observed_at=datetime.now(UTC),
        )
        connection.commit()

    with psycopg.connect(database_url) as connection:
        link = connection.execute(
            "SELECT skill_id, confidence, method FROM job_skill_links WHERE job_id = %s",
            (result.job_id,),
        ).fetchone()
    assert link is not None
    assert link[0] == skill_row[0]
    assert float(link[1]) == pytest.approx(0.7)
    assert link[2] == "keyword_match"
