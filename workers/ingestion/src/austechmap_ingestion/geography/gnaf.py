"""G-NAF offline exact-match address geocoding (Phase 2).

Table and column names below are verified directly against the real G-NAF
August 2026 release archive's own
GNAF_TableCreation_Scripts/create_tables_ansi.sql and PSV file headers
(fetched via a targeted HTTP range request against the real data.gov.au
archive during development, not assumed from memory or documentation
prose) — see ARCHITECTURE_DECISIONS.md section 4.3 for the storage/
lifecycle/matching contract this module implements.

The archive used for verification was the "gda2020" delivery variant
(g-naf_..._gda2020_psv_...zip); GDA2020 and WGS84/EPSG:4326 differ by
roughly 1.8m nationally as of the 2020 realisation, which is treated here
as a deliberate, documented equivalence rather than a silent one — G-NAF's
own coordinates are consumed directly as EPSG:4326 rather than requiring a
transform step, per ARCHITECTURE_DECISIONS.md section 4.3's instruction to
be explicit about CRS handling rather than reject or ignore it.

The full national address file never enters Neon: this module builds a
disposable, release-versioned DuckDB index from extracted PSV files on
local/ephemeral storage, and only exact-match results for a caller-supplied
batch of already-structured (not free-text) addresses are meant to leave
it. Free-text address parsing is a separate, harder problem this module
deliberately does not attempt — callers supply already-split components,
e.g. from a reviewed employer-address record in a later phase.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import duckdb
from duckdb.func import SPECIAL

from austechmap_ingestion.geography.locations import (
    LocationMatchStatus,
    is_within_australian_bounds,
)
from austechmap_ingestion.geography.types import GeographyImportError

DEFAULT_STATE_CODES: tuple[str, ...] = ("NSW", "VIC", "QLD", "SA", "WA", "TAS", "NT", "ACT", "OT")
MAX_BATCH_SIZE = 10_000

# Filesystem paths here are operator-supplied configuration (same trust
# level as db/migrations' path elsewhere in this codebase), not end-user
# input, but interpolating them into SQL still deserves a floor-level check.
_SAFE_PATH = re.compile(r"^[^'\x00]*$")


def canonical_address_key(
    flat_number: str | None,
    level_number: str | None,
    street_number: str | None,
    street_number_suffix: str | None,
    street_name: str | None,
    street_type: str | None,
    street_suffix: str | None,
    locality_name: str | None,
    state_abbreviation: str | None,
    postcode: str | None,
) -> str:
    """The single normalisation rule used on both the G-NAF index side and
    the query side, registered as a DuckDB UDF for the former so the two
    can never drift apart into two different definitions of "the same
    key". Deliberately minimal for the initial exact-match-only
    implementation (ARCHITECTURE_DECISIONS.md section 4.3) — no street-type
    abbreviation expansion or alias handling yet; those are versioned
    fixtures for a later, non-exact-match iteration, not ad-hoc additions
    here.
    """
    parts = (
        flat_number,
        level_number,
        street_number,
        street_number_suffix,
        street_name,
        street_type,
        street_suffix,
        locality_name,
        state_abbreviation,
        postcode,
    )
    return "|".join((part or "").strip().upper() for part in parts)


@dataclass(frozen=True)
class GnafIndexStats:
    address_count: int
    geocode_count: int
    street_locality_count: int
    locality_count: int
    state_count: int
    match_key_count: int


def build_gnaf_index(
    duckdb_path: Path,
    standard_dir: Path,
    *,
    state_codes: tuple[str, ...] = DEFAULT_STATE_CODES,
) -> GnafIndexStats:
    """Build a disposable DuckDB index from an extracted G-NAF release.

    standard_dir is the release's "Standard" folder (its parent folder name
    changes every quarterly release, e.g. "G-NAF AUGUST 2026", so this takes
    the folder directly rather than assuming a naming convention that will
    go stale). Only active addresses (date_retired IS NULL) are indexed —
    G-NAF retains retired addresses for history rather than deleting them,
    and those should not be matchable going forward.
    """
    if duckdb_path.exists():
        raise GeographyImportError(f"refusing to overwrite an existing index at {duckdb_path}")
    if not _SAFE_PATH.fullmatch(str(standard_dir)):
        raise GeographyImportError(f"unsafe path for SQL interpolation: {standard_dir}")

    connection = duckdb.connect(str(duckdb_path))
    try:
        connection.create_function(
            "canonical_address_key", canonical_address_key, None, "varchar", null_handling=SPECIAL
        )
        for table, suffix in (
            ("address_detail", "ADDRESS_DETAIL"),
            ("address_default_geocode", "ADDRESS_DEFAULT_GEOCODE"),
            ("street_locality", "STREET_LOCALITY"),
            ("locality", "LOCALITY"),
            ("state", "STATE"),
        ):
            present = [
                (standard_dir / f"{code}_{suffix}_psv.psv").as_posix()
                for code in state_codes
                if (standard_dir / f"{code}_{suffix}_psv.psv").exists()
            ]
            if not present:
                raise GeographyImportError(f"no {suffix} files found under {standard_dir}")
            # An explicit file list, not a glob, deliberately: a glob like
            # "*_LOCALITY_psv.psv" also matches "NSW_STREET_LOCALITY_psv.psv"
            # (STREET_LOCALITY ends in LOCALITY too), silently corrupting the
            # locality table via union_by_name. Exact filenames avoid that.
            file_list = ", ".join(f"'{path}'" for path in present)
            connection.execute(
                f"""
                CREATE TABLE {table} AS
                SELECT * FROM read_csv(
                  [{file_list}], delim='|', header=true, all_varchar=true,
                  nullstr='', union_by_name=true
                )
                """
            )

        connection.execute(
            """
            CREATE TABLE address_match_key AS
            SELECT
              ad.address_detail_pid,
              ad.address_site_pid,
              canonical_address_key(
                ad.flat_number, ad.level_number, ad.number_first, ad.number_first_suffix,
                sl.street_name, sl.street_type_code, sl.street_suffix_code,
                loc.locality_name, st.state_abbreviation, ad.postcode
              ) AS canonical_key
            FROM address_detail ad
            LEFT JOIN street_locality sl ON sl.street_locality_pid = ad.street_locality_pid
            JOIN locality loc ON loc.locality_pid = ad.locality_pid
            JOIN state st ON st.state_pid = loc.state_pid
            WHERE ad.date_retired IS NULL
            """
        )
        connection.execute(
            "CREATE INDEX address_match_key_idx ON address_match_key (canonical_key)"
        )
        connection.execute(
            "CREATE INDEX address_geocode_pid_idx ON address_default_geocode (address_detail_pid)"
        )

        def count(table: str) -> int:
            row = connection.execute(f"SELECT count(*) FROM {table}").fetchone()
            assert row is not None
            return int(row[0])

        stats = GnafIndexStats(
            address_count=count("address_detail"),
            geocode_count=count("address_default_geocode"),
            street_locality_count=count("street_locality"),
            locality_count=count("locality"),
            state_count=count("state"),
            match_key_count=count("address_match_key"),
        )
    finally:
        connection.close()
    return stats


@dataclass(frozen=True)
class AddressMatchInput:
    """Already-structured address components — this module does not parse
    free text into these fields; an upstream step (e.g. a reviewed employer
    address record) is expected to have done that."""

    input_id: str
    street_name: str
    locality_name: str
    state_abbreviation: str
    flat_number: str | None = None
    level_number: str | None = None
    street_number: str | None = None
    street_number_suffix: str | None = None
    street_type: str | None = None
    street_suffix: str | None = None
    postcode: str | None = None


@dataclass(frozen=True)
class GnafMatchResult:
    input_id: str
    status: LocationMatchStatus
    address_detail_pid: str | None
    longitude: float | None
    latitude: float | None
    candidate_count: int


def match_addresses_exact(
    duckdb_path: Path, inputs: list[AddressMatchInput]
) -> list[GnafMatchResult]:
    """Match a batch of already-structured addresses against a built index.

    Per ARCHITECTURE_DECISIONS.md section 4.3, only a unique exact
    canonical-key match auto-accepts; zero or multiple candidates route to
    review (no_match / ambiguous), as does an accepted match whose geocode
    falls outside Australia's bounds. Batches larger than MAX_BATCH_SIZE
    are rejected outright — the immutable-batch-of-at-most-10,000 rule is a
    replay-safety property, not just a performance guideline.
    """
    if len(inputs) > MAX_BATCH_SIZE:
        raise GeographyImportError(
            f"batch of {len(inputs)} exceeds the {MAX_BATCH_SIZE}-address limit"
        )
    if not duckdb_path.exists():
        raise GeographyImportError(f"no G-NAF index at {duckdb_path}")

    connection = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        results: list[GnafMatchResult] = []
        for item in inputs:
            key = canonical_address_key(
                item.flat_number,
                item.level_number,
                item.street_number,
                item.street_number_suffix,
                item.street_name,
                item.street_type,
                item.street_suffix,
                item.locality_name,
                item.state_abbreviation,
                item.postcode,
            )
            candidates = connection.execute(
                """
                SELECT amk.address_detail_pid, geo.longitude, geo.latitude
                FROM address_match_key amk
                JOIN address_default_geocode geo
                  ON geo.address_detail_pid = amk.address_detail_pid
                WHERE amk.canonical_key = ?
                """,
                [key],
            ).fetchall()
            results.append(_classify(item.input_id, candidates))
        return results
    finally:
        connection.close()


def _classify(input_id: str, candidates: list[tuple[Any, ...]]) -> GnafMatchResult:
    if len(candidates) == 0:
        return GnafMatchResult(input_id, "no_match", None, None, None, 0)
    if len(candidates) > 1:
        return GnafMatchResult(input_id, "ambiguous", None, None, None, len(candidates))
    pid, longitude, latitude = candidates[0]
    longitude, latitude = float(longitude), float(latitude)
    if not is_within_australian_bounds(longitude, latitude):
        return GnafMatchResult(input_id, "out_of_bounds", None, None, None, 1)
    return GnafMatchResult(input_id, "accepted", pid, longitude, latitude, 1)
