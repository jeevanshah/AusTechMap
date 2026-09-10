from __future__ import annotations

import hashlib
import os
import uuid
from pathlib import Path

import psycopg
import pytest
from psycopg.types.json import Jsonb

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.employers.geocoding import GeocodeResult
from austechmap_ingestion.employers.location_promotion import promote_evidenced_locations

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


@pytest.mark.integration
def test_promotion_is_dry_run_first_then_updates_and_audits(tmp_path: Path) -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    domain = f"promote-{suffix}.example.com"
    source_url = f"https://{domain}/contact"
    query = "341 George Street, Sydney NSW 2000, Australia"
    fixture = tmp_path / "promotion.csv"
    fixture.write_text(
        "domain,street_address,suburb,state,postcode,source_confidence,source_note,source_url\n"
        f"{domain},341 George Street,Sydney,NSW,2000,High,test,{source_url}\n",
        encoding="utf-8",
    )
    input_hash = hashlib.sha256(query.encode()).hexdigest()

    with psycopg.connect(database_url, autocommit=True) as connection:
        inserted_company = connection.execute(
            "INSERT INTO companies (slug, display_name, domain) VALUES (%s, %s, %s) RETURNING id",
            (f"promote-{suffix}", f"Promotion {suffix}", domain),
        ).fetchone()
        assert inserted_company is not None
        company_id = inserted_company[0]
        inserted_source = connection.execute(
            """
            INSERT INTO data_sources (source_key, name, kind)
            VALUES (%s, %s, 'employer_first_party')
            RETURNING id
            """,
            (f"promotion-source-{suffix}", f"Promotion source {suffix}"),
        ).fetchone()
        assert inserted_source is not None
        source_id = inserted_source[0]
        inserted_location = connection.execute(
            """
            INSERT INTO resolved_locations (input_hash, input_text, status, method, candidate_count)
            VALUES (%s, %s, 'ambiguous', 'external_geocoder', 2)
            RETURNING id
            """,
            (input_hash, query),
        ).fetchone()
        assert inserted_location is not None
        location_id = inserted_location[0]
        connection.execute(
            """
            INSERT INTO company_locations (company_id, resolved_location_id, raw_address, source_id)
            VALUES (%s, %s, %s, %s)
            """,
            (company_id, location_id, query, source_id),
        )
        connection.execute(
            """
            INSERT INTO evidence (
              entity_type, entity_id, claim_type, claim_value, source_id, confidence, observed_at
            )
            VALUES ('company', %s, 'location_source', %s, %s, 1.0, now())
            """,
            (str(company_id), Jsonb({"source_url": source_url}), source_id),
        )

    preview = promote_evidenced_locations(database_url, fixture_path=fixture)
    assert preview.proposed == 1
    assert preview.promoted == 0
    assert not preview.applied

    def geocode(_credential: str, query_text: str) -> GeocodeResult:
        assert query_text == query
        return GeocodeResult(longitude=151.2093, latitude=-33.8688, full_address=query_text)

    applied = promote_evidenced_locations(
        database_url,
        fixture_path=fixture,
        actor_id="test-promotion",
        apply=True,
        geocode_fn=geocode,
    )
    assert applied.promoted == 1
    assert applied.audit_records == 1
    assert applied.errors == ()

    with psycopg.connect(database_url) as connection:
        location = connection.execute(
            """
            SELECT status, method::text, point IS NOT NULL, candidate_count
            FROM resolved_locations WHERE id = %s
            """,
            (location_id,),
        ).fetchone()
        audit_result = connection.execute(
            """
            SELECT count(*) FROM audit_records
            WHERE action = 'location_promoted_evidence_backed' AND actor_id = 'test-promotion'
            """
        ).fetchone()
        assert audit_result is not None
        audit_count = audit_result[0]
    assert location == ("accepted", "external_geocoder", True, None)
    assert audit_count == 1
