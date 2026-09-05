"""Applies the G-NAF exact-match upgrade trigger documented in
ARCHITECTURE_DECISIONS.md §4.3: once a real G-NAF release is acquired and
activated, re-resolve interim Nominatim/Mapbox (`external_geocoder`)
`resolved_locations` rows through the exact-match pipeline and retire
them.

`resolved_locations` is a cache keyed by `input_hash` (one row per
distinct address string, enforced by a UNIQUE constraint) -- not an
append-only observation log the way `jobs`/`job_observations` are.
"Retire" therefore means updating that one row in place, after recording
its prior state as an `evidence` row first, so the fact it was ever
resolved via a third-party geocoder is never silently lost.

Deliberately not included here: turning a free-text address line (e.g.
"Level 6, 341 George Street") into the structured fields
`AddressMatchInput` needs (flat/level/street number/name/type). The real
133-address fixture has genuinely messy real-world formats -- number
ranges ("10-14 Waterloo Street"), institutional addresses with no street
number at all ("Lot Fourteen, North Terrace"), building-name prefixes --
and Gemini's own ad hoc matching script already produced a real, verified
93/20/20 accepted/ambiguous/no_match breakdown against these addresses.
Reimplementing that parsing blind risked silently diverging from an
already-verified result; the functions below take an already-computed
`GnafMatchResult` as input instead of computing one themselves.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any, cast

import psycopg
from psycopg.types.json import Jsonb

from austechmap_ingestion.geography.gnaf import GnafMatchResult
from austechmap_ingestion.geography.locations import (
    RegionMatch,
    lookup_migration_category,
    resolve_point,
)
from austechmap_ingestion.geography.types import GeographyImportError, RegionType


def activate_gnaf_release(
    database_url: str,
    *,
    release_version: str,
    source_id: uuid.UUID,
    effective_from: date,
    content_hash: str,
    row_count: int,
    now: datetime | None = None,
) -> uuid.UUID:
    """Create (or reuse) and activate a `geography_releases` row for the
    `gnaf` dataset, deactivating any prior active `gnaf` release --
    mirrors `load_asgs_release`'s activation pattern exactly. G-NAF's own
    DuckDB index is local/ephemeral per ARCHITECTURE_DECISIONS.md §4.3 and
    was never itself tracked as a release before this upgrade needed a
    real `gnaf_release_id` to satisfy `resolved_locations`' CHECK
    constraint (`method = 'gnaf_exact_match'` requires one).

    Idempotent on (dataset, release_version): a retry reuses the existing
    release row rather than inserting a duplicate.
    """
    activation_time = now if now is not None else datetime.now(UTC)
    with psycopg.connect(database_url) as connection:
        existing = connection.execute(
            """
            SELECT id, row_count FROM geography_releases
            WHERE dataset = 'gnaf' AND release_version = %s
            """,
            (release_version,),
        ).fetchone()

        if existing is not None:
            release_id = cast(uuid.UUID, existing[0])
            existing_row_count = existing[1]
            if existing_row_count != row_count:
                raise GeographyImportError(
                    f"gnaf release {release_version} already has {existing_row_count} rows "
                    f"on record, but this attempt reports {row_count}"
                )
        else:
            release_row = connection.execute(
                """
                INSERT INTO geography_releases (
                  dataset, release_version, source_id, effective_from, content_hash, row_count
                )
                VALUES ('gnaf', %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (release_version, source_id, effective_from, content_hash, row_count),
            ).fetchone()
            if release_row is None:
                raise GeographyImportError("geography_releases insert did not return an id")
            release_id = cast(uuid.UUID, release_row[0])

        connection.execute(
            """
            UPDATE geography_releases
            SET is_active = false, effective_to = %s
            WHERE dataset = 'gnaf' AND is_active AND id <> %s
            """,
            (effective_from, release_id),
        )
        connection.execute(
            "UPDATE geography_releases SET is_active = true, activated_at = %s WHERE id = %s",
            (activation_time, release_id),
        )

    return release_id


