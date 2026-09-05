from __future__ import annotations

import os
from pathlib import Path

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.employers.category_seed import (
    CATEGORY_GROUPS,
    CATEGORY_NICHES,
    seed_categories,
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
def test_seed_categories_creates_every_group_and_niche_with_correct_parents() -> None:
    database_url = _database_url()

    stats = seed_categories(database_url)

    assert stats.groups_created == len(CATEGORY_GROUPS)
    assert stats.niches_created == len(CATEGORY_NICHES)

    with psycopg.connect(database_url) as connection:
        group_keys = {
            row[0]
            for row in connection.execute(
                "SELECT key FROM categories WHERE parent_id IS NULL"
            ).fetchall()
        }
        niche_parent_by_key: dict[str, str] = dict(
            connection.execute(
                """
                SELECT child.key, parent.key
                FROM categories child
                JOIN categories parent ON parent.id = child.parent_id
                """
            ).fetchall()
        )
    # Not an exact-count assertion: other tests may share this database,
    # so only presence of the canonical keys (and their correct parent
    # linkage) is guaranteed here.
    assert {key for key, _label in CATEGORY_GROUPS} <= group_keys
    for niche_key, _label, parent_key in CATEGORY_NICHES:
        assert niche_parent_by_key[niche_key] == parent_key


@pytest.mark.integration
def test_seed_categories_is_idempotent_on_retry() -> None:
    database_url = _database_url()

    seed_categories(database_url)
    second = seed_categories(database_url)

    assert second.groups_created == 0
    assert second.niches_created == 0
