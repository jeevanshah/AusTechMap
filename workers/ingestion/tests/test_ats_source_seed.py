from __future__ import annotations

import os
import uuid
from pathlib import Path

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.hiring.ats_source_seed import (
    ATS_SOURCE_SEED,
    DEFAULT_FIXTURE_PATH,
    AtsSourceSeed,
    AtsSourceSeedError,
    load_ats_source_seed_fixture,
    seed_ats_sources,
)

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


def test_default_fixture_exists_and_parses() -> None:
    assert DEFAULT_FIXTURE_PATH.exists()
    seeds = load_ats_source_seed_fixture()
    assert seeds == ATS_SOURCE_SEED
    assert len(seeds) == 10
    by_domain = {seed.company_domain: seed for seed in seeds}
    assert by_domain["kasada.io"].ats_provider == "lever"
    assert by_domain["kasada.io"].ats_identifier == "kasada"
    assert by_domain["vowfood.com"].ats_provider == "ashby"
    assert by_domain["vowfood.com"].ats_identifier == "vow"
    assert all(seed.discovered_method == "manual_verified" for seed in seeds)


def test_load_ats_source_seed_fixture_rejects_an_unrecognised_provider(
    tmp_path: Path,
) -> None:
    bad_fixture = tmp_path / "bad.csv"
    bad_fixture.write_text(
        'company_domain,ats_provider,ats_identifier\nexample.com,workday,example\n',
        encoding="utf-8",
    )
    with pytest.raises(AtsSourceSeedError, match="unrecognised ats_provider"):
        load_ats_source_seed_fixture(bad_fixture)


@pytest.mark.integration
def test_seed_ats_sources_creates_a_row_for_a_uniquely_matched_domain() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    domain = f"ats-test-{suffix}.example.com"

    with psycopg.connect(database_url, autocommit=True) as connection:
        company_id = connection.execute(
            "INSERT INTO companies (slug, display_name, domain) VALUES (%s, %s, %s) RETURNING id",
            (f"ats-test-{suffix}", f"ATS Test Co {suffix}", domain),
        ).fetchone()
    assert company_id is not None

    seeds = (
        AtsSourceSeed(company_domain=domain, ats_provider="lever", ats_identifier=f"co-{suffix}"),
    )
    stats = seed_ats_sources(database_url, seeds)

    assert stats.created == 1
    assert stats.reused == 0
    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            """
            SELECT company_id, ats_provider, ats_identifier FROM company_ats_sources
            WHERE company_id = %s
            """,
            (company_id[0],),
        ).fetchone()
    assert row == (company_id[0], "lever", f"co-{suffix}")


@pytest.mark.integration
def test_seed_ats_sources_is_idempotent_on_retry() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    domain = f"ats-retry-{suffix}.example.com"

    with psycopg.connect(database_url, autocommit=True) as connection:
        connection.execute(
            "INSERT INTO companies (slug, display_name, domain) VALUES (%s, %s, %s)",
            (f"ats-retry-{suffix}", f"ATS Retry Co {suffix}", domain),
        )

    seeds = (
        AtsSourceSeed(
            company_domain=domain, ats_provider="ashby", ats_identifier=f"retry-{suffix}"
        ),
    )
    first = seed_ats_sources(database_url, seeds)
    second = seed_ats_sources(database_url, seeds)

    assert first.created == 1
    assert second.created == 0
    assert second.reused == 1


@pytest.mark.integration
def test_seed_ats_sources_raises_for_a_domain_matching_zero_companies() -> None:
    database_url = _database_url()
    seeds = (
        AtsSourceSeed(
            company_domain=f"nonexistent-{uuid.uuid4().hex}.example.com",
            ats_provider="lever",
            ats_identifier="nope",
        ),
    )
    with pytest.raises(AtsSourceSeedError, match="found 0"):
        seed_ats_sources(database_url, seeds)


@pytest.mark.integration
def test_seed_ats_sources_raises_for_a_domain_matching_multiple_companies() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex
    domain = f"ats-ambiguous-{suffix}.example.com"

    with psycopg.connect(database_url, autocommit=True) as connection:
        connection.execute(
            "INSERT INTO companies (slug, display_name, domain) VALUES (%s, %s, %s)",
            (f"ats-ambiguous-a-{suffix}", f"Ambiguous A {suffix}", domain),
        )
        connection.execute(
            "INSERT INTO companies (slug, display_name, domain) VALUES (%s, %s, %s)",
            (f"ats-ambiguous-b-{suffix}", f"Ambiguous B {suffix}", domain),
        )

    seeds = (
        AtsSourceSeed(company_domain=domain, ats_provider="lever", ats_identifier="ambiguous"),
    )
    with pytest.raises(AtsSourceSeedError, match="found 2"):
        seed_ats_sources(database_url, seeds)
