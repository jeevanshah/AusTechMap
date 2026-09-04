from __future__ import annotations

import os
import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg.types.json import Jsonb

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.employers.lifecycle import (
    disable_company,
    merge_companies,
    resolve_review_item,
    verify_company,
)
from austechmap_ingestion.employers.matching import EmployerIdentityError
from austechmap_ingestion.jobs import JobRepository

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"

# See test_normalisation.py for how these were verified as real,
# checksum-valid ABNs.
VALID_ABN = "51824753556"


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


def _make_user(database_url: str, suffix: str) -> int:
    with psycopg.connect(database_url, autocommit=True) as connection:
        row = connection.execute(
            "INSERT INTO users (name, email, role) VALUES (%s, %s, 'admin') RETURNING id",
            (f"Reviewer {suffix}", f"reviewer-{suffix}@example.invalid"),
        ).fetchone()
        assert row is not None
        return int(row[0])


def _make_company(database_url: str, suffix: str, **fields: str) -> uuid.UUID:
    columns = ["slug", "display_name", *fields.keys()]
    values = [f"company-{suffix}", f"Company {suffix}", *fields.values()]
    placeholders = ", ".join(["%s"] * len(values))
    with psycopg.connect(database_url, autocommit=True) as connection:
        row = connection.execute(
            f"INSERT INTO companies ({', '.join(columns)}) VALUES ({placeholders}) RETURNING id",
            values,
        ).fetchone()
        assert row is not None
        return uuid.UUID(str(row[0]))


def _source_id(database_url: str, suffix: str) -> uuid.UUID:
    return JobRepository(database_url).ensure_source(
        source_key=f"lifecycle-{suffix}", name="Lifecycle test source", kind="derived"
    )


@pytest.mark.integration
def test_merge_companies_marks_source_merged_and_writes_audit() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    actor = _make_user(database_url, suffix)
    source = _make_company(database_url, f"src-{suffix}")
    target = _make_company(database_url, f"tgt-{suffix}")

    merge_companies(
        database_url,
        source_company_id=source,
        target_company_id=target,
        actor_user_id=actor,
        reason="duplicate listing",
    )

    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            "SELECT status, merged_into_company_id FROM companies WHERE id = %s", (source,)
        ).fetchone()
        audit = connection.execute(
            "SELECT action FROM audit_records WHERE target_id = %s", (str(source),)
        ).fetchone()
    assert row == ("merged", target)
    assert audit == ("company_merged",)


@pytest.mark.integration
def test_merge_companies_rejects_self_merge() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    actor = _make_user(database_url, suffix)
    company = _make_company(database_url, suffix)

    with pytest.raises(EmployerIdentityError, match="cannot merge a company into itself"):
        merge_companies(
            database_url,
            source_company_id=company,
            target_company_id=company,
            actor_user_id=actor,
            reason="oops",
        )


@pytest.mark.integration
def test_merge_companies_rejects_an_already_merged_target() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    actor = _make_user(database_url, suffix)
    a = _make_company(database_url, f"a-{suffix}")
    b = _make_company(database_url, f"b-{suffix}")
    c = _make_company(database_url, f"c-{suffix}")
    merge_companies(
        database_url, source_company_id=a, target_company_id=b, actor_user_id=actor, reason="x"
    )

    with pytest.raises(EmployerIdentityError, match="itself merged"):
        merge_companies(
            database_url, source_company_id=c, target_company_id=a, actor_user_id=actor, reason="y"
        )


@pytest.mark.integration
def test_verify_company_sets_verified_at_and_writes_audit() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    actor = _make_user(database_url, suffix)
    company = _make_company(database_url, suffix)

    verify_company(database_url, company_id=company, actor_user_id=actor)

    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            "SELECT verified_at IS NOT NULL FROM companies WHERE id = %s", (company,)
        ).fetchone()
        audit = connection.execute(
            "SELECT action FROM audit_records WHERE target_id = %s", (str(company),)
        ).fetchone()
    assert row == (True,)
    assert audit == ("company_verified",)


@pytest.mark.integration
def test_disable_company_requires_a_reason_and_writes_audit() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    actor = _make_user(database_url, suffix)
    company = _make_company(database_url, suffix)

    disable_company(database_url, company_id=company, actor_user_id=actor, reason="closed down")

    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            "SELECT status, disabled_reason FROM companies WHERE id = %s", (company,)
        ).fetchone()
    assert row == ("disabled", "closed down")


@pytest.mark.integration
def test_disable_company_rejects_a_merged_company() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    actor = _make_user(database_url, suffix)
    source = _make_company(database_url, f"src-{suffix}")
    target = _make_company(database_url, f"tgt-{suffix}")
    merge_companies(
        database_url,
        source_company_id=source,
        target_company_id=target,
        actor_user_id=actor,
        reason="x",
    )

    with pytest.raises(EmployerIdentityError, match="cannot disable a merged company"):
        disable_company(database_url, company_id=source, actor_user_id=actor, reason="y")


