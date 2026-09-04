from __future__ import annotations

from pathlib import Path

import pytest

from austechmap_ingestion.employers.abr import (
    AbrImportError,
    build_abr_index,
    match_company_name,
    parse_abr_extract,
)

# Real, checksum-valid ABNs (see test_normalisation.py for how these were
# verified) used as fixture data throughout this file.
ACME_ABN = "51824753556"
JANE_ABN = "10000000032"
DUPLICATE_ABN = "10000000064"


def _write_extract(
    path: Path,
    *,
    include_sole_trader: bool = True,
    duplicate_acme: bool = False,
    include_cancelled: bool = False,
) -> None:
    records = [
        f"""
  <ABR recordLastUpdatedDate="20260101" replaced="N">
    <ABN status="ACT" ABNStatusFromDate="20100101">{ACME_ABN}</ABN>
    <EntityType>
      <EntityTypeInd>PRV</EntityTypeInd>
      <EntityTypeText>Australian Private Company</EntityTypeText>
    </EntityType>
    <MainEntity>
      <NonIndividualName type="MN">
        <NonIndividualNameText>Acme Technologies Pty Ltd</NonIndividualNameText>
      </NonIndividualName>
      <BusinessAddress>
        <AddressDetails>
          <State>NSW</State>
          <Postcode>2000</Postcode>
        </AddressDetails>
      </BusinessAddress>
    </MainEntity>
    <ASICNumber ASICNumberType="ACN">004085616</ASICNumber>
    <OtherEntity>
      <NonIndividualName type="TRD">
        <NonIndividualNameText>Acme Tech</NonIndividualNameText>
      </NonIndividualName>
    </OtherEntity>
  </ABR>"""
    ]
    if include_sole_trader:
        records.append(
            f"""
  <ABR recordLastUpdatedDate="20260101" replaced="N">
    <ABN status="ACT" ABNStatusFromDate="20120101">{JANE_ABN}</ABN>
    <EntityType>
      <EntityTypeInd>IND</EntityTypeInd>
      <EntityTypeText>Individual/Sole Trader</EntityTypeText>
    </EntityType>
    <LegalEntity>
      <IndividualName type="LGL">
        <GivenName>Jane</GivenName>
        <FamilyName>Smith</FamilyName>
      </IndividualName>
      <BusinessAddress>
        <AddressDetails>
          <State>VIC</State>
          <Postcode>3000</Postcode>
        </AddressDetails>
      </BusinessAddress>
    </LegalEntity>
  </ABR>"""
        )
    if duplicate_acme:
        records.append(
            f"""
  <ABR recordLastUpdatedDate="20260101" replaced="N">
    <ABN status="ACT" ABNStatusFromDate="20150101">{DUPLICATE_ABN}</ABN>
    <EntityType>
      <EntityTypeInd>PRV</EntityTypeInd>
      <EntityTypeText>Australian Private Company</EntityTypeText>
    </EntityType>
    <MainEntity>
      <NonIndividualName type="MN">
        <NonIndividualNameText>ACME TECHNOLOGIES PTY LTD</NonIndividualNameText>
      </NonIndividualName>
      <BusinessAddress>
        <AddressDetails>
          <State>QLD</State>
          <Postcode>4000</Postcode>
        </AddressDetails>
      </BusinessAddress>
    </MainEntity>
  </ABR>"""
        )
    if include_cancelled:
        records.append(
            """
  <ABR recordLastUpdatedDate="20260101" replaced="N">
    <ABN status="CAN" ABNStatusFromDate="20200101">10000000000</ABN>
    <EntityType>
      <EntityTypeInd>PRV</EntityTypeInd>
      <EntityTypeText>Australian Private Company</EntityTypeText>
    </EntityType>
    <MainEntity>
      <NonIndividualName type="MN">
        <NonIndividualNameText>Cancelled Co Pty Ltd</NonIndividualNameText>
      </NonIndividualName>
      <BusinessAddress>
        <AddressDetails>
          <State>SA</State>
          <Postcode>5000</Postcode>
        </AddressDetails>
      </BusinessAddress>
    </MainEntity>
  </ABR>"""
        )
    body = "".join(records)
    path.write_text(
        f"""<?xml version="1.0" encoding="UTF-8"?>
<Transfer error="0">
  <TransferInfo>
    <FileSequenceNumber>1</FileSequenceNumber>
    <RecordCount>{len(records)}</RecordCount>
    <ExtractTime>2026-09-01T00:00:00</ExtractTime>
  </TransferInfo>{body}
</Transfer>
""",
        encoding="utf-8",
    )


