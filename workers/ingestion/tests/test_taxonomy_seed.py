from __future__ import annotations

import os
from pathlib import Path

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.hiring.taxonomy_seed import ROLE_FAMILIES, SKILLS, seed_taxonomy

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


@pytest.mark.integration
def test_seed_taxonomy_creates_all_role_families_and_skills() -> None:
    database_url = _database_url()

    stats = seed_taxonomy(database_url)

    assert stats.role_families_created == len(ROLE_FAMILIES)
    assert stats.skills_created == len(SKILLS)
    with psycopg.connect(database_url) as connection:
        role_family_count = connection.execute("SELECT count(*) FROM role_families").fetchone()
        skill_count = connection.execute("SELECT count(*) FROM skills").fetchone()
    assert role_family_count == (len(ROLE_FAMILIES),)
    assert skill_count == (len(SKILLS),)


@pytest.mark.integration
def test_seed_taxonomy_is_idempotent_on_retry() -> None:
    database_url = _database_url()

    first = seed_taxonomy(database_url)
    second = seed_taxonomy(database_url)

    assert first.role_families_created == len(ROLE_FAMILIES)
    assert second.role_families_created == 0
    assert second.skills_created == 0
    with psycopg.connect(database_url) as connection:
        role_family_count = connection.execute("SELECT count(*) FROM role_families").fetchone()
    assert role_family_count == (len(ROLE_FAMILIES),)
