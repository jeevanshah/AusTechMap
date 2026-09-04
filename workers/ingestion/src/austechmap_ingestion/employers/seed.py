"""Alpha seed-cohort import (Phase 3): load a curated candidate-employer
CSV and run each row through employers.matching.match_or_create_company,
so the 100-200 employer exit-gate target actually gets seeded into
`companies` rather than only having the matching machinery exist.

The CSV (employers/fixtures/alpha_seed_cohort_20260905.csv) is human-
curated research — a Gemini/Antigravity-assisted pass over public
company and careers-page information, reviewed before use here — not a
government or employer-first-party feed. It is recorded as a
'human_submission' data_sources row so provenance stays honest about
where the candidate list came from, distinct from the ABR/ASGS/G-NAF
sources that carry real primary data.

Each candidate's own confidence column drives what happens to it: 'Low'
(the research flagged the company as defunct or unverifiable — e.g. an
entity in voluntary administration) is skipped rather than imported and
immediately disabled, so no placeholder record exists for something that
was never actually seeded. 'High' and 'Medium' both seed normally through
the same deterministic matching engine every other identity source uses;
the tier and the research's stated reason are preserved as an evidence
row for provenance, not silently discarded after the import decision is
made.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Literal
from uuid import UUID

import psycopg
from psycopg.types.json import Jsonb

from austechmap_ingestion.employers.matching import (
    CandidateCompany,
    EmployerIdentityError,
    match_or_create_company,
)
from austechmap_ingestion.jobs import JobRepository

ConfidenceTier = Literal["High", "Medium", "Low"]

DEFAULT_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "alpha_seed_cohort_20260905.csv"
SEED_SOURCE_KEY = "alpha-seed-cohort-research"
_CONFIDENCE_SCORE: dict[ConfidenceTier, float] = {"High": 1.0, "Medium": 0.6, "Low": 0.0}


class SeedImportError(Exception):
    """Raised for malformed seed-cohort fixture data."""


@dataclass(frozen=True)
class SeedCandidate:
    display_name: str
    domain: str | None
    careers_url: str | None
    city: str
    reason: str
    confidence_tier: ConfidenceTier
    confidence_note: str | None


def _parse_confidence(raw: str) -> tuple[ConfidenceTier, str | None]:
    tier_part, _, note = raw.partition(" - ")
    tier = tier_part.strip()
    if tier not in ("High", "Medium", "Low"):
        raise SeedImportError(f"unrecognised confidence tier: {raw!r}")
    return tier, (note.strip() or None)  # type: ignore[return-value]


def load_seed_fixture(path: Path = DEFAULT_FIXTURE_PATH) -> list[SeedCandidate]:
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        candidates = [
            SeedCandidate(
                display_name=row["name"].strip(),
                domain=row["domain"].strip() or None,
                careers_url=row["careers_url"].strip() or None,
                city=row["city"].strip(),
                reason=row["reason"].strip(),
                confidence_tier=(parsed := _parse_confidence(row["confidence"]))[0],
                confidence_note=parsed[1],
            )
            for row in reader
        ]
    if not candidates:
        raise SeedImportError(f"no candidates found in {path}")
    return candidates


@dataclass(frozen=True)
class SeedImportStats:
    created: int
    matched: int
    review: int
    skipped_low_confidence: tuple[str, ...]
    errors: tuple[tuple[str, str], ...]


def run_seed_import(
    database_url: str, fixture_path: Path = DEFAULT_FIXTURE_PATH
) -> SeedImportStats:
    candidates = load_seed_fixture(fixture_path)
    source_id = JobRepository(database_url).ensure_source(
        source_key=SEED_SOURCE_KEY,
        name="Alpha seed cohort candidate research",
        kind="human_submission",
    )

    created = matched = review = 0
    skipped: list[str] = []
    errors: list[tuple[str, str]] = []

    for candidate in candidates:
        if candidate.confidence_tier == "Low":
            skipped.append(candidate.display_name)
            continue

        try:
            outcome = match_or_create_company(
                database_url,
                CandidateCompany(
                    display_name=candidate.display_name,
                    source_id=source_id,
                    domain=candidate.domain,
                    careers_url=candidate.careers_url,
                ),
            )
        except EmployerIdentityError as error:
            errors.append((candidate.display_name, str(error)))
            continue

        if outcome.decision == "created":
            created += 1
        elif outcome.decision == "matched":
            matched += 1
        else:
            review += 1

        if outcome.company_id is not None:
            _record_seed_evidence(database_url, outcome.company_id, candidate, source_id)

    return SeedImportStats(
        created=created,
        matched=matched,
        review=review,
        skipped_low_confidence=tuple(skipped),
        errors=tuple(errors),
    )


def _record_seed_evidence(
    database_url: str,
    company_id: UUID,
    candidate: SeedCandidate,
    source_id: UUID,
) -> None:
    with psycopg.connect(database_url, autocommit=True) as connection:
        connection.execute(
            """
            INSERT INTO evidence (
              entity_type, entity_id, claim_type, claim_value, source_id, confidence, observed_at
            )
            VALUES ('company', %s, 'employer_seed_research', %s, %s, %s, now())
            """,
            (
                str(company_id),
                Jsonb(
                    {
                        "city": candidate.city,
                        "reason": candidate.reason,
                        "confidence_tier": candidate.confidence_tier,
                        "confidence_note": candidate.confidence_note,
                    }
                ),
                source_id,
                _CONFIDENCE_SCORE[candidate.confidence_tier],
            ),
        )
