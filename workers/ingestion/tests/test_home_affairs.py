from __future__ import annotations

import os
import uuid
from datetime import date
from pathlib import Path

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.geography.home_affairs import (
    DEFAULT_FIXTURE_PATH,
    HomeAffairsFixture,
    StatePostcodeCategories,
    compute_state_categories,
    load_fixture,
    load_home_affairs_regional_release,
)
from austechmap_ingestion.geography.types import GeographyImportError
from austechmap_ingestion.jobs import JobRepository

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


def test_default_fixture_exists_and_parses_without_overlap() -> None:
    assert DEFAULT_FIXTURE_PATH.exists()
    fixture = load_fixture()
    assert len(fixture.states) == 8
    act = next(state for state in fixture.states if state.state == "ACT")
    assert act.category_2 == {f"{n:04d}" for n in range(2600, 2619)} | {
        f"{n:04d}" for n in range(2900, 2921)
    }
    assert act.category_3 == frozenset()


def test_compute_state_categories_expands_explicit_ranges() -> None:
    result = compute_state_categories(
        {
            "state": "NSW",
            "category_2_ranges": [[2000, 2002]],
            "category_3_ranges": [[2010, 2011]],
        }
    )
    assert result.category_2 == {"2000", "2001", "2002"}
    assert result.category_3 == {"2010", "2011"}


def test_compute_state_categories_all_remaining_excludes_category_2() -> None:
    result = compute_state_categories(
        {"state": "NT", "category_2_ranges": [[800, 801]], "category_3_all_remaining": True}
    )
    assert "0800" not in result.category_3
    assert "0801" not in result.category_3
    assert "0802" in result.category_3


def test_compute_state_categories_all_state_uses_full_range() -> None:
    result = compute_state_categories(
        {"state": "ACT", "category_2_all_state": True, "category_3_ranges": []}
    )
    assert "2600" in result.category_2
    assert "2920" in result.category_2
    assert "2619" not in result.category_2


def test_compute_state_categories_rejects_overlap() -> None:
    with pytest.raises(GeographyImportError, match="both category 2 and category 3"):
        compute_state_categories(
            {
                "state": "NSW",
                "category_2_ranges": [[2000, 2005]],
                "category_3_ranges": [[2003, 2010]],
            }
        )


@pytest.mark.integration
def test_load_home_affairs_regional_release_writes_postcode_rules() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"home-affairs-{suffix}", name="Home Affairs", kind="government_open_data"
    )
    fixture = HomeAffairsFixture(
        source_url="https://example.invalid/regional-postcodes",
        retrieved_at=date(2026, 1, 1),
        states=(
            StatePostcodeCategories("TST", frozenset({"9991"}), frozenset({"9992", "9993"})),
        ),
    )

    result = load_home_affairs_regional_release(
        database_url,
        fixture=fixture,
        release_version=suffix,
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 1, 1),
        content_hash="a" * 64,
    )

    assert result.category_2_count == 1
    assert result.category_3_count == 2
    with psycopg.connect(database_url) as connection:
        rows = connection.execute(
            "SELECT postcode, category FROM postcode_rules WHERE release_id = %s ORDER BY postcode",
            (result.release_id,),
        ).fetchall()
        release = connection.execute(
            "SELECT is_active, dataset FROM geography_releases WHERE id = %s",
            (result.release_id,),
        ).fetchone()
    assert rows == [("9991", "category_2"), ("9992", "category_3"), ("9993", "category_3")]
    assert release == (True, "home_affairs_regional")


@pytest.mark.integration
def test_load_home_affairs_regional_release_is_idempotent_on_retry() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"home-affairs-{suffix}", name="Home Affairs", kind="government_open_data"
    )
    fixture = HomeAffairsFixture(
        source_url="https://example.invalid/regional-postcodes",
        retrieved_at=date(2026, 1, 1),
        states=(StatePostcodeCategories("TST", frozenset({"9994"}), frozenset()),),
    )
    kwargs: dict[str, object] = {
        "fixture": fixture,
        "release_version": suffix,
        "source_id": source_id,
        "import_run_id": None,
        "effective_from": date(2026, 1, 1),
        "content_hash": "b" * 64,
    }

    first = load_home_affairs_regional_release(database_url, **kwargs)  # type: ignore[arg-type]
    second = load_home_affairs_regional_release(database_url, **kwargs)  # type: ignore[arg-type]

    assert first.release_id == second.release_id
    with psycopg.connect(database_url) as connection:
        count = connection.execute(
            "SELECT count(*) FROM postcode_rules WHERE release_id = %s", (first.release_id,)
        ).fetchone()
    assert count == (1,)


@pytest.mark.integration
def test_load_home_affairs_regional_release_deactivates_previous_release() -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"home-affairs-{suffix}", name="Home Affairs", kind="government_open_data"
    )
    def make_fixture(postcode: str) -> HomeAffairsFixture:
        return HomeAffairsFixture(
            source_url="https://example.invalid/regional-postcodes",
            retrieved_at=date(2026, 1, 1),
            states=(StatePostcodeCategories("TST", frozenset({postcode}), frozenset()),),
        )

    first = load_home_affairs_regional_release(
        database_url,
        fixture=make_fixture("9995"),
        release_version=f"v1-{suffix}",
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 1, 1),
        content_hash="c" * 64,
    )
    second = load_home_affairs_regional_release(
        database_url,
        fixture=make_fixture("9996"),
        release_version=f"v2-{suffix}",
        source_id=source_id,
        import_run_id=None,
        effective_from=date(2026, 7, 1),
        content_hash="d" * 64,
    )

    with psycopg.connect(database_url) as connection:
        first_active = connection.execute(
            "SELECT is_active FROM geography_releases WHERE id = %s", (first.release_id,)
        ).fetchone()
        second_active = connection.execute(
            "SELECT is_active FROM geography_releases WHERE id = %s", (second.release_id,)
        ).fetchone()
    assert first_active == (False,)
    assert second_active == (True,)