def apply_gnaf_match_to_location(
    connection: psycopg.Connection[Any],
    *,
    resolved_location_id: uuid.UUID,
    match: GnafMatchResult,
    gnaf_release_id: uuid.UUID,
    source_id: uuid.UUID,
    now: datetime | None = None,
) -> None:
    """Upgrades one `resolved_locations` row in place from an interim
    `external_geocoder` resolution to a real `gnaf_exact_match` one.

    Only call this for a `match.status == "accepted"` result -- an
    ambiguous or no-match result must leave the existing interim row
    completely untouched, per the same "auto-accept only a unique exact
    match" rule the original G-NAF matching pass itself follows.

    Records the prior method/coordinate as an `evidence` row before
    overwriting -- `resolved_locations` has no room for history itself
    (it's a cache keyed by `input_hash`, not an append-only log).
    """
    if match.status != "accepted" or match.longitude is None or match.latitude is None:
        raise GeographyImportError(
            f"refusing to apply a non-accepted match to resolved_location "
            f"{resolved_location_id}: status={match.status!r}"
        )

    resolved_at = now if now is not None else datetime.now(UTC)
    prior = connection.execute(
        "SELECT method, ST_X(point), ST_Y(point) FROM resolved_locations WHERE id = %s",
        (resolved_location_id,),
    ).fetchone()
    if prior is None:
        raise GeographyImportError(f"resolved_locations row not found: {resolved_location_id}")
    previous_method, previous_longitude, previous_latitude = prior

    connection.execute(
        """
        INSERT INTO evidence (
          entity_type, entity_id, claim_type, claim_value, source_id, confidence, observed_at
        )
        VALUES ('resolved_location', %s, 'gnaf_upgrade_prior_state', %s, %s, 1.0, %s)
        """,
        (
            str(resolved_location_id),
            Jsonb(
                {
                    "previous_method": previous_method,
                    "previous_longitude": previous_longitude,
                    "previous_latitude": previous_latitude,
                }
            ),
            source_id,
            resolved_at,
        ),
    )

    resolution = resolve_point(connection, match.longitude, match.latitude)
    poa_match = resolution.matches.get("poa")
    migration_category: str | None = None
    migration_dama_name: str | None = None
    if poa_match is not None:
        migration = lookup_migration_category(connection, poa_match.code, resolved_at.date())
        if migration is not None:
            migration_category, migration_dama_name = migration

    connection.execute(
        """
        UPDATE resolved_locations
        SET method = 'gnaf_exact_match',
            matched_gnaf_pid = %(pid)s,
            gnaf_release_id = %(release_id)s,
            point = ST_SetSRID(ST_MakePoint(%(lng)s, %(lat)s), 4326),
            sa1_region_id = %(sa1)s, sa2_region_id = %(sa2)s, sa3_region_id = %(sa3)s,
            sa4_region_id = %(sa4)s, lga_region_id = %(lga)s, poa_region_id = %(poa)s,
            migration_category = %(migration_category)s,
            migration_dama_name = %(migration_dama_name)s,
            candidate_count = %(candidate_count)s,
            resolved_at = %(resolved_at)s
        WHERE id = %(id)s
        """,
        {
            "pid": match.address_detail_pid,
            "release_id": gnaf_release_id,
            "lng": match.longitude,
            "lat": match.latitude,
            "sa1": _region_id(resolution.matches, "sa1"),
            "sa2": _region_id(resolution.matches, "sa2"),
            "sa3": _region_id(resolution.matches, "sa3"),
            "sa4": _region_id(resolution.matches, "sa4"),
            "lga": _region_id(resolution.matches, "lga"),
            "poa": _region_id(resolution.matches, "poa"),
            "migration_category": migration_category,
            "migration_dama_name": migration_dama_name,
            "candidate_count": match.candidate_count,
            "resolved_at": resolved_at,
            "id": resolved_location_id,
        },
    )


def _region_id(
    matches: dict[RegionType, RegionMatch], region_type: RegionType
) -> uuid.UUID | None:
    match = matches.get(region_type)
    return match.region_id if match is not None else None


@dataclass(frozen=True)
class GnafUpgradeStats:
    upgraded: int
    skipped_not_accepted: int


def apply_gnaf_matches(
    database_url: str,
    *,
    gnaf_release_id: uuid.UUID,
    source_id: uuid.UUID,
    matches: Sequence[tuple[uuid.UUID, GnafMatchResult]],
    now: datetime | None = None,
) -> GnafUpgradeStats:
    """Batch entry point: applies every accepted match, skips (does not
    touch) every ambiguous/no_match/out_of_bounds one. Each
    (resolved_location_id, GnafMatchResult) pair is expected to come from
    a separate, reviewed address-matching step -- this function does not
    parse addresses or call match_addresses_exact itself.
    """
    upgraded = skipped = 0
    with psycopg.connect(database_url) as connection, connection.transaction():
        for resolved_location_id, match in matches:
            if match.status != "accepted":
                skipped += 1
                continue
            apply_gnaf_match_to_location(
                connection,
                resolved_location_id=resolved_location_id,
                match=match,
                gnaf_release_id=gnaf_release_id,
                source_id=source_id,
                now=now,
            )
            upgraded += 1
    return GnafUpgradeStats(upgraded=upgraded, skipped_not_accepted=skipped)
