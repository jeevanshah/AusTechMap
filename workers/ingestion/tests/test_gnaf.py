from __future__ import annotations

from pathlib import Path

import pytest

from austechmap_ingestion.geography.gnaf import (
    AddressMatchInput,
    build_gnaf_index,
    canonical_address_key,
    match_addresses_exact,
)
from austechmap_ingestion.geography.types import GeographyImportError

_STATE_HEADER = ["STATE_PID", "DATE_CREATED", "DATE_RETIRED", "STATE_NAME", "STATE_ABBREVIATION"]
_LOCALITY_HEADER = [
    "LOCALITY_PID",
    "DATE_CREATED",
    "DATE_RETIRED",
    "LOCALITY_NAME",
    "PRIMARY_POSTCODE",
    "LOCALITY_CLASS_CODE",
    "STATE_PID",
    "GNAF_LOCALITY_PID",
    "GNAF_RELIABILITY_CODE",
]
_STREET_LOCALITY_HEADER = [
    "STREET_LOCALITY_PID",
    "DATE_CREATED",
    "DATE_RETIRED",
    "STREET_CLASS_CODE",
    "STREET_NAME",
    "STREET_TYPE_CODE",
    "STREET_SUFFIX_CODE",
    "LOCALITY_PID",
    "GNAF_STREET_PID",
    "GNAF_STREET_CONFIDENCE",
    "GNAF_RELIABILITY_CODE",
]
_ADDRESS_DETAIL_HEADER = [
    "ADDRESS_DETAIL_PID",
    "DATE_CREATED",
    "DATE_LAST_MODIFIED",
    "DATE_RETIRED",
    "BUILDING_NAME",
    "LOT_NUMBER_PREFIX",
    "LOT_NUMBER",
    "LOT_NUMBER_SUFFIX",
    "FLAT_TYPE_CODE",
    "FLAT_NUMBER_PREFIX",
    "FLAT_NUMBER",
    "FLAT_NUMBER_SUFFIX",
    "LEVEL_TYPE_CODE",
    "LEVEL_NUMBER_PREFIX",
    "LEVEL_NUMBER",
    "LEVEL_NUMBER_SUFFIX",
    "NUMBER_FIRST_PREFIX",
    "NUMBER_FIRST",
    "NUMBER_FIRST_SUFFIX",
    "NUMBER_LAST_PREFIX",
    "NUMBER_LAST",
    "NUMBER_LAST_SUFFIX",
    "STREET_LOCALITY_PID",
    "LOCATION_DESCRIPTION",
    "LOCALITY_PID",
    "ALIAS_PRINCIPAL",
    "POSTCODE",
    "PRIVATE_STREET",
    "LEGAL_PARCEL_ID",
    "CONFIDENCE",
    "ADDRESS_SITE_PID",
    "LEVEL_GEOCODED_CODE",
    "PROPERTY_PID",
    "GNAF_PROPERTY_PID",
    "PRIMARY_SECONDARY",
]
_GEOCODE_HEADER = [
    "ADDRESS_DEFAULT_GEOCODE_PID",
    "DATE_CREATED",
    "DATE_RETIRED",
    "ADDRESS_DETAIL_PID",
    "GEOCODE_TYPE_CODE",
    "LONGITUDE",
    "LATITUDE",
]


def _write_psv(path: Path, header: list[str], rows: list[list[str]]) -> None:
    # Real G-NAF PSV files use CRLF line endings; written as raw bytes here
    # rather than text mode specifically to avoid Windows' newline
    # translation doubling an already-embedded \r\n into \r\r\n, which broke
    # DuckDB's CSV dialect sniffer during development.
    lines = ["|".join(header), *("|".join(row) for row in rows)]
    path.write_bytes(("\r\n".join(lines) + "\r\n").encode("utf-8"))


def _address_row(
    pid: str,
    *,
    number_first: str = "",
    street_locality_pid: str = "STR1",
    locality_pid: str = "LOC1",
    postcode: str = "2000",
    address_site_pid: str = "AS1",
    retired: bool = False,
) -> list[str]:
    values = dict.fromkeys(_ADDRESS_DETAIL_HEADER, "")
    values["ADDRESS_DETAIL_PID"] = pid
    values["DATE_CREATED"] = "2016-01-01"
    values["DATE_RETIRED"] = "2020-01-01" if retired else ""
    values["NUMBER_FIRST"] = number_first
    values["STREET_LOCALITY_PID"] = street_locality_pid
    values["LOCALITY_PID"] = locality_pid
    values["ALIAS_PRINCIPAL"] = "1"
    values["POSTCODE"] = postcode
    values["CONFIDENCE"] = "1"
    values["ADDRESS_SITE_PID"] = address_site_pid
    values["LEVEL_GEOCODED_CODE"] = "1"
    return [values[column] for column in _ADDRESS_DETAIL_HEADER]


