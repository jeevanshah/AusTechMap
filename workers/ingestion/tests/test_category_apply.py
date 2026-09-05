from __future__ import annotations

import os
import uuid
from pathlib import Path
from typing import cast
from uuid import UUID

import psycopg
import pytest
from psycopg.types.json import Jsonb

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.employers.category_apply import apply_company_categories
from austechmap_ingestion.employers.category_seed import seed_categories
from austechmap_ingestion.jobs import JobRepository

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    seed_categories(database_url)
    return database_url


def _seed_company_with_reason(database_url: str, suffix: str, reason: str) -> UUID:
    source_id = JobRepository(database_url).ensure_source(
        source_key=f"category-apply-test-{suffix}", name="Category apply test", kind="derived"
    )
    with psycopg.connect(database_url, autocommit=True) as connection:
        company_row = connection.execute(
            "INSERT INTO companies (slug, display_name) VALUES (%s, %s) RETURNING id",
            (f"category-apply-test-{suffix}", f"Category Apply Test Co {suffix}"),
        ).fetchone()
        assert company_row is not None
        connection.execute(
            """
            INSERT INTO evidence (
              entity_type, entity_id, claim_type, claim_value, source_id, confidence, observed_at
            )
            VALUES ('company', %s, 'employer_seed_research', %s, %s, 1.0, now())
            """,
            (str(company_row[0]), Jsonb({"reason": reason}), source_id),
        )
    return cast(UUID, company_row[0])


@pytest.mark.integration
def test_apply_company_categories_links_every_matching_niche() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id = _seed_company_with_reason(
        database_url, suffix, "A leading fintech payments platform"
    )

    stats = apply_company_categories(database_url)

    assert stats.companies_matched >= 1
    with psycopg.connect(database_url) as connection:
        linked_keys = {
            row[0]
            for row in connection.execute(
                """
                SELECT cat.key FROM company_category_links link
                JOIN categories cat ON cat.id = link.category_id
                WHERE link.company_id = %s
                """,
                (company_id,),
            ).fetchall()
        }
        method_and_confidence = connection.execute(
            """
            SELECT method, confidence FROM company_category_links link
            JOIN categories cat ON cat.id = link.category_id
            WHERE link.company_id = %s AND cat.key = 'fintech'
            """,
            (company_id,),
        ).fetchone()
    assert linked_keys == {"fintech", "payments"}
    assert method_and_confidence is not None
    assert method_and_confidence[0] == "keyword_match"
    assert float(method_and_confidence[1]) == pytest.approx(0.6)


@pytest.mark.integration
def test_apply_company_categories_is_idempotent_on_retry() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id = _seed_company_with_reason(database_url, suffix, "A pure-play edtech company")

    apply_company_categories(database_url)
    apply_company_categories(database_url)

    with psycopg.connect(database_url) as connection:
        link_count = connection.execute(
            "SELECT count(*) FROM company_category_links WHERE company_id = %s", (company_id,)
        ).fetchone()
    assert link_count == (1,)


@pytest.mark.integration
def test_apply_company_categories_skips_a_company_with_no_niche_match() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    company_id = _seed_company_with_reason(
        database_url, suffix, "Founded in Sydney, backed by local venture capital investors"
    )

    apply_company_categories(database_url)

    with psycopg.connect(database_url) as connection:
        link_count = connection.execute(
            "SELECT count(*) FROM company_category_links WHERE company_id = %s", (company_id,)
        ).fetchone()
    assert link_count == (0,)
