"""Point-in-polygon and postcode-centroid location resolution (Phase 2).

The higher-precision gnaf_exact_match path is populated by the G-NAF
pipeline, not this module; this module implements the postcode_centroid
fallback path and the region/migration lookups both paths share. See
ARCHITECTURE_DECISIONS.md section 4.3 for the Australian-bounds and
review-routing rules this implements.
"""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import date
from typing import Any, Literal

import psycopg

from austechmap_ingestion.geography.types import GeographyImportError, RegionType

LocationMatchStatus = Literal["accepted", "ambiguous", "no_match", "out_of_bounds", "invalid_input"]

AUSTRALIA_LONGITUDE_RANGE = (96.0, 168.0)
AUSTRALIA_LATITUDE_RANGE = (-45.0, -9.0)

_LOOKUP_REGION_TYPES: tuple[RegionType, ...] = ("sa1", "sa2", "sa3", "sa4", "lga", "poa")


@dataclass(frozen=True)
class RegionMatch:
    region_id: uuid.UUID
    code: str
    name: str


@dataclass(frozen=True)
class PointResolution:
    matches: dict[RegionType, RegionMatch]
    ambiguous_types: frozenset[RegionType]


def is_within_australian_bounds(longitude: float, latitude: float) -> bool:
    return (
        AUSTRALIA_LONGITUDE_RANGE[0] <= longitude <= AUSTRALIA_LONGITUDE_RANGE[1]
        and AUSTRALIA_LATITUDE_RANGE[0] <= latitude <= AUSTRALIA_LATITUDE_RANGE[1]
    )


def resolve_point(
    connection: psycopg.Connection[Any],
    longitude: float,
    latitude: float,
    region_types: tuple[RegionType, ...] = _LOOKUP_REGION_TYPES,
) -> PointResolution:
    """Find the active-release region containing a point, per region type.

    A region type with no active release yet (e.g. LGA not imported) simply
    contributes no match, not an error — callers may still accept a partial
    hierarchy rather than waiting on every ASGS level to be loaded.
    """
    matches: dict[RegionType, RegionMatch] = {}
    ambiguous: set[RegionType] = set()
    for region_type in region_types:
        rows = connection.execute(
            """
            SELECT r.id, r.code, r.name
            FROM regions r
            JOIN geography_releases gr ON gr.id = r.release_id
            WHERE gr.is_active
              AND r.region_type = %s
              AND ST_Contains(r.geom, ST_SetSRID(ST_MakePoint(%s, %s), 4326))
            """,
            (region_type, longitude, latitude),
        ).fetchall()
        if len(rows) == 1:
            matches[region_type] = RegionMatch(rows[0][0], rows[0][1], rows[0][2])
        elif len(rows) > 1:
            ambiguous.add(region_type)
    return PointResolution(matches, frozenset(ambiguous))


def resolve_postcode_centroid(
    connection: psycopg.Connection[Any], postcode: str
) -> tuple[float, float] | None:
    """Approximate a postcode's location as its active POA boundary's centroid."""
    row = connection.execute(
        """
        SELECT ST_X(ST_Centroid(r.geom)), ST_Y(ST_Centroid(r.geom))
        FROM regions r
        JOIN geography_releases gr ON gr.id = r.release_id
        WHERE gr.is_active AND r.region_type = 'poa' AND r.code = %s
        """,
        (postcode,),
    ).fetchone()
    return (row[0], row[1]) if row is not None else None


def lookup_migration_category(
    connection: psycopg.Connection[Any], postcode: str, as_of: date
) -> tuple[str, str | None] | None:
    """Best-effort single migration-category match for a postcode.

    A postcode can genuinely carry more than one rule at once (e.g. a
    Category 2/3 postcode that is also inside a DAMA); resolved_locations
    only has room for one migration_category/migration_dama_name pair, so
    this prefers the more specific DAMA match when both exist. Revisit if
    later phases' sponsorship-evidence or DAMA-context work need to show
    more than one simultaneously.
    """
    row = connection.execute(
        """
        SELECT pr.category, pr.dama_name
        FROM postcode_rules pr
        JOIN geography_releases gr ON gr.id = pr.release_id
        WHERE gr.is_active
          AND pr.postcode = %s
          AND pr.valid_from <= %s
          AND (pr.valid_to IS NULL OR pr.valid_to >= %s)
        ORDER BY (pr.category = 'dama') DESC
        LIMIT 1
        """,
        (postcode, as_of, as_of),
    ).fetchone()
    return (row[0], row[1]) if row is not None else None


@dataclass(frozen=True)
class ResolvedLocation:
    id: uuid.UUID
    status: LocationMatchStatus
    longitude: float | None
    latitude: float | None
    regions: dict[RegionType, RegionMatch]
    migration_category: str | None
    migration_dama_name: str | None


