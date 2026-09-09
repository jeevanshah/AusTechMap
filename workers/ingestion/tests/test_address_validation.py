from __future__ import annotations

from pathlib import Path

import pytest

from austechmap_ingestion.__main__ import main
from austechmap_ingestion.employers.address_validation import (
    AddressFixtureValidationError,
    validate_address_fixture,
)


def _write_fixture(path: Path, rows: list[str]) -> None:
    path.write_text(
        "domain,street_address,suburb,state,postcode,source_confidence,source_note,source_url\n"
        + "\n".join(rows)
        + "\n",
        encoding="utf-8",
    )


def test_valid_fixture_has_street_evidence_and_unique_address(tmp_path: Path) -> None:
    fixture = tmp_path / "addresses.csv"
    _write_fixture(
        fixture,
        [
            "example.com,341 George Street,Sydney,NSW,2000,High,official office,https://example.com/contact",
            "other.example,110 Kippax Street,Surry Hills,NSW,2010,High,official office,https://other.example/contact",
        ],
    )
    validation = validate_address_fixture(fixture)
    assert validation.valid
    assert validation.errors == ()


def test_fixture_rejects_generic_street_missing_source_and_reuse(tmp_path: Path) -> None:
    fixture = tmp_path / "addresses.csv"
    _write_fixture(
        fixture,
        [
            "one.example,George Street,Sydney,NSW,2000,High,unverified,",
            "two.example,George Street,Sydney,NSW,2000,High,unverified,https://two.example",
        ],
    )
    validation = validate_address_fixture(fixture)
    assert not validation.valid
    assert any("street_address needs a number" in error for error in validation.errors)
    assert any("source_url" in error for error in validation.errors)
    assert validation.duplicate_addresses == (
        ("george street, sydney, nsw, 2000", ("one.example", "two.example")),
    )


def test_fixture_requires_source_url_column(tmp_path: Path) -> None:
    fixture = tmp_path / "addresses.csv"
    fixture.write_text(
        "domain,street_address,suburb,state,postcode,source_confidence,source_note\n"
        "example.com,341 George Street,Sydney,NSW,2000,High,test\n",
        encoding="utf-8",
    )
    with pytest.raises(AddressFixtureValidationError, match="source_url"):
        validate_address_fixture(fixture)


def test_seed_locations_blocks_an_unvalidated_nonlegacy_fixture(
    tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    fixture = tmp_path / "addresses.csv"
    _write_fixture(
        fixture,
        ["example.com,George Street,Sydney,NSW,2000,High,unverified,https://example.com"],
    )
    exit_code = main(
        ["seed-locations", "--database-url", "postgresql://unused", "--fixture", str(fixture)]
    )
    assert exit_code == 1
    assert "street_address needs a number" in capsys.readouterr().out
