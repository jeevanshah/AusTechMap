from __future__ import annotations

import os
import uuid
from datetime import date
from pathlib import Path
from typing import cast

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.employers.labour_agreements import (
    LabourAgreementError,
    LabourAgreementRecord,
    load_labour_agreements_fixture,
    match_labour_agreements,
)

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


def test_load_labour_agreements_fixture_parses_a_real_shaped_csv(tmp_path: Path) -> None:
    fixture = tmp_path / "agreements.csv"
    fixture.write_text(
        "company_name,agreement_type,start_date,end_date\n"
        "Example Pty Ltd,Company Specific Agreement,2024-01-01,2027-01-01\n"
        "Another Co,Industry Labour Agreement,2023-06-15,\n",
        encoding="utf-8",
    )

    records = load_labour_agreements_fixture(fixture)

    assert records == [
        LabourAgreementRecord(
            company_name="Example Pty Ltd",
            agreement_type="Company Specific Agreement",
            start_date=date(2024, 1, 1),
            end_date=date(2027, 1, 1),
        ),
        LabourAgreementRecord(
            company_name="Another Co",
            agreement_type="Industry Labour Agreement",
            start_date=date(2023, 6, 15),
            end_date=None,
        ),
    ]


def test_load_labour_agreements_fixture_rejects_an_empty_file(tmp_path: Path) -> None:
    fixture = tmp_path / "empty.csv"
    fixture.write_text("company_name,agreement_type,start_date,end_date\n", encoding="utf-8")

    with pytest.raises(LabourAgreementError, match="no labour agreement records"):
        load_labour_agreements_fixture(fixture)


def _create_company(database_url: str, *, slug: str, display_name: str) -> uuid.UUID:
    with psycopg.connect(database_url, autocommit=True) as connection:
        row = connection.execute(
            "INSERT INTO companies (slug, display_name) VALUES (%s, %s) RETURNING id",
            (slug, display_name),
        ).fetchone()
    assert row is not None
    return cast(uuid.UUID, row[0])


@pytest.mark.integration
def test_match_labour_agreements_auto_accepts_an_exact_name_match() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id = _create_company(
        database_url,
        slug=f"labour-agreement-test-{suffix}",
        display_name=f"Acme Technology {suffix}",
    )
    records = [
        LabourAgreementRecord(
            company_name=f"Acme Technology {suffix}",
            agreement_type="Company Specific Agreement",
            start_date=date(2024, 1, 1),
            end_date=None,
        )
    ]

    stats = match_labour_agreements(database_url, records)

    assert stats.exact_matches >= 1
    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            """
            SELECT claim_type, confidence, claim_value ->> 'agreement_type' FROM evidence
            WHERE entity_type = 'company' AND entity_id = %s
            """,
            (str(company_id),),
        ).fetchone()
    assert row is not None
    claim_type, confidence, agreement_type = row
    assert claim_type == "sponsorship_labour_agreement"
    assert float(confidence) == pytest.approx(1.0)
    assert agreement_type == "Company Specific Agreement"


@pytest.mark.integration
def test_match_labour_agreements_is_idempotent_on_retry() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id = _create_company(
        database_url,
        slug=f"labour-agreement-retry-{suffix}",
        display_name=f"Retry Technology {suffix}",
    )
    records = [
        LabourAgreementRecord(
            company_name=f"Retry Technology {suffix}",
            agreement_type="Company Specific Agreement",
            start_date=date(2024, 1, 1),
            end_date=None,
        )
    ]

    match_labour_agreements(database_url, records)
    match_labour_agreements(database_url, records)

    with psycopg.connect(database_url) as connection:
        count = connection.execute(
            "SELECT count(*) FROM evidence WHERE entity_type = 'company' AND entity_id = %s",
            (str(company_id),),
        ).fetchone()
    assert count == (1,)


@pytest.mark.integration
def test_match_labour_agreements_routes_a_close_but_inexact_match_to_review() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id = _create_company(
        database_url,
        slug=f"labour-agreement-fuzzy-{suffix}",
        display_name=f"Fuzzy Match Technology Corp {suffix}",
    )
    records = [
        LabourAgreementRecord(
            company_name=f"Fuzzy Match Technology Corporation {suffix}",
            agreement_type="Industry Labour Agreement",
            start_date=date(2024, 1, 1),
            end_date=None,
        )
    ]

    stats = match_labour_agreements(database_url, records)

    assert stats.review_queue_items_created >= 1
    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            """
            SELECT status, payload ->> 'holder_name' FROM review_queue_items
            WHERE company_id = %s AND kind = 'sponsorship_match'
            """,
            (company_id,),
        ).fetchone()
        evidence_count = connection.execute(
            "SELECT count(*) FROM evidence WHERE entity_type = 'company' AND entity_id = %s",
            (str(company_id),),
        ).fetchone()
    assert row is not None
    assert row[0] == "pending"
    assert row[1] == f"Fuzzy Match Technology Corporation {suffix}"
    # Never auto-accepted as evidence -- only a human approving the review
    # item should ever turn this into a real claim.
    assert evidence_count == (0,)


@pytest.mark.integration
def test_match_labour_agreements_does_not_duplicate_a_pending_review_item() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    _create_company(
        database_url,
        slug=f"labour-agreement-fuzzy-retry-{suffix}",
        display_name=f"Second Fuzzy Technology Corp {suffix}",
    )
    records = [
        LabourAgreementRecord(
            company_name=f"Second Fuzzy Technology Corporation {suffix}",
            agreement_type="Industry Labour Agreement",
            start_date=date(2024, 1, 1),
            end_date=None,
        )
    ]

    match_labour_agreements(database_url, records)
    match_labour_agreements(database_url, records)

    with psycopg.connect(database_url) as connection:
        count = connection.execute(
            "SELECT count(*) FROM review_queue_items WHERE kind = 'sponsorship_match' "
            "AND payload ->> 'holder_name' = %s",
            (f"Second Fuzzy Technology Corporation {suffix}",),
        ).fetchone()
    assert count == (1,)


@pytest.mark.integration
def test_match_labour_agreements_leaves_a_genuinely_unrelated_company_untouched() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id = _create_company(
        database_url,
        slug=f"labour-agreement-nomatch-{suffix}",
        display_name=f"Totally Unrelated Business {suffix}",
    )
    records = [
        LabourAgreementRecord(
            company_name="A Completely Different Organisation Pty Ltd",
            agreement_type="Company Specific Agreement",
            start_date=date(2024, 1, 1),
            end_date=None,
        )
    ]

    stats = match_labour_agreements(database_url, records)

    assert stats.no_match >= 1
    with psycopg.connect(database_url) as connection:
        evidence_count = connection.execute(
            "SELECT count(*) FROM evidence WHERE entity_type = 'company' AND entity_id = %s",
            (str(company_id),),
        ).fetchone()
        review_count = connection.execute(
            "SELECT count(*) FROM review_queue_items WHERE company_id = %s", (company_id,)
        ).fetchone()
    assert evidence_count == (0,)
    assert review_count == (0,)