def resolve_location(
    database_url: str, *, input_text: str, postcode: str, as_of: date
) -> ResolvedLocation:
    """Resolve a postcode to a coordinate and region hierarchy, idempotently.

    Idempotent on the (postcode) input: a repeat call for the same postcode
    returns the previously recorded row rather than re-resolving, matching
    resolved_locations' role as a cache as well as an audit trail.
    """
    input_hash = hashlib.sha256(f"postcode:{postcode}".encode()).hexdigest()
    with psycopg.connect(database_url) as connection:
        existing = connection.execute(
            "SELECT id FROM resolved_locations WHERE input_hash = %s", (input_hash,)
        ).fetchone()
        if existing is not None:
            return _fetch_resolved_location(connection, existing[0])

        status: LocationMatchStatus
        method: str | None = None
        longitude: float | None = None
        latitude: float | None = None
        region_ids: dict[RegionType, uuid.UUID] = {}
        migration_category: str | None = None
        migration_dama_name: str | None = None

        centroid = resolve_postcode_centroid(connection, postcode)
        if centroid is None:
            status = "no_match"
        elif not is_within_australian_bounds(*centroid):
            status = "out_of_bounds"
        else:
            longitude, latitude = centroid
            resolution = resolve_point(connection, longitude, latitude)
            if resolution.ambiguous_types:
                status = "ambiguous"
                longitude = latitude = None
            else:
                status = "accepted"
                method = "postcode_centroid"
                region_ids = {kind: match.region_id for kind, match in resolution.matches.items()}
                migration = lookup_migration_category(connection, postcode, as_of)
                if migration is not None:
                    migration_category, migration_dama_name = migration

        row = connection.execute(
            """
            INSERT INTO resolved_locations (
              input_hash, input_text, status, method, point,
              sa1_region_id, sa2_region_id, sa3_region_id, sa4_region_id,
              lga_region_id, poa_region_id, migration_category, migration_dama_name
            )
            VALUES (
              %(input_hash)s, %(input_text)s, %(status)s, %(method)s,
              CASE WHEN %(longitude)s::float8 IS NULL THEN NULL
                   ELSE ST_SetSRID(ST_MakePoint(%(longitude)s::float8, %(latitude)s::float8), 4326)
                   END,
              %(sa1)s, %(sa2)s, %(sa3)s, %(sa4)s, %(lga)s, %(poa)s,
              %(migration_category)s, %(migration_dama_name)s
            )
            ON CONFLICT (input_hash) DO NOTHING
            RETURNING id
            """,
            {
                "input_hash": input_hash,
                "input_text": input_text,
                "status": status,
                "method": method,
                "longitude": longitude,
                "latitude": latitude,
                "sa1": region_ids.get("sa1"),
                "sa2": region_ids.get("sa2"),
                "sa3": region_ids.get("sa3"),
                "sa4": region_ids.get("sa4"),
                "lga": region_ids.get("lga"),
                "poa": region_ids.get("poa"),
                "migration_category": migration_category,
                "migration_dama_name": migration_dama_name,
            },
        ).fetchone()
        if row is None:
            # Lost a race with a concurrent identical resolution.
            raced = connection.execute(
                "SELECT id FROM resolved_locations WHERE input_hash = %s", (input_hash,)
            ).fetchone()
            if raced is None:
                raise GeographyImportError(f"resolved_locations row vanished: {input_hash}")
            return _fetch_resolved_location(connection, raced[0])
        return _fetch_resolved_location(connection, row[0])


def _fetch_resolved_location(
    connection: psycopg.Connection[Any], location_id: uuid.UUID
) -> ResolvedLocation:
    row = connection.execute(
        """
        SELECT
          rl.id, rl.status, ST_X(rl.point), ST_Y(rl.point),
          rl.migration_category, rl.migration_dama_name,
          sa1.id, sa1.code, sa1.name, sa2.id, sa2.code, sa2.name,
          sa3.id, sa3.code, sa3.name, sa4.id, sa4.code, sa4.name,
          lga.id, lga.code, lga.name, poa.id, poa.code, poa.name
        FROM resolved_locations rl
        LEFT JOIN regions sa1 ON sa1.id = rl.sa1_region_id
        LEFT JOIN regions sa2 ON sa2.id = rl.sa2_region_id
        LEFT JOIN regions sa3 ON sa3.id = rl.sa3_region_id
        LEFT JOIN regions sa4 ON sa4.id = rl.sa4_region_id
        LEFT JOIN regions lga ON lga.id = rl.lga_region_id
        LEFT JOIN regions poa ON poa.id = rl.poa_region_id
        WHERE rl.id = %s
        """,
        (location_id,),
    ).fetchone()
    if row is None:
        raise GeographyImportError(f"resolved_locations row disappeared: {location_id}")
    (
        id_,
        status,
        longitude,
        latitude,
        migration_category,
        migration_dama_name,
        sa1_id,
        sa1_code,
        sa1_name,
        sa2_id,
        sa2_code,
        sa2_name,
        sa3_id,
        sa3_code,
        sa3_name,
        sa4_id,
        sa4_code,
        sa4_name,
        lga_id,
        lga_code,
        lga_name,
        poa_id,
        poa_code,
        poa_name,
    ) = row
    regions: dict[RegionType, RegionMatch] = {}
    region_rows: tuple[tuple[RegionType, Any, Any, Any], ...] = (
        ("sa1", sa1_id, sa1_code, sa1_name),
        ("sa2", sa2_id, sa2_code, sa2_name),
        ("sa3", sa3_id, sa3_code, sa3_name),
        ("sa4", sa4_id, sa4_code, sa4_name),
        ("lga", lga_id, lga_code, lga_name),
        ("poa", poa_id, poa_code, poa_name),
    )
    for region_type, region_id, code, name in region_rows:
        if region_id is not None:
            regions[region_type] = RegionMatch(region_id, code, name)
    return ResolvedLocation(
        id_, status, longitude, latitude, regions, migration_category, migration_dama_name
    )
