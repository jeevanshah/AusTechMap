"""Home Affairs designated-regional-area (Category 2/3) postcode import.

Sourced from a hand-transcribed, dated fixture (geography/fixtures/), not a
live scrape — the Home Affairs page (see the fixture's own source_url) is
presentation HTML with no machine-readable export, and its structure could
change without notice. Re-transcribing when the source changes means adding
a new dated fixture file, not editing the old one — this is
ARCHITECTURE_DECISIONS.md's "normalisation rules ... are versioned
fixtures, not ad-hoc string edits" principle applied to policy data rather
than address normalisation.

DAMA (Designated Area Migration Agreement) postcode/region mapping is not
built here: each of the 13 DAMAs is its own separate agreement with its own
defined area, and this module deliberately does not guess at that
structure without verifying each one individually — it is a documented
follow-up, not an oversight (see PRODUCT_SPEC.md section 8.4).

Postcode ranges for the "all postcodes in a state" degenerate cases —
Western Australia, South Australia, Tasmania, and the Northern Territory
define Category 3 as "all postcodes not in Category 2" rather than an
explicit list — use Australia Post's well-known state postcode-range
allocation (STATE_POSTCODE_RANGES below), a separate, independently stable
public fact from Home Affairs' own policy table. Cross-check against real
ASGS POA data once loaded, rather than treating this as authoritative
forever.
"""

from __future__ import annotations

import json
import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import psycopg

from austechmap_ingestion.geography.types import GeographyImportError

DEFAULT_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "home_affairs_regional_20260904.json"

STATE_POSTCODE_RANGES: dict[str, list[tuple[int, int]]] = {
    "NSW": [(1000, 1999), (2000, 2599), (2619, 2899), (2921, 2999)],
    "ACT": [(2600, 2618), (2900, 2920)],
    "VIC": [(3000, 3999), (8000, 8999)],
    "QLD": [(4000, 4999), (9000, 9999)],
    "SA": [(5000, 5999)],
    "WA": [(6000, 6999)],
    "TAS": [(7000, 7999)],
    "NT": [(800, 999)],
}


def _expand(ranges: list[tuple[int, int]]) -> set[str]:
    postcodes: set[str] = set()
    for start, end in ranges:
        postcodes.update(f"{value:04d}" for value in range(start, end + 1))
    return postcodes


@dataclass(frozen=True)
class StatePostcodeCategories:
    state: str
    category_2: frozenset[str]
    category_3: frozenset[str]


def compute_state_categories(state_entry: dict[str, Any]) -> StatePostcodeCategories:
    state = state_entry["state"]
    if state_entry.get("category_2_all_state"):
        category_2 = _expand(STATE_POSTCODE_RANGES[state])
    else:
        category_2 = _expand([tuple(pair) for pair in state_entry["category_2_ranges"]])

    if state_entry.get("category_3_all_remaining"):
        category_3 = _expand(STATE_POSTCODE_RANGES[state]) - category_2
    else:
        category_3 = _expand([tuple(pair) for pair in state_entry["category_3_ranges"]])

    overlap = category_2 & category_3
    if overlap:
        raise GeographyImportError(
            f"{state}: {len(overlap)} postcode(s) claimed by both category 2 and "
            f"category 3: {sorted(overlap)[:5]}"
        )
    return StatePostcodeCategories(state, frozenset(category_2), frozenset(category_3))


@dataclass(frozen=True)
class HomeAffairsFixture:
    source_url: str
    retrieved_at: date
    states: tuple[StatePostcodeCategories, ...]


def load_fixture(path: Path = DEFAULT_FIXTURE_PATH) -> HomeAffairsFixture:
    data = json.loads(path.read_text(encoding="utf-8"))
    states = tuple(compute_state_categories(entry) for entry in data["states"])
    return HomeAffairsFixture(
        source_url=data["source_url"],
        retrieved_at=date.fromisoformat(data["retrieved_at"]),
        states=states,
    )


@dataclass(frozen=True)
class HomeAffairsLoadResult:
    release_id: uuid.UUID
    category_2_count: int
    category_3_count: int


def load_home_affairs_regional_release(
    database_url: str,
    *,
    fixture: HomeAffairsFixture,
    release_version: str,
    source_id: uuid.UUID,
    import_run_id: uuid.UUID | None,
    effective_from: date,
    content_hash: str,
    now: datetime | None = None,
) -> HomeAffairsLoadResult:
    """Load a Home Affairs Category 2/3 fixture as a new, activated release.

    Idempotent on (dataset, release_version), following the same pointer-
    flip pattern as load_asgs_release: a retry reuses the existing release
    row rather than duplicating postcode_rules, and activation deactivates
    any prior active home_affairs_regional release in the same transaction.
    """
    rows = [(postcode, "category_2") for state in fixture.states for postcode in state.category_2]
    rows += [(postcode, "category_3") for state in fixture.states for postcode in state.category_3]
    if not rows:
        raise GeographyImportError("refusing to activate an empty home_affairs_regional release")
    activation_time = now if now is not None else datetime.now(UTC)

    with psycopg.connect(database_url) as connection:
        existing = connection.execute(
            """
            SELECT id FROM geography_releases
            WHERE dataset = 'home_affairs_regional' AND release_version = %s
            """,
            (release_version,),
        ).fetchone()

        if existing is not None:
            release_id = existing[0]
            existing_count_row = connection.execute(
                "SELECT count(*) FROM postcode_rules WHERE release_id = %s", (release_id,)
            ).fetchone()
            existing_count = existing_count_row[0] if existing_count_row is not None else 0
            if existing_count != len(rows):
                raise GeographyImportError(
                    f"home_affairs_regional release {release_version} already has "
                    f"{existing_count} rules on record, but this attempt computed {len(rows)}"
                )
        else:
            release_row = connection.execute(
                """
                INSERT INTO geography_releases (
                  dataset, release_version, source_id, import_run_id,
                  effective_from, content_hash, row_count
                )
                VALUES ('home_affairs_regional', %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    release_version,
                    source_id,
                    import_run_id,
                    effective_from,
                    content_hash,
                    len(rows),
                ),
            ).fetchone()
            if release_row is None:
                raise GeographyImportError("geography_releases insert did not return an id")
            release_id = release_row[0]

            for postcode, category in rows:
                connection.execute(
                    """
                    INSERT INTO postcode_rules (release_id, postcode, category, valid_from)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (release_id, postcode, category, effective_from),
                )

        connection.execute(
            """
            UPDATE geography_releases
            SET is_active = false, effective_to = %s
            WHERE dataset = 'home_affairs_regional' AND is_active AND id <> %s
            """,
            (effective_from, release_id),
        )
        connection.execute(
            "UPDATE geography_releases SET is_active = true, activated_at = %s WHERE id = %s",
            (activation_time, release_id),
        )

    category_2_total = sum(len(state.category_2) for state in fixture.states)
    category_3_total = sum(len(state.category_3) for state in fixture.states)
    return HomeAffairsLoadResult(release_id, category_2_total, category_3_total)
