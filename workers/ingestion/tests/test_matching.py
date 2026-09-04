from __future__ import annotations

import os
import uuid
from pathlib import Path

import psycopg
import pytest
from _helpers import unique_valid_abn

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.employers.matching import (
    CandidateCompany,
    EmployerIdentityError,
    match_or_create_company,
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


def _source_id(database_url: str, suffix: str) -> uuid.UUID:
    repository = JobRepository(database_url)
    return repository.ensure_source(
        source_key=f"matching-{suffix}", name="Matching test source", kind="derived"
    )


@pytest.mark.integration
def test_match_or_create_company_creates_when_no_match() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    source_id = _source_id(database_url, suffix)

    result = match_or_create_company(
        database_url,
        CandidateCompany(display_name=f"Brand New Co {suffix}", source_id=source_id),
    )

    assert result.decision == "created"
    assert result.company_id is not None
    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            "SELECT status FROM companies WHERE id = %s", (result.company_id,)
        ).fetchone()
    assert row == ("pending_review",)


@pytest.mark.integration
def test_match_or_create_company_matches_by_abn_and_enriches() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    source_id = _source_id(database_url, suffix)
    abn = unique_valid_abn(suffix)

    with psycopg.connect(database_url, autocommit=True) as connection:
        existing_id = connection.execute(
            "INSERT INTO companies (slug, display_name, abn) VALUES (%s, %s, %s) RETURNING id",
            (f"acme-{suffix}", "Acme Technologies", abn),
        ).fetchone()
        assert existing_id is not None

    result = match_or_create_company(
        database_url,
        CandidateCompany(
            display_name="Acme Technologies Pty Ltd",
            source_id=source_id,
            abn=abn,
            acn="004085616",
            domain="acme.example.com",
            careers_url="https://acme.example.com/careers",
        ),
    )

    assert result.decision == "matched"
    assert result.company_id == existing_id[0]
    assert result.confidence == 1.0
    with psycopg.connect(database_url) as connection:
        company = connection.execute(
            "SELECT acn, domain, careers_url FROM companies WHERE id = %s", (existing_id[0],)
        ).fetchone()
        alias = connection.execute(
            "SELECT alias FROM company_aliases WHERE company_id = %s", (existing_id[0],)
        ).fetchone()
        evidence = connection.execute(
            "SELECT claim_type FROM evidence WHERE entity_id = %s", (str(existing_id[0]),)
        ).fetchone()
    assert company == ("004085616", "acme.example.com", "https://acme.example.com/careers")
    assert alias == ("Acme Technologies Pty Ltd",)
    assert evidence == ("identity_match",)


@pytest.mark.integration
def test_match_or_create_company_does_not_overwrite_existing_fields() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    source_id = _source_id(database_url, suffix)
    abn = unique_valid_abn(suffix)

    with psycopg.connect(database_url, autocommit=True) as connection:
        existing_id = connection.execute(
            """
            INSERT INTO companies (slug, display_name, abn, domain)
            VALUES (%s, %s, %s, 'already-set.example.com')
            RETURNING id
            """,
            (f"acme-{suffix}", "Acme Technologies", abn),
        ).fetchone()
        assert existing_id is not None

    match_or_create_company(
        database_url,
        CandidateCompany(
            display_name="Acme Technologies",
            source_id=source_id,
            abn=abn,
            domain="different.example.com",
        ),
    )

    with psycopg.connect(database_url) as connection:
        domain = connection.execute(
            "SELECT domain FROM companies WHERE id = %s", (existing_id[0],)
        ).fetchone()
    assert domain == ("already-set.example.com",)


@pytest.mark.integration
def test_match_or_create_company_routes_ambiguous_domain_to_review() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    source_id = _source_id(database_url, suffix)
    shared_domain = f"shared-{suffix}.example.com"

    with psycopg.connect(database_url, autocommit=True) as connection:
        connection.execute(
            "INSERT INTO companies (slug, display_name, domain) VALUES (%s, 'Brand A', %s)",
            (f"brand-a-{suffix}", shared_domain),
        )
        connection.execute(
            "INSERT INTO companies (slug, display_name, domain) VALUES (%s, 'Brand B', %s)",
            (f"brand-b-{suffix}", shared_domain),
        )

    result = match_or_create_company(
        database_url,
        CandidateCompany(display_name="Brand C", source_id=source_id, domain=shared_domain),
    )

    assert result.decision == "review"
    assert result.company_id is None
    with psycopg.connect(database_url) as connection:
        review_count = connection.execute(
            "SELECT count(*) FROM review_queue_items WHERE status = 'pending'"
        ).fetchone()
    assert review_count is not None and review_count[0] >= 1


@pytest.mark.integration
def test_match_or_create_company_routes_name_only_match_to_review_even_if_unique() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    source_id = _source_id(database_url, suffix)

    with psycopg.connect(database_url, autocommit=True) as connection:
        existing_id = connection.execute(
            "INSERT INTO companies (slug, display_name) VALUES (%s, %s) RETURNING id",
            (f"acme-{suffix}", f"Acme Widgets {suffix}"),
        ).fetchone()
        assert existing_id is not None

    result = match_or_create_company(
        database_url,
        CandidateCompany(display_name=f"Acme Widgets {suffix} Pty Ltd", source_id=source_id),
    )

    assert result.decision == "review"
    assert result.company_id is None


@pytest.mark.integration
def test_match_or_create_company_rejects_invalid_abn() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    source_id = _source_id(database_url, suffix)

    with pytest.raises(EmployerIdentityError, match="invalid ABN"):
        match_or_create_company(
            database_url,
            CandidateCompany(display_name="Bad ABN Co", source_id=source_id, abn="00000000001"),
        )
