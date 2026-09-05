"""Resolve the alpha seed cohort's researched street addresses into real
map points and company_locations rows (Phase 3 gap-fill), since Phase 2's
own G-NAF/ASGS pipeline has no real reference data loaded yet to resolve
them against. Each candidate is matched to its already-seeded company by
domain (the same join key the address research was given), geocoded via
employers.geocoding.geocode_address, and recorded as a resolved_locations
row (method='external_geocoder', migration 0008) plus a company_locations
row pointing at it -- idempotent on retry, same insert-or-reuse idiom
every other importer in this codebase uses.
"""

from __future__ import annotations

import csv
import hashlib
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from uuid import UUID

import psycopg

from austechmap_ingestion.employers.geocoding import (
    GeocodeResult,
    GeocodingError,
    geocode_address,
)
from austechmap_ingestion.jobs import JobRepository

DEFAULT_FIXTURE_PATH = (
    Path(__file__).parent / "fixtures" / "alpha_seed_cohort_addresses_20260905.csv"
)
SOURCE_KEY = "alpha-seed-cohort-addresses"

GeocodeFn = Callable[[str, str], GeocodeResult]


class LocationSeedError(Exception):
    """Raised for malformed address-fixture data."""


@dataclass(frozen=True)
class AddressCandidate:
    domain: str
    street_address: str
    suburb: str
    state: str
    postcode: str
    source_confidence: str
    source_note: str


def load_address_fixture(path: Path = DEFAULT_FIXTURE_PATH) -> list[AddressCandidate]:
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        candidates = [
            AddressCandidate(
                domain=row["domain"].strip(),
                street_address=row["street_address"].strip(),
                suburb=row["suburb"].strip(),
                state=row["state"].strip(),
                postcode=row["postcode"].strip(),
                source_confidence=row["source_confidence"].strip(),
                source_note=row["source_note"].strip(),
            )
            for row in reader
        ]
    if not candidates:
        raise LocationSeedError(f"no candidates found in {path}")
    return candidates


def _query_text(candidate: AddressCandidate) -> str:
    return (
        f"{candidate.street_address}, {candidate.suburb} "
        f"{candidate.state} {candidate.postcode}, Australia"
    )


@dataclass(frozen=True)
class LocationSeedStats:
    resolved: int
    reused: int
    errors: tuple[tuple[str, str], ...]
    unmatched_domains: tuple[str, ...]


def run_location_seed_import(
    database_url: str,
    mapbox_token: str,
    fixture_path: Path = DEFAULT_FIXTURE_PATH,
    geocode_fn: GeocodeFn = geocode_address,
) -> LocationSeedStats:
    candidates = load_address_fixture(fixture_path)
    source_id = JobRepository(database_url).ensure_source(
        source_key=SOURCE_KEY,
        name="Alpha seed cohort address research",
        kind="human_submission",
    )

    resolved = reused = 0
    errors: list[tuple[str, str]] = []
    unmatched: list[str] = []

    with psycopg.connect(database_url, autocommit=True) as connection:
        for candidate in candidates:
            company_row = connection.execute(
                "SELECT id FROM companies WHERE domain = %s AND status <> 'merged'",
                (candidate.domain,),
            ).fetchone()
            if company_row is None:
                unmatched.append(candidate.domain)
                continue
            company_id: UUID = company_row[0]

            query_text = _query_text(candidate)
            input_hash = hashlib.sha256(query_text.encode("utf-8")).hexdigest()

            existing = connection.execute(
                "SELECT id FROM resolved_locations WHERE input_hash = %s", (input_hash,)
            ).fetchone()
            if existing is not None:
                resolved_location_id: UUID = existing[0]
                reused += 1
            else:
                try:
                    geocoded = geocode_fn(mapbox_token, query_text)
                except GeocodingError as error:
                    errors.append((candidate.domain, str(error)))
                    continue
                try:
                    inserted = connection.execute(
                        """
                        INSERT INTO resolved_locations (
                          input_hash, input_text, status, method, point
                        )
                        VALUES (%s, %s, 'accepted', 'external_geocoder',
                                ST_SetSRID(ST_MakePoint(%s, %s), 4326))
                        ON CONFLICT (input_hash) DO NOTHING
                        RETURNING id
                        """,
                        (input_hash, query_text, geocoded.longitude, geocoded.latitude),
                    ).fetchone()
                except psycopg.errors.CheckViolation as error:
                    errors.append((candidate.domain, f"geocoded point failed validation: {error}"))
                    continue
                if inserted is not None:
                    resolved_location_id = inserted[0]
                    resolved += 1
                else:
                    refetched = connection.execute(
                        "SELECT id FROM resolved_locations WHERE input_hash = %s",
                        (input_hash,),
                    ).fetchone()
                    if refetched is None:
                        raise LocationSeedError(
                            f"resolved_locations row disappeared for hash {input_hash}"
                        )
                    resolved_location_id = refetched[0]
                    reused += 1

            already_linked = connection.execute(
                """
                SELECT 1 FROM company_locations
                WHERE company_id = %s AND resolved_location_id = %s
                """,
                (company_id, resolved_location_id),
            ).fetchone()
            if already_linked is None:
                connection.execute(
                    """
                    INSERT INTO company_locations (
                      company_id, resolved_location_id, raw_address, location_type, source_id
                    )
                    VALUES (%s, %s, %s, 'head_office', %s)
                    """,
                    (company_id, resolved_location_id, query_text, source_id),
                )

    return LocationSeedStats(
        resolved=resolved,
        reused=reused,
        errors=tuple(errors),
        unmatched_domains=tuple(unmatched),
    )
