"""Audited promotion of evidence-backed ambiguous location records.

Promotes only fixture rows that already have active first-party
``location_source`` evidence. Defaults to dry-run; production mutation
requires ``apply=True``. Fresh geocoding always happens on promote —
never accept an ambiguous row merely because a point once existed.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import cast

import psycopg
from psycopg.types.json import Jsonb

from austechmap_ingestion.employers.geocoding import (
    GeocodingError,
    geocode_address_nominatim,
)
from austechmap_ingestion.employers.locations_seed import (
    AddressCandidate,
    GeocodeFn,
    LocationSeedError,
    _query_text,
    load_address_fixture,
)
from austechmap_ingestion.geography.locations import (
    RegionMatch,
    is_within_australian_bounds,
    resolve_point,
)
from austechmap_ingestion.geography.types import RegionType

ACTION = "location_promoted_evidence_backed"


class LocationPromotionError(Exception):
    """Raised when a promotion operation is not safe to run."""


@dataclass(frozen=True)
class LocationPromotionStats:
    fixture_candidates: int
    promoted: int
    reused: int
    proposed: int
    errors: tuple[tuple[str, str], ...]
    applied: bool
    audit_records: int


@dataclass(frozen=True)
class _MatchedAmbiguous:
    resolved_location_id: uuid.UUID
    company_id: uuid.UUID
    input_text: str
    method: str | None
    raw_address: str
    evidence_source_url: str


@dataclass(frozen=True)
class _AlreadyAccepted:
    resolved_location_id: uuid.UUID
    company_id: uuid.UUID
    raw_address: str


def _require_source_url(candidate: AddressCandidate) -> str:
    if candidate.source_url is None or not candidate.source_url.strip():
        raise LocationPromotionError(
            f"fixture row for {candidate.domain} is missing a required source_url"
        )
    return candidate.source_url.strip()


def _region_id(
    matches: dict[RegionType, RegionMatch], region_type: RegionType
) -> uuid.UUID | None:
    match = matches.get(region_type)
    return match.region_id if match is not None else None


def _find_already_accepted(
    connection: psycopg.Connection[tuple[object, ...]],
    *,
    domain: str,
    query: str,
    source_url: str,
) -> _AlreadyAccepted | None:
    row = connection.execute(
        """
        SELECT rl.id, c.id, cl.raw_address
        FROM companies c
        JOIN company_locations cl ON cl.company_id = c.id
        JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
        JOIN evidence e
          ON e.entity_type = 'company'
         AND e.entity_id = c.id::text
         AND e.claim_type = 'location_source'
         AND e.status = 'active'
         AND e.claim_value->>'source_url' = %s
        WHERE c.domain = %s
          AND c.status <> 'merged'
          AND cl.raw_address = %s
          AND rl.status = 'accepted'
        LIMIT 1
        """,
        (source_url, domain, query),
    ).fetchone()
    if row is None:
        return None
    return _AlreadyAccepted(
        resolved_location_id=cast(uuid.UUID, row[0]),
        company_id=cast(uuid.UUID, row[1]),
        raw_address=str(row[2]),
    )


def _find_ambiguous_target(
    connection: psycopg.Connection[tuple[object, ...]],
    *,
    domain: str,
    query: str,
    source_url: str,
) -> _MatchedAmbiguous | None:
    row = connection.execute(
        """
        SELECT rl.id, c.id, rl.input_text, rl.method::text, cl.raw_address,
               e.claim_value->>'source_url'
        FROM companies c
        JOIN company_locations cl ON cl.company_id = c.id
        JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
        JOIN evidence e
          ON e.entity_type = 'company'
         AND e.entity_id = c.id::text
         AND e.claim_type = 'location_source'
         AND e.status = 'active'
         AND e.claim_value->>'source_url' = %s
        WHERE c.domain = %s
          AND c.status <> 'merged'
          AND cl.raw_address = %s
          AND rl.status = 'ambiguous'
        LIMIT 1
        """,
        (source_url, domain, query),
    ).fetchone()
    if row is None:
        return None
    return _MatchedAmbiguous(
        resolved_location_id=cast(uuid.UUID, row[0]),
        company_id=cast(uuid.UUID, row[1]),
        input_text=str(row[2]),
        method=cast(str | None, row[3]),
        raw_address=str(row[4]),
        evidence_source_url=str(row[5]),
    )


def _diagnose_failure(
    connection: psycopg.Connection[tuple[object, ...]],
    *,
    domain: str,
    query: str,
    source_url: str,
) -> str:
    company = connection.execute(
        "SELECT id FROM companies WHERE domain = %s AND status <> 'merged'",
        (domain,),
    ).fetchone()
    if company is None:
        return "company domain not found"

    company_id = cast(uuid.UUID, company[0])
    link = connection.execute(
        """
        SELECT rl.id, rl.status::text
        FROM company_locations cl
        JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
        WHERE cl.company_id = %s AND cl.raw_address = %s
        LIMIT 1
        """,
        (company_id, query),
    ).fetchone()
    if link is None:
        return "no company_locations row matched the exact fixture address query"

    evidence = connection.execute(
        """
        SELECT 1 FROM evidence
        WHERE entity_type = 'company'
          AND entity_id = %s
          AND claim_type = 'location_source'
          AND status = 'active'
          AND claim_value->>'source_url' = %s
        LIMIT 1
        """,
        (str(company_id), source_url),
    ).fetchone()
    if evidence is None:
        return "missing active location_source evidence for fixture source_url"

    status = str(link[1])
    return f"location status {status!r} is not eligible for promotion"


def _promote_row(
    connection: psycopg.Connection[tuple[object, ...]],
    *,
    target: _MatchedAmbiguous,
    candidate: AddressCandidate,
    query: str,
    source_url: str,
    fixture_name: str,
    actor_id: str,
    credential: str,
    geocode_fn: GeocodeFn,
) -> None:
    geocoded = geocode_fn(credential, query)
    if not is_within_australian_bounds(geocoded.longitude, geocoded.latitude):
        raise GeocodingError(
            f"geocoded point outside Australian bounds for {query!r}: "
            f"({geocoded.longitude}, {geocoded.latitude})"
        )

    resolution = resolve_point(connection, geocoded.longitude, geocoded.latitude)
    try:
        updated = connection.execute(
            """
            UPDATE resolved_locations
            SET status = 'accepted',
                method = 'external_geocoder',
                point = ST_SetSRID(ST_MakePoint(%s, %s), 4326),
                matched_gnaf_pid = NULL,
                gnaf_release_id = NULL,
                sa1_region_id = %s,
                sa2_region_id = %s,
                sa3_region_id = %s,
                sa4_region_id = %s,
                lga_region_id = %s,
                poa_region_id = %s,
                migration_category = NULL,
                migration_dama_name = NULL,
                candidate_count = NULL,
                resolved_at = now()
            WHERE id = %s
              AND status = 'ambiguous'
            RETURNING id
            """,
            (
                geocoded.longitude,
                geocoded.latitude,
                _region_id(resolution.matches, "sa1"),
                _region_id(resolution.matches, "sa2"),
                _region_id(resolution.matches, "sa3"),
                _region_id(resolution.matches, "sa4"),
                _region_id(resolution.matches, "lga"),
                _region_id(resolution.matches, "poa"),
                target.resolved_location_id,
            ),
        ).fetchone()
    except psycopg.errors.CheckViolation as error:
        raise GeocodingError(f"geocoded point failed validation: {error}") from error

    if updated is None:
        raise LocationPromotionError(
            f"ambiguous location {target.resolved_location_id} disappeared during update"
        )

    request_id = uuid.uuid4().hex
    connection.execute(
        """
        INSERT INTO audit_records (
          actor_type, actor_id, action, target_type, target_id,
          reason, before_state, after_state, metadata, request_id
        )
        VALUES (
          'system', %s, %s, 'resolved_location', %s, %s, %s, %s, %s, %s
        )
        """,
        (
            actor_id,
            ACTION,
            str(target.resolved_location_id),
            "first-party fixture evidence revalidated with fresh geocode",
            Jsonb(
                {
                    "status": "ambiguous",
                    "method": target.method,
                    "input_text": target.input_text,
                    "longitude": None,
                    "latitude": None,
                }
            ),
            Jsonb(
                {
                    "status": "accepted",
                    "method": "external_geocoder",
                    "input_text": target.input_text,
                    "longitude": geocoded.longitude,
                    "latitude": geocoded.latitude,
                    "sa4_region_id": (
                        str(_region_id(resolution.matches, "sa4"))
                        if _region_id(resolution.matches, "sa4") is not None
                        else None
                    ),
                }
            ),
            Jsonb(
                {
                    "fixture": fixture_name,
                    "domain": candidate.domain,
                    "source_url": source_url,
                    "exact_query": query,
                    "company_id": str(target.company_id),
                    "raw_address": target.raw_address,
                    "full_address": geocoded.full_address,
                }
            ),
            request_id,
        ),
    )


def promote_evidenced_locations(
    database_url: str,
    *,
    fixture_path: Path,
    actor_id: str = "evidenced-location-promotion",
    apply: bool = False,
    credential: str = "",
    geocode_fn: GeocodeFn | None = None,
) -> LocationPromotionStats:
    """Preview or promote fixture-linked ambiguous rows with first-party evidence."""
    if not actor_id.strip():
        raise LocationPromotionError("a non-empty actor_id is required")

    try:
        candidates = load_address_fixture(fixture_path)
    except LocationSeedError as error:
        raise LocationPromotionError(str(error)) from error

    for candidate in candidates:
        _require_source_url(candidate)

    geocode: GeocodeFn = geocode_fn or geocode_address_nominatim
    promoted = reused = proposed = audit_records = 0
    errors: list[tuple[str, str]] = []

    with psycopg.connect(database_url) as connection:
        for candidate in candidates:
            source_url = _require_source_url(candidate)
            query = _query_text(candidate)

            already = _find_already_accepted(
                connection,
                domain=candidate.domain,
                query=query,
                source_url=source_url,
            )
            if already is not None:
                reused += 1
                continue

            target = _find_ambiguous_target(
                connection,
                domain=candidate.domain,
                query=query,
                source_url=source_url,
            )
            if target is None:
                errors.append(
                    (
                        candidate.domain,
                        _diagnose_failure(
                            connection,
                            domain=candidate.domain,
                            query=query,
                            source_url=source_url,
                        ),
                    )
                )
                continue

            if not apply:
                proposed += 1
                continue

            try:
                with connection.transaction():
                    _promote_row(
                        connection,
                        target=target,
                        candidate=candidate,
                        query=query,
                        source_url=source_url,
                        fixture_name=fixture_path.name,
                        actor_id=actor_id,
                        credential=credential,
                        geocode_fn=geocode,
                    )
            except (GeocodingError, LocationPromotionError, psycopg.Error) as error:
                errors.append((candidate.domain, str(error)))
                continue

            promoted += 1
            audit_records += 1

    return LocationPromotionStats(
        fixture_candidates=len(candidates),
        promoted=promoted,
        reused=reused,
        proposed=proposed,
        errors=tuple(errors),
        applied=apply,
        audit_records=audit_records,
    )
