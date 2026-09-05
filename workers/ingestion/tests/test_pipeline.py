from __future__ import annotations

import os
import tempfile
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.fetch_safety import SafeFetchResult
from austechmap_ingestion.hiring.company_sources import CompanyAtsSource
from austechmap_ingestion.hiring.pipeline import run_ats_crawl
from austechmap_ingestion.jobs import JobRepository
from austechmap_ingestion.storage import FilesystemSnapshotStore

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"
FIXTURES_DIRECTORY = Path(__file__).parent / "fixtures"


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


def _setup_company_ats_source(
    database_url: str, suffix: str, ats_provider: str, ats_identifier: str
) -> CompanyAtsSource:
    unique_identifier = f"{ats_identifier}-{suffix}"
    repository = JobRepository(database_url)
    source_id = repository.ensure_source(
        source_key=f"pipeline-test-discovery-{suffix}",
        name="Pipeline test discovery",
        kind="derived",
    )
    with psycopg.connect(database_url, autocommit=True) as connection:
        company_row = connection.execute(
            "INSERT INTO companies (slug, display_name) VALUES (%s, %s) RETURNING id",
            (f"pipeline-test-{suffix}", f"Pipeline Test Co {suffix}"),
        ).fetchone()
        assert company_row is not None
        connection.execute(
            """
            INSERT INTO company_ats_sources (
              company_id, ats_provider, ats_identifier, discovered_method, source_id
            )
            VALUES (%s, %s, %s, 'manual_verified', %s)
            """,
            (company_row[0], ats_provider, unique_identifier, source_id),
        )
    return CompanyAtsSource(
        company_id=company_row[0],
        ats_provider=ats_provider,  # type: ignore[arg-type]
        ats_identifier=unique_identifier,
        source_id=source_id,
    )


def _fake_fetch(fixture_name: str) -> SafeFetchResult:
    content = (FIXTURES_DIRECTORY / fixture_name).read_bytes()
    return SafeFetchResult(
        final_url="https://example.test/fixture", status_code=200, content=content,
        content_type="application/json",
    )


@pytest.mark.integration
def test_run_ats_crawl_persists_real_lever_postings() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_ats_source = _setup_company_ats_source(database_url, suffix, "lever", "immutable")
    repository = JobRepository(database_url)
    store = FilesystemSnapshotStore(Path(tempfile.gettempdir()) / f"pipeline-test-{suffix}")

    result = run_ats_crawl(
        repository,
        store,
        database_url=database_url,
        company_ats_source=company_ats_source,
        skills=(),
        fetch_fn=lambda *a, **kw: _fake_fetch("lever_immutable_postings.json"),
    )

    assert result.created is True
    assert result.fetched == 7
    assert result.jobs_created == 7
    assert result.jobs_updated == 0
    assert result.jobs_unchanged == 0

    with psycopg.connect(database_url) as connection:
        job_count = connection.execute(
            "SELECT count(*) FROM jobs WHERE company_id = %s", (company_ats_source.company_id,)
        ).fetchone()
    assert job_count == (7,)


@pytest.mark.integration
def test_run_ats_crawl_succeeds_with_a_mixed_case_ats_identifier() -> None:
    # Real bug found running against production: Lever's actual site slugs
    # for some companies are case-sensitive (e.g. "Zeller", "Lumary"), but
    # SnapshotStore.put() requires a lowercase source_key -- naively
    # building the source_key from the identifier's original case raised
    # ValueError on every mixed-case identifier.
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_ats_source = _setup_company_ats_source(database_url, suffix, "lever", "MixedCase")
    repository = JobRepository(database_url)
    store = FilesystemSnapshotStore(Path(tempfile.gettempdir()) / f"pipeline-test-{suffix}")

    result = run_ats_crawl(
        repository,
        store,
        database_url=database_url,
        company_ats_source=company_ats_source,
        skills=(),
        fetch_fn=lambda *a, **kw: _fake_fetch("lever_immutable_postings.json"),
    )

    assert result.created is True
    assert result.fetched == 7


@pytest.mark.integration
def test_run_ats_crawl_persists_real_ashby_postings() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_ats_source = _setup_company_ats_source(database_url, suffix, "ashby", "dovetail")
    repository = JobRepository(database_url)
    store = FilesystemSnapshotStore(Path(tempfile.gettempdir()) / f"pipeline-test-{suffix}")

    result = run_ats_crawl(
        repository,
        store,
        database_url=database_url,
        company_ats_source=company_ats_source,
        skills=(),
        fetch_fn=lambda *a, **kw: _fake_fetch("ashby_dovetail_postings.json"),
    )

    assert result.created is True
    assert result.fetched == 4
    assert result.jobs_created == 4

    with psycopg.connect(database_url) as connection:
        job_count = connection.execute(
            "SELECT count(*) FROM jobs WHERE company_id = %s", (company_ats_source.company_id,)
        ).fetchone()
    assert job_count == (4,)


@pytest.mark.integration
def test_run_ats_crawl_is_idempotent_at_the_run_level_on_the_same_day() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_ats_source = _setup_company_ats_source(database_url, suffix, "lever", "immutable")
    repository = JobRepository(database_url)
    store = FilesystemSnapshotStore(Path(tempfile.gettempdir()) / f"pipeline-test-{suffix}")
    fetch_fn = lambda *a, **kw: _fake_fetch("lever_immutable_postings.json")  # noqa: E731

    first = run_ats_crawl(
        repository, store, database_url=database_url, company_ats_source=company_ats_source,
        skills=(), fetch_fn=fetch_fn,
    )
    second = run_ats_crawl(
        repository, store, database_url=database_url, company_ats_source=company_ats_source,
        skills=(), fetch_fn=fetch_fn,
    )

    assert first.created is True
    assert second.created is False
    assert second.run_id == first.run_id


@pytest.mark.integration
def test_run_ats_crawl_retries_a_same_day_retryable_failure() -> None:
    # Real bug found running against production: a run that failed earlier
    # today (retry_wait, backoff elapsed) was never actually reclaimed on a
    # later same-day call -- `enqueue()` correctly finds the existing
    # idempotency-key row (`created=False`), but the old code treated that
    # alone as "already handled today" without ever attempting to claim it,
    # so a retryable failure could never be retried until the next day.
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_ats_source = _setup_company_ats_source(database_url, suffix, "lever", "immutable")
    repository = JobRepository(database_url)
    store = FilesystemSnapshotStore(Path(tempfile.gettempdir()) / f"pipeline-test-{suffix}")
    crawl_day = datetime(2026, 1, 1, tzinfo=UTC)

    def _failing_fetch(*args: object, **kwargs: object) -> SafeFetchResult:
        raise RuntimeError("simulated transient failure")

    with pytest.raises(RuntimeError, match="simulated transient failure"):
        run_ats_crawl(
            repository, store, database_url=database_url, company_ats_source=company_ats_source,
            skills=(), fetch_fn=_failing_fetch, now=crawl_day,
        )

    # Retry a couple of minutes later the same day -- past the first
    # retry's 1-minute backoff window.
    result = run_ats_crawl(
        repository, store, database_url=database_url, company_ats_source=company_ats_source,
        skills=(), fetch_fn=lambda *a, **kw: _fake_fetch("lever_immutable_postings.json"),
        now=crawl_day + timedelta(minutes=2),
    )

    assert result.created is True
    assert result.fetched == 7
