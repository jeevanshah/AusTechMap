"""Matches Home Affairs' current-labour-agreements list against our real
companies (Phase 6, Track 6A) -- enriching existing companies with
sponsorship evidence, never creating new ones from this source.

Direction matters: this iterates our own (currently 133) active
companies and checks each against the external list, not the reverse --
the same "affordable at this phase's scale" reasoning employers/
matching.py already documents for its own company-side fetch-all.

Two-tier matching, per PRODUCT_SPEC.md §8.3's "ambiguous match
confidence routes to human review before display":
- An exact match (via normalise_company_name, reused from
  employers/normalisation.py) auto-accepts as evidence directly.
- A close-but-not-exact match (pg_trgm similarity, the same extension
  and operator style apps/web/src/lib/queries/searchCompanies.ts already
  uses) is never auto-accepted -- it's queued in review_queue_items
  (kind='sponsorship_match', migration 0011) for a human to confirm.
- No match at all (neither exact nor sufficiently similar) leaves the
  company untouched -- absence of evidence, not a negative claim.
"""

from __future__ import annotations

import csv
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import cast

import psycopg
from psycopg.types.json import Jsonb

from austechmap_ingestion.employers.normalisation import normalise_company_name
from austechmap_ingestion.jobs import JobRepository

SOURCE_KEY = "home-affairs-labour-agreements"
_CLAIM_TYPE = "sponsorship_labour_agreement"
_EXACT_MATCH_CONFIDENCE = 1.0
_SIMILARITY_THRESHOLD = 0.5

# Deliberately no default fixture path (unlike ats_source_seed.py's or
# employers/seed.py's precedent): the real Home Affairs current-labour-
# agreements list has not been acquired yet (direct fetch from this
# environment returns HTTP 403; needs a real browser to get). Add one
# once a real, recorded file exists -- never point a default at a file
# that doesn't exist.


class LabourAgreementError(Exception):
    """Raised for malformed labour-agreement fixture data."""


@dataclass(frozen=True)
class LabourAgreementRecord:
    company_name: str
    agreement_type: str
    start_date: date
    end_date: date | None


def load_labour_agreements_fixture(path: Path) -> list[LabourAgreementRecord]:
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        records = [
            LabourAgreementRecord(
                company_name=row["company_name"].strip(),
                agreement_type=row["agreement_type"].strip(),
                start_date=date.fromisoformat(row["start_date"].strip()),
                end_date=(
                    date.fromisoformat(row["end_date"].strip()) if row["end_date"].strip() else None
                ),
            )
            for row in reader
        ]
    if not records:
        raise LabourAgreementError(f"no labour agreement records found in {path}")
    return records


@dataclass(frozen=True)
class LabourAgreementMatchStats:
    companies_considered: int
    exact_matches: int
    review_queue_items_created: int
    no_match: int


def _existing_evidence_keys(
    connection: psycopg.Connection[tuple[object, ...]], *, company_id: uuid.UUID
) -> set[str]:
    rows = connection.execute(
        """
        SELECT claim_value ->> 'match_key' FROM evidence
        WHERE entity_type = 'company' AND entity_id = %s AND claim_type = %s
        """,
        (str(company_id), _CLAIM_TYPE),
    ).fetchall()
    return {cast(str, row[0]) for row in rows if row[0] is not None}


def _has_pending_review(
    connection: psycopg.Connection[tuple[object, ...]], *, company_id: uuid.UUID
) -> bool:
    row = connection.execute(
        """
        SELECT 1 FROM review_queue_items
        WHERE company_id = %s AND kind = 'sponsorship_match' AND status = 'pending'
        """,
        (company_id,),
    ).fetchone()
    return row is not None


def match_labour_agreements(
    database_url: str, records: list[LabourAgreementRecord]
) -> LabourAgreementMatchStats:
    source_id = JobRepository(database_url).ensure_source(
        source_key=SOURCE_KEY,
        name="Home Affairs current labour agreements",
        kind="government_open_data",
    )

    by_normalised_name: dict[str, list[LabourAgreementRecord]] = defaultdict(list)
    for record in records:
        by_normalised_name[normalise_company_name(record.company_name)].append(record)

    considered = exact_matches = review_created = no_match = 0
    with psycopg.connect(database_url, autocommit=True) as connection:
        connection.execute(
            """
            CREATE TEMP TABLE labour_agreement_holders (
              holder_name TEXT NOT NULL
            )
            """
        )
        connection.execute(
            "CREATE INDEX ON labour_agreement_holders USING GIN (holder_name gin_trgm_ops)"
        )
        with connection.cursor().copy(
            "COPY labour_agreement_holders (holder_name) FROM STDIN"
        ) as copy:
            for record in records:
                copy.write_row((record.company_name,))

        companies = connection.execute(
            "SELECT id, display_name FROM companies WHERE status NOT IN ('merged', 'disabled')"
        ).fetchall()

        for company_id, display_name in companies:
            considered += 1
            normalised = normalise_company_name(display_name)
            matched_records = by_normalised_name.get(normalised)

            if matched_records:
                existing_keys = _existing_evidence_keys(connection, company_id=company_id)
                created_any = False
                for matched_record in matched_records:
                    match_key = (
                        f"{matched_record.company_name}:{matched_record.start_date.isoformat()}"
                    )
                    if match_key in existing_keys:
                        continue
                    connection.execute(
                        """
                        INSERT INTO evidence (
                          entity_type, entity_id, claim_type, claim_value,
                          source_id, confidence, observed_at
                        )
                        VALUES ('company', %s, %s, %s, %s, %s, now())
                        """,
                        (
                            str(company_id),
                            _CLAIM_TYPE,
                            Jsonb(
                                {
                                    "match_key": match_key,
                                    "holder_name": matched_record.company_name,
                                    "agreement_type": matched_record.agreement_type,
                                    "start_date": matched_record.start_date.isoformat(),
                                    "end_date": (
                                        matched_record.end_date.isoformat()
                                        if matched_record.end_date
                                        else None
                                    ),
                                }
                            ),
                            source_id,
                            _EXACT_MATCH_CONFIDENCE,
                        ),
                    )
                    created_any = True
                if created_any:
                    exact_matches += 1
                continue

            candidate = connection.execute(
                """
                SELECT holder_name, similarity(holder_name, %(name)s) AS score
                FROM labour_agreement_holders
                WHERE holder_name %% %(name)s
                ORDER BY score DESC
                LIMIT 1
                """,
                {"name": display_name},
            ).fetchone()
            if candidate is not None and candidate[1] >= _SIMILARITY_THRESHOLD:
                if not _has_pending_review(connection, company_id=company_id):
                    connection.execute(
                        """
                        INSERT INTO review_queue_items (
                          kind, company_id, payload, reason, source_id
                        )
                        VALUES ('sponsorship_match', %s, %s, %s, %s)
                        """,
                        (
                            company_id,
                            Jsonb(
                                {
                                    "holder_name": candidate[0],
                                    "similarity": float(candidate[1]),
                                }
                            ),
                            (
                                f"Home Affairs labour-agreement holder {candidate[0]!r} is "
                                f"similar but not an exact match (score {candidate[1]:.2f})"
                            ),
                            source_id,
                        ),
                    )
                review_created += 1
            else:
                no_match += 1

    return LabourAgreementMatchStats(
        companies_considered=considered,
        exact_matches=exact_matches,
        review_queue_items_created=review_created,
        no_match=no_match,
    )