def _write_standard_dir(
    tmp_path: Path,
    *,
    address_rows: list[list[str]],
    geocode_rows: list[list[str]],
    state_code: str = "NSW",
) -> Path:
    _write_psv(
        tmp_path / f"{state_code}_STATE_psv.psv",
        _STATE_HEADER,
        [["ST1", "2016-01-01", "", "New South Wales", "NSW"]],
    )
    _write_psv(
        tmp_path / f"{state_code}_LOCALITY_psv.psv",
        _LOCALITY_HEADER,
        [["LOC1", "2016-01-01", "", "SYDNEY", "2000", "G", "ST1", "LOC1", "5"]],
    )
    _write_psv(
        tmp_path / f"{state_code}_STREET_LOCALITY_psv.psv",
        _STREET_LOCALITY_HEADER,
        [["STR1", "2016-01-01", "", "C", "EXAMPLE", "STREET", "", "LOC1", "STR1", "1", "5"]],
    )
    _write_psv(
        tmp_path / f"{state_code}_ADDRESS_DETAIL_psv.psv", _ADDRESS_DETAIL_HEADER, address_rows
    )
    _write_psv(
        tmp_path / f"{state_code}_ADDRESS_DEFAULT_GEOCODE_psv.psv", _GEOCODE_HEADER, geocode_rows
    )
    return tmp_path


def test_canonical_address_key_normalises_case_and_whitespace() -> None:
    key_a = canonical_address_key(
        None, None, "10", None, " Example ", "st", None, "Sydney", "nsw", "2000"
    )
    key_b = canonical_address_key(
        None, None, "10", None, "EXAMPLE", "ST", None, "SYDNEY", "NSW", "2000"
    )
    assert key_a == key_b
    assert key_a == "||10||EXAMPLE|ST||SYDNEY|NSW|2000"


def test_canonical_address_key_distinguishes_different_addresses() -> None:
    key_a = canonical_address_key(
        None, None, "10", None, "Example", "St", None, "Sydney", "NSW", "2000"
    )
    key_b = canonical_address_key(
        None, None, "11", None, "Example", "St", None, "Sydney", "NSW", "2000"
    )
    assert key_a != key_b


def test_build_gnaf_index_refuses_to_overwrite(tmp_path: Path) -> None:
    standard_dir = _write_standard_dir(
        tmp_path,
        address_rows=[_address_row("AD1", number_first="10")],
        geocode_rows=[["GEO1", "2016-01-01", "", "AD1", "GC", "151.05", "-33.85"]],
    )
    duckdb_path = tmp_path / "index.duckdb"
    build_gnaf_index(duckdb_path, standard_dir)

    with pytest.raises(GeographyImportError, match="refusing to overwrite"):
        build_gnaf_index(duckdb_path, standard_dir)


def test_build_gnaf_index_raises_for_missing_files(tmp_path: Path) -> None:
    with pytest.raises(GeographyImportError, match="no ADDRESS_DETAIL files"):
        build_gnaf_index(tmp_path / "index.duckdb", tmp_path)


def test_match_addresses_exact_accepts_a_unique_match(tmp_path: Path) -> None:
    standard_dir = _write_standard_dir(
        tmp_path,
        address_rows=[_address_row("AD1", number_first="10")],
        geocode_rows=[["GEO1", "2016-01-01", "", "AD1", "GC", "151.05", "-33.85"]],
    )
    duckdb_path = tmp_path / "index.duckdb"
    stats = build_gnaf_index(duckdb_path, standard_dir)
    assert stats.match_key_count == 1

    results = match_addresses_exact(
        duckdb_path,
        [
            AddressMatchInput(
                input_id="q1",
                street_number="10",
                street_name="Example",
                street_type="STREET",
                locality_name="Sydney",
                state_abbreviation="NSW",
                postcode="2000",
            )
        ],
    )

    result = results[0]
    assert result.status == "accepted"
    assert result.address_detail_pid == "AD1"
    assert result.longitude == pytest.approx(151.05)
    assert result.latitude == pytest.approx(-33.85)
    assert result.candidate_count == 1