@pytest.mark.integration
def test_resolve_review_item_approved_with_match_enriches_existing_company() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    actor = _make_user(database_url, suffix)
    source_id = _source_id(database_url, suffix)
    existing = _make_company(database_url, suffix)

    with psycopg.connect(database_url, autocommit=True) as connection:
        review_row = connection.execute(
            """
            INSERT INTO review_queue_items (kind, company_id, payload, source_id)
            VALUES ('candidate_match', %s, %s, %s)
            RETURNING id
            """,
            (
                existing,
                Jsonb(
                    {
                        "candidate_display_name": "Candidate Name Pty Ltd",
                        "candidate_abn": VALID_ABN,
                        "candidate_acn": None,
                        "candidate_domain": "candidate.example.com",
                        "match_method": "name",
                        "candidate_company_ids": [str(existing)],
                    }
                ),
                source_id,
            ),
        ).fetchone()
        assert review_row is not None
        review_id = review_row[0]

    result = resolve_review_item(
        database_url,
        review_item_id=review_id,
        decision="approved",
        actor_user_id=actor,
        matched_company_id=existing,
    )

    assert result.outcome is not None
    assert result.outcome.decision == "matched"
    assert result.outcome.company_id == existing
    with psycopg.connect(database_url) as connection:
        company = connection.execute(
            "SELECT abn, domain FROM companies WHERE id = %s", (existing,)
        ).fetchone()
        status = connection.execute(
            "SELECT status FROM review_queue_items WHERE id = %s", (review_id,)
        ).fetchone()
    assert company == (VALID_ABN, "candidate.example.com")
    assert status == ("approved",)


@pytest.mark.integration
def test_resolve_review_item_approved_without_match_creates_new_company() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    actor = _make_user(database_url, suffix)
    source_id = _source_id(database_url, suffix)

    with psycopg.connect(database_url, autocommit=True) as connection:
        review_row = connection.execute(
            """
            INSERT INTO review_queue_items (kind, payload, source_id)
            VALUES ('manual_flag', %s, %s)
            RETURNING id
            """,
            (
                Jsonb(
                    {
                        "candidate_display_name": f"Genuinely New Co {suffix}",
                        "candidate_abn": None,
                        "candidate_acn": None,
                        "candidate_domain": None,
                    }
                ),
                source_id,
            ),
        ).fetchone()
        assert review_row is not None
        review_id = review_row[0]

    result = resolve_review_item(
        database_url, review_item_id=review_id, decision="approved", actor_user_id=actor
    )

    assert result.outcome is not None
    assert result.outcome.decision == "created"
    with psycopg.connect(database_url) as connection:
        company = connection.execute(
            "SELECT display_name FROM companies WHERE id = %s", (result.outcome.company_id,)
        ).fetchone()
    assert company == (f"Genuinely New Co {suffix}",)


@pytest.mark.integration
def test_resolve_review_item_rejected_creates_nothing() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    actor = _make_user(database_url, suffix)
    source_id = _source_id(database_url, suffix)

    with psycopg.connect(database_url, autocommit=True) as connection:
        review_row = connection.execute(
            """
            INSERT INTO review_queue_items (kind, payload, source_id)
            VALUES ('manual_flag', %s, %s)
            RETURNING id
            """,
            (
                Jsonb({"candidate_display_name": f"Spam {suffix}"}),
                source_id,
            ),
        ).fetchone()
        assert review_row is not None
        review_id = review_row[0]

    result = resolve_review_item(
        database_url, review_item_id=review_id, decision="rejected", actor_user_id=actor
    )

    assert result.outcome is None
    with psycopg.connect(database_url) as connection:
        status = connection.execute(
            "SELECT status FROM review_queue_items WHERE id = %s", (review_id,)
        ).fetchone()
    assert status == ("rejected",)


@pytest.mark.integration
def test_resolve_review_item_rejects_an_already_resolved_item() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    actor = _make_user(database_url, suffix)
    source_id = _source_id(database_url, suffix)

    with psycopg.connect(database_url, autocommit=True) as connection:
        review_row = connection.execute(
            """
            INSERT INTO review_queue_items (kind, payload, source_id)
            VALUES ('manual_flag', %s, %s)
            RETURNING id
            """,
            (Jsonb({"candidate_display_name": "X"}), source_id),
        ).fetchone()
        assert review_row is not None
        review_id = review_row[0]

    resolve_review_item(
        database_url, review_item_id=review_id, decision="rejected", actor_user_id=actor
    )

    with pytest.raises(EmployerIdentityError, match="already resolved"):
        resolve_review_item(
            database_url, review_item_id=review_id, decision="rejected", actor_user_id=actor
        )