def test_parse_abr_extract_reads_a_company_and_a_sole_trader(tmp_path: Path) -> None:
    extract_path = tmp_path / "extract1.xml"
    _write_extract(extract_path)

    records = parse_abr_extract(extract_path)

    assert len(records) == 2
    company = next(r for r in records if r.abn == ACME_ABN)
    assert company.main_name == "Acme Technologies Pty Ltd"
    assert company.other_names == ("Acme Tech",)
    assert company.acn == "004085616"
    assert company.state == "NSW"
    assert company.postcode == "2000"

    sole_trader = next(r for r in records if r.abn == JANE_ABN)
    assert sole_trader.main_name == "Jane Smith"
    assert sole_trader.acn is None


def test_parse_abr_extract_skips_records_with_invalid_abn(tmp_path: Path) -> None:
    extract_path = tmp_path / "extract1.xml"
    extract_path.write_text(
        """<?xml version="1.0" encoding="UTF-8"?>
<Transfer error="0">
  <TransferInfo>
    <FileSequenceNumber>1</FileSequenceNumber>
    <RecordCount>1</RecordCount>
    <ExtractTime>2026-09-01T00:00:00</ExtractTime>
  </TransferInfo>
  <ABR recordLastUpdatedDate="20260101" replaced="N">
    <ABN status="ACT" ABNStatusFromDate="20100101">00000000001</ABN>
    <EntityType>
      <EntityTypeInd>PRV</EntityTypeInd>
      <EntityTypeText>Australian Private Company</EntityTypeText>
    </EntityType>
    <MainEntity>
      <NonIndividualName type="MN">
        <NonIndividualNameText>Bad Checksum Pty Ltd</NonIndividualNameText>
      </NonIndividualName>
      <BusinessAddress>
        <AddressDetails>
          <State>NSW</State>
          <Postcode>2000</Postcode>
        </AddressDetails>
      </BusinessAddress>
    </MainEntity>
  </ABR>
</Transfer>
""",
        encoding="utf-8",
    )

    assert parse_abr_extract(extract_path) == []


def test_build_abr_index_refuses_to_overwrite(tmp_path: Path) -> None:
    extract_path = tmp_path / "extract1.xml"
    _write_extract(extract_path)
    duckdb_path = tmp_path / "index.duckdb"
    build_abr_index(duckdb_path, [extract_path])

    with pytest.raises(AbrImportError, match="refusing to overwrite"):
        build_abr_index(duckdb_path, [extract_path])


def test_build_abr_index_requires_at_least_one_file(tmp_path: Path) -> None:
    with pytest.raises(AbrImportError, match="no ABR extract files"):
        build_abr_index(tmp_path / "index.duckdb", [])


def test_match_company_name_accepts_a_unique_match(tmp_path: Path) -> None:
    extract_path = tmp_path / "extract1.xml"
    _write_extract(extract_path)
    duckdb_path = tmp_path / "index.duckdb"
    build_abr_index(duckdb_path, [extract_path])

    result = match_company_name(duckdb_path, "ACME TECHNOLOGIES PTY. LTD.")

    assert result.status == "accepted"
    assert result.candidate is not None
    assert result.candidate.abn == ACME_ABN
    assert result.candidate.acn == "004085616"


def test_match_company_name_reports_no_match(tmp_path: Path) -> None:
    extract_path = tmp_path / "extract1.xml"
    _write_extract(extract_path)
    duckdb_path = tmp_path / "index.duckdb"
    build_abr_index(duckdb_path, [extract_path])

    result = match_company_name(duckdb_path, "Totally Different Company")

    assert result.status == "no_match"
    assert result.candidate_count == 0


def test_match_company_name_reports_ambiguous_for_duplicate_names(tmp_path: Path) -> None:
    extract_path = tmp_path / "extract1.xml"
    _write_extract(extract_path, duplicate_acme=True)
    duckdb_path = tmp_path / "index.duckdb"
    build_abr_index(duckdb_path, [extract_path])

    result = match_company_name(duckdb_path, "Acme Technologies Pty Ltd")

    assert result.status == "ambiguous"
    assert result.candidate_count == 2
    assert result.candidate is None


def test_match_company_name_excludes_cancelled_abns(tmp_path: Path) -> None:
    extract_path = tmp_path / "extract1.xml"
    _write_extract(extract_path, include_cancelled=True)
    duckdb_path = tmp_path / "index.duckdb"
    build_abr_index(duckdb_path, [extract_path])

    result = match_company_name(duckdb_path, "Cancelled Co Pty Ltd")

    assert result.status == "no_match"


def test_match_company_name_requires_an_existing_index(tmp_path: Path) -> None:
    with pytest.raises(AbrImportError, match="no ABR index"):
        match_company_name(tmp_path / "missing.duckdb", "Anything")