def test_match_addresses_exact_reports_no_match(tmp_path: Path) -> None:
    standard_dir = _write_standard_dir(
        tmp_path,
        address_rows=[_address_row("AD1", number_first="10")],
        geocode_rows=[["GEO1", "2016-01-01", "", "AD1", "GC", "151.05", "-33.85"]],
    )
    duckdb_path = tmp_path / "index.duckdb"
    build_gnaf_index(duckdb_path, standard_dir)

    results = match_addresses_exact(
        duckdb_path,
        [
            AddressMatchInput(
                input_id="q1",
                street_number="999",
                street_name="Nowhere",
                street_type="STREET",
                locality_name="Sydney",
                state_abbreviation="NSW",
                postcode="2000",
            )
        ],
    )

    assert results[0].status == "no_match"
    assert results[0].candidate_count == 0


def test_match_addresses_exact_reports_ambiguous_for_duplicate_keys(tmp_path: Path) -> None:
    standard_dir = _write_standard_dir(
        tmp_path,
        address_rows=[
            _address_row("AD1", number_first="10", address_site_pid="AS1"),
            _address_row("AD2", number_first="10", address_site_pid="AS2"),
        ],
        geocode_rows=[
            ["GEO1", "2016-01-01", "", "AD1", "GC", "151.05", "-33.85"],
            ["GEO2", "2016-01-01", "", "AD2", "GC", "151.05", "-33.85"],
        ],
    )
    duckdb_path = tmp_path / "index.duckdb"
    build_gnaf_index(duckdb_path, standard_dir)

    results = match_addresses_exact(
        duckdb_path,
        [
            AddressMatchInput(
                input_id="q1",
                street_number="10",
                street_name="Example",
                street_type="STREET",
                locality_name="Sydney",
                state_abbreviation="NSW",
                postcode="2000",
            )
        ],
    )

    assert results[0].status == "ambiguous"
    assert results[0].candidate_count == 2


def test_match_addresses_exact_reports_out_of_bounds(tmp_path: Path) -> None:
    standard_dir = _write_standard_dir(
        tmp_path,
        address_rows=[_address_row("AD1", number_first="10")],
        geocode_rows=[["GEO1", "2016-01-01", "", "AD1", "GC", "0.0", "0.0"]],
    )
    duckdb_path = tmp_path / "index.duckdb"
    build_gnaf_index(duckdb_path, standard_dir)

    results = match_addresses_exact(
        duckdb_path,
        [
            AddressMatchInput(
                input_id="q1",
                street_number="10",
                street_name="Example",
                street_type="STREET",
                locality_name="Sydney",
                state_abbreviation="NSW",
                postcode="2000",
            )
        ],
    )

    assert results[0].status == "out_of_bounds"


def test_build_gnaf_index_excludes_retired_addresses(tmp_path: Path) -> None:
    standard_dir = _write_standard_dir(
        tmp_path,
        address_rows=[_address_row("AD1", number_first="10", retired=True)],
        geocode_rows=[["GEO1", "2016-01-01", "", "AD1", "GC", "151.05", "-33.85"]],
    )
    duckdb_path = tmp_path / "index.duckdb"
    stats = build_gnaf_index(duckdb_path, standard_dir)

    assert stats.match_key_count == 0


def test_match_addresses_exact_rejects_oversized_batch(tmp_path: Path) -> None:
    standard_dir = _write_standard_dir(
        tmp_path,
        address_rows=[_address_row("AD1", number_first="10")],
        geocode_rows=[["GEO1", "2016-01-01", "", "AD1", "GC", "151.05", "-33.85"]],
    )
    duckdb_path = tmp_path / "index.duckdb"
    build_gnaf_index(duckdb_path, standard_dir)

    oversized = [
        AddressMatchInput(
            input_id=str(i),
            street_number="10",
            street_name="Example",
            street_type="STREET",
            locality_name="Sydney",
            state_abbreviation="NSW",
        )
        for i in range(10_001)
    ]

    with pytest.raises(GeographyImportError, match="exceeds"):
        match_addresses_exact(duckdb_path, oversized)
