"""Auditable containment for address fixtures that lack street-level evidence.

``resolved_locations`` is deliberately a shared cache.  A low-specificity
fixture can therefore make one unsupported city-centre point appear on many
company profiles.  This module contains such a fixture without deleting the
company, source, or raw-address evidence needed to research a correction.

It is intentionally opt-in and defaults to a dry run.  The caller must supply
a fixture made entirely of addresses without a street number; mixing a valid
street address into the fixture is rejected rather than risking its removal.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any, cast

import psycopg
from psycopg.types.json import Jsonb

from austechmap_ingestion.employers.locations_seed import (
    AddressCandidate,
    _query_text,
    load_address_fixture,
)

_DIGIT_RE = re.compile(r"\d")


class LocationQualityError(Exception):
    """Raised when a containment operation is not safe to run."""


@dataclass(frozen=True)
class LocationQuarantineStats:
    fixture_candidates: int
    matched_fixture_domains: int
    unmatched_fixture_domains: tuple[str, ...]
    affected_locations: int
    affected_companies: int
    applied: bool


@dataclass(frozen=True)
class _TargetLocation:
    id: uuid.UUID
    input_text: str
    method: str
    longitude: float | None
    latitude: float | None
    company_ids: tuple[str, ...]


def street_address_lacks_number(street_address: str) -> bool:
    """Return whether the fixture's street field has no numeric identifier."""
    return _DIGIT_RE.search(street_address) is None


def validate_low_specificity_candidates(candidates: list[AddressCandidate]) -> None:
    """Require an all-low-specificity fixture before any containment can run."""
    numbered = sorted(
        candidate.domain
        for candidate in candidates
        if not street_address_lacks_number(candidate.street_address)
    )
    if numbered:
        preview = ", ".join(numbered[:5])
        suffix = "..." if len(numbered) > 5 else ""
        raise LocationQualityError(
            "refusing to quarantine a mixed-specificity fixture; numbered street addresses "
            f"found for: {preview}{suffix}"
        )


def _target_locations(
    connection: psycopg.Connection[tuple[object, ...]],
    *,
    candidates: list[AddressCandidate],
) -> tuple[list[_TargetLocation], tuple[str, ...], int]:
    domains = sorted({candidate.domain for candidate in candidates})
    raw_addresses = sorted({_query_text(candidate) for candidate in candidates})
    matched_rows = connection.execute(
        "SELECT domain FROM companies WHERE domain = ANY(%s) AND status <> 'merged'", (domains,)
    ).fetchall()
    matched_domains = {str(row[0]) for row in matched_rows}
    unmatched_domains = tuple(domain for domain in domains if domain not in matched_domains)

    rows = connection.execute(
        """
        WITH targets AS (
          SELECT DISTINCT rl.id
          FROM company_locations cl
          JOIN companies c ON c.id = cl.company_id
          JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
          WHERE c.domain = ANY(%s)
            AND cl.raw_address = ANY(%s)
            AND rl.status = 'accepted'
            AND rl.method = 'external_geocoder'
        )
        SELECT rl.id, rl.input_text, rl.method::text,
               ST_X(rl.point), ST_Y(rl.point),
               array_agg(DISTINCT linked.company_id::text ORDER BY linked.company_id::text)
        FROM targets
        JOIN resolved_locations rl ON rl.id = targets.id
        JOIN company_locations linked ON linked.resolved_location_id = rl.id
        GROUP BY rl.id, rl.input_text, rl.method, rl.point
        ORDER BY rl.id
        """,
        (domains, raw_addresses),
    ).fetchall()
    targets = [
        _TargetLocation(
            id=cast(uuid.UUID, row[0]),
            input_text=str(row[1]),
            method=str(row[2]),
            longitude=cast(float | None, row[3]),
            latitude=cast(float | None, row[4]),
            company_ids=tuple(str(company_id) for company_id in cast(list[object], row[5])),
        )
        for row in rows
    ]
    return targets, unmatched_domains, len(matched_domains)


def _state(target: _TargetLocation) -> dict[str, Any]:
    return {
        "status": "accepted",
        "method": target.method,
        "input_text": target.input_text,
        "longitude": target.longitude,
        "latitude": target.latitude,
    }


def quarantine_low_specificity_locations(
    database_url: str,
    *,
    fixture_path: Path,
    actor_id: str,
    reason: str,
    apply: bool = False,
) -> LocationQuarantineStats:
    """Preview or quarantine external-geocoder rows linked by a bad fixture.

    The target set is deliberately narrow: a fixture domain *and* the exact
    raw address that its original seeding command recorded must both match.
    Linked rows are retained, but status becomes ``ambiguous`` and map data is
    cleared so map/profile/search queries that require accepted points stop
    exposing an unsupported location.
    """
    if not reason.strip():
        raise LocationQualityError("a non-empty cleanup reason is required")
    candidates = load_address_fixture(fixture_path)
    validate_low_specificity_candidates(candidates)

    with psycopg.connect(database_url) as connection:
        targets, unmatched_domains, matched_fixture_domains = _target_locations(
            connection, candidates=candidates
        )
        affected_companies = len(
            {company_id for target in targets for company_id in target.company_ids}
        )
        if apply:
            for target in targets:
                updated = connection.execute(
                    """
                    UPDATE resolved_locations
                    SET status = 'ambiguous',
                        point = NULL,
                        matched_gnaf_pid = NULL,
                        gnaf_release_id = NULL,
                        sa1_region_id = NULL,
                        sa2_region_id = NULL,
                        sa3_region_id = NULL,
                        sa4_region_id = NULL,
                        lga_region_id = NULL,
                        poa_region_id = NULL,
                        migration_category = NULL,
                        migration_dama_name = NULL
                    WHERE id = %s
                      AND status = 'accepted'
                      AND method = 'external_geocoder'
                    RETURNING id
                    """,
                    (target.id,),
                ).fetchone()
                if updated is None:
                    continue
                after_state = {
                    "status": "ambiguous",
                    "method": target.method,
                    "input_text": target.input_text,
                    "longitude": None,
                    "latitude": None,
                }
                connection.execute(
                    """
                    INSERT INTO audit_records (
                      actor_type, actor_id, action, target_type, target_id,
                      reason, before_state, after_state, metadata, request_id
                    )
                    VALUES ('system', %s, 'location_quarantined_low_specificity',
                            'resolved_location', %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        actor_id,
                        str(target.id),
                        reason,
                        Jsonb(_state(target)),
                        Jsonb(after_state),
                        Jsonb(
                            {
                                "fixture": fixture_path.name,
                                "quality_rule": "street_address_requires_number",
                                "affected_company_ids": list(target.company_ids),
                            }
                        ),
                        uuid.uuid4().hex,
                    ),
                )

    return LocationQuarantineStats(
        fixture_candidates=len(candidates),
        matched_fixture_domains=matched_fixture_domains,
        unmatched_fixture_domains=unmatched_domains,
        affected_locations=len(targets),
        affected_companies=affected_companies,
        applied=apply,
    )
