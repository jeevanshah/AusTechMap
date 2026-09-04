"""ABR (Australian Business Register) bulk extract parsing and matching.

XML structure verified against the real, official schema published
alongside the bulk extract at data.gov.au (dataset "abn-bulk-extract",
resource bulkextract.xsd), not assumed. Key shape: a <Transfer> containing
many <ABR> elements, each with an <ABN>, an <EntityType>, either a
<MainEntity> (a company/organisation — the name is under
NonIndividualName/NonIndividualNameText) or a <LegalEntity> (a sole
trader — GivenName(s)/FamilyName), an optional <ASICNumber> (the ACN, when
the entity has one), and zero or more <OtherEntity> elements (trading and
other names).

Per IMPLEMENTATION_PLAN.md Phase 3, ABR is an identity/enrichment source,
not the only discovery source: this module does not import ABR wholesale
into `companies` — it builds an offline DuckDB lookup index (the full
register is several million entities, the same "reference dataset stays
out of the primary transactional database" shape as G-NAF in Phase 2) and
matches a small number of already-known candidate company names against
it, per ARCHITECTURE_DECISIONS.md-style deterministic-match-or-review
logic: a unique normalised-name match auto-accepts, anything else routes
to review rather than auto-merging.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from xml.etree.ElementTree import Element, iterparse

import duckdb

from austechmap_ingestion.employers.normalisation import (
    normalise_abn,
    normalise_acn,
    normalise_company_name,
)


class AbrImportError(Exception):
    """Raised for malformed ABR extract data or a misused index."""


@dataclass(frozen=True)
class AbrRecord:
    abn: str
    abn_status: str
    entity_type_code: str
    main_name: str
    other_names: tuple[str, ...]
    acn: str | None
    state: str | None
    postcode: str | None


def _text(element: Element | None, path: str) -> str | None:
    if element is None:
        return None
    found = element.find(path)
    return found.text if found is not None and found.text else None


def parse_abr_extract(path: Path) -> list[AbrRecord]:
    """Stream-parse one ABR bulk-extract XML file into records.

    Uses iterparse and clears each <ABR> element once processed so memory
    use stays bounded regardless of file size — the real extract covers
    the whole register, several million records, split across ~20 files.
    """
    records: list[AbrRecord] = []
    for _, element in iterparse(path, events=("end",)):
        if element.tag != "ABR":
            continue
        record = _parse_abr_element(element)
        element.clear()
        if record is not None:
            records.append(record)
    return records


def _parse_abr_element(element: Element) -> AbrRecord | None:
    abn_element = element.find("ABN")
    if abn_element is None or not abn_element.text:
        return None
    abn = normalise_abn(abn_element.text)
    if abn is None:
        return None
    abn_status = abn_element.get("status", "")

    entity_type_code = _text(element.find("EntityType"), "EntityTypeInd")
    if entity_type_code is None:
        return None

    main_entity = element.find("MainEntity")
    legal_entity = element.find("LegalEntity")
    if main_entity is not None:
        main_name = _text(main_entity, "NonIndividualName/NonIndividualNameText")
        address = main_entity.find("BusinessAddress/AddressDetails")
    elif legal_entity is not None:
        individual = legal_entity.find("IndividualName")
        given = _text(individual, "GivenName")
        family = _text(individual, "FamilyName")
        main_name = " ".join(part for part in (given, family) if part) or None
        address = legal_entity.find("BusinessAddress/AddressDetails")
    else:
        return None
    if not main_name:
        return None

    other_names = tuple(
        text
        for other in element.findall("OtherEntity")
        if (text := _text(other, "NonIndividualName/NonIndividualNameText")) is not None
    )

    acn_element = element.find("ASICNumber")
    acn = normalise_acn(acn_element.text) if acn_element is not None and acn_element.text else None

    state = _text(address, "State")
    postcode = _text(address, "Postcode")

    return AbrRecord(
        abn=abn,
        abn_status=abn_status,
        entity_type_code=entity_type_code,
        main_name=main_name,
        other_names=other_names,
        acn=acn,
        state=state,
        postcode=postcode,
    )


@dataclass(frozen=True)
class AbrIndexStats:
    record_count: int
    unique_name_count: int


def build_abr_index(duckdb_path: Path, extract_paths: list[Path]) -> AbrIndexStats:
    """Build a disposable DuckDB lookup index from one or more parsed ABR
    bulk-extract files. Callers supply the exact file list (mirroring
    geography.asgs) rather than this module guessing a naming or
    split-file convention that may go stale."""
    if duckdb_path.exists():
        raise AbrImportError(f"refusing to overwrite an existing index at {duckdb_path}")
    if not extract_paths:
        raise AbrImportError("no ABR extract files given")

    connection = duckdb.connect(str(duckdb_path))
    try:
        connection.execute(
            """
            CREATE TABLE abr_entities (
              abn VARCHAR, abn_status VARCHAR, entity_type_code VARCHAR,
              main_name VARCHAR, normalised_name VARCHAR, acn VARCHAR,
              state VARCHAR, postcode VARCHAR
            )
            """
        )
        record_count = 0
        for path in extract_paths:
            rows = [
                (
                    record.abn,
                    record.abn_status,
                    record.entity_type_code,
                    record.main_name,
                    normalise_company_name(record.main_name),
                    record.acn,
                    record.state,
                    record.postcode,
                )
                for record in parse_abr_extract(path)
            ]
            record_count += len(rows)
            if rows:
                connection.executemany(
                    "INSERT INTO abr_entities VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows
                )
        connection.execute(
            "CREATE INDEX abr_entities_normalised_name_idx ON abr_entities (normalised_name)"
        )
        unique_name_row = connection.execute(
            "SELECT count(DISTINCT normalised_name) FROM abr_entities"
        ).fetchone()
        unique_name_count = int(unique_name_row[0]) if unique_name_row is not None else 0
        return AbrIndexStats(record_count, unique_name_count)
    finally:
        connection.close()


@dataclass(frozen=True)
class AbrMatchCandidate:
    abn: str
    main_name: str
    acn: str | None
    state: str | None
    postcode: str | None


@dataclass(frozen=True)
class AbrMatchResult:
    status: Literal["accepted", "ambiguous", "no_match"]
    candidate: AbrMatchCandidate | None
    candidate_count: int


def match_company_name(duckdb_path: Path, candidate_name: str) -> AbrMatchResult:
    """Deterministic name match against the ABR index: only active ABNs
    are considered, and only a unique normalised-name match auto-accepts.
    Zero or multiple candidates are for the caller to route to review —
    this function never guesses among ambiguous candidates."""
    if not duckdb_path.exists():
        raise AbrImportError(f"no ABR index at {duckdb_path}")
    normalised = normalise_company_name(candidate_name)
    connection = duckdb.connect(str(duckdb_path), read_only=True)
    try:
        rows = connection.execute(
            """
            SELECT abn, main_name, acn, state, postcode
            FROM abr_entities
            WHERE normalised_name = ? AND abn_status = 'ACT'
            """,
            [normalised],
        ).fetchall()
    finally:
        connection.close()

    if len(rows) == 0:
        return AbrMatchResult("no_match", None, 0)
    if len(rows) > 1:
        return AbrMatchResult("ambiguous", None, len(rows))
    abn, main_name, acn, state, postcode = rows[0]
    return AbrMatchResult(
        "accepted", AbrMatchCandidate(abn, main_name, acn, state, postcode), 1
    )
