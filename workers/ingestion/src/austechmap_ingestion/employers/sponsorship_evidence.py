"""Derives sponsorship evidence from Phase 5's real job postings (Phase 6,
Track 6A): a company whose currently-active job(s) explicitly mention
sponsorship gets `sponsorship_current_explicit` evidence; one whose only
match was on a since-expired job gets `sponsorship_historical_explicit`
instead. A company with no match at all gets no evidence row --
PRODUCT_SPEC.md §8.2's "No evidence found" category is a display-time
absence, not a written negative-evidence row.

Reuses the polymorphic `evidence` table (migration 0007) directly --
no new table, since `claim_type` is already freeform text.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import cast

import psycopg
from psycopg.types.json import Jsonb

from austechmap_ingestion.employers.sponsorship_keywords import classify_sponsorship_mention
from austechmap_ingestion.jobs import JobRepository

SOURCE_KEY = "sponsorship-keyword-classification"
_CURRENT_CLAIM_TYPE = "sponsorship_current_explicit"
_HISTORICAL_CLAIM_TYPE = "sponsorship_historical_explicit"
_CONFIDENCE = 0.7


@dataclass(frozen=True)
class _JobRow:
    id: uuid.UUID
    company_id: uuid.UUID
    title: str
    description_text: str | None
    source_url: str
    is_expired: bool


@dataclass(frozen=True)
class SponsorshipEvidenceStats:
    companies_considered: int
    current_evidence_created: int
    historical_evidence_created: int


def _matching_job(jobs: list[_JobRow]) -> _JobRow | None:
    for job in jobs:
        text = f"{job.title} {job.description_text or ''}"
        if classify_sponsorship_mention(text):
            return job
    return None


def _existing_evidence_job_ids(
    connection: psycopg.Connection[tuple[object, ...]], *, company_id: uuid.UUID, claim_type: str
) -> set[str]:
    rows = connection.execute(
        """
        SELECT claim_value ->> 'job_id' FROM evidence
        WHERE entity_type = 'company' AND entity_id = %s AND claim_type = %s
        """,
        (str(company_id), claim_type),
    ).fetchall()
    return {cast(str, row[0]) for row in rows if row[0] is not None}


def derive_sponsorship_evidence_from_jobs(
    database_url: str, *, now: datetime | None = None
) -> SponsorshipEvidenceStats:
    observed_at = now if now is not None else datetime.now(UTC)
    source_id = JobRepository(database_url).ensure_source(
        source_key=SOURCE_KEY,
        name="Sponsorship keyword classification of real job postings",
        kind="derived",
    )

    companies_considered = current_created = historical_created = 0
    with psycopg.connect(database_url, autocommit=True) as connection:
        rows = connection.execute(
            """
            SELECT id, company_id, title, description_text, source_url, expired_at IS NOT NULL
            FROM jobs
            """
        ).fetchall()
        jobs_by_company: dict[uuid.UUID, list[_JobRow]] = defaultdict(list)
        for row in rows:
            job = _JobRow(
                id=row[0], company_id=row[1], title=row[2],
                description_text=row[3], source_url=row[4], is_expired=row[5],
            )
            jobs_by_company[job.company_id].append(job)

        for company_id, jobs in jobs_by_company.items():
            companies_considered += 1
            active_jobs = [job for job in jobs if not job.is_expired]
            expired_jobs = [job for job in jobs if job.is_expired]

            match = _matching_job(active_jobs)
            claim_type = _CURRENT_CLAIM_TYPE
            if match is None:
                match = _matching_job(expired_jobs)
                claim_type = _HISTORICAL_CLAIM_TYPE
            if match is None:
                continue

            already_recorded = _existing_evidence_job_ids(
                connection, company_id=company_id, claim_type=claim_type
            )
            if str(match.id) in already_recorded:
                continue

            connection.execute(
                """
                INSERT INTO evidence (
                  entity_type, entity_id, claim_type, claim_value,
                  source_id, confidence, observed_at
                )
                VALUES ('company', %s, %s, %s, %s, %s, %s)
                """,
                (
                    str(company_id),
                    claim_type,
                    Jsonb(
                        {
                            "job_id": str(match.id),
                            "job_title": match.title,
                            "source_url": match.source_url,
                        }
                    ),
                    source_id,
                    _CONFIDENCE,
                    observed_at,
                ),
            )
            if claim_type == _CURRENT_CLAIM_TYPE:
                current_created += 1
            else:
                historical_created += 1

    return SponsorshipEvidenceStats(
        companies_considered=companies_considered,
        current_evidence_created=current_created,
        historical_evidence_created=historical_created,
    )
