"""Automated location drift detector (Phase 5).

Compares an employer's recorded head office location with the geographic
distribution of its live, unexpired Australian job postings. If an employer
has 3 or more active Australian jobs with zero roles in its home state and
high concentration in another state, flags the discrepancy for review
(preventing obsolete headquarters drift like the Nearmap Perth->Sydney issue).
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Any, cast

import psycopg
from psycopg.types.json import Jsonb

from austechmap_ingestion.hiring.normalisation import is_australian_location

STATE_PATTERNS: dict[str, tuple[str, ...]] = {
    "NSW": ("nsw", "new south wales", "sydney", "barangaroo", "north sydney", "surry hills", "pyrmont", "macquarie park", "parramatta"),
    "VIC": ("vic", "victoria", "melbourne", "cremorne", "richmond", "southbank", "docklands"),
    "QLD": ("qld", "queensland", "brisbane", "gold coast", "sunshine coast", "fortitude valley"),
    "WA": ("wa", "western australia", "perth", "subiaco", "west perth", "east perth"),
    "SA": ("sa", "south australia", "adelaide"),
    "ACT": ("act", "canberra", "australian capital territory"),
    "TAS": ("tas", "tasmania", "hobart", "launceston"),
    "NT": ("nt", "northern territory", "darwin"),
}


@dataclass(frozen=True)
class DriftCandidate:
    company_id: uuid.UUID
    slug: str
    display_name: str
    recorded_address: str
    home_state: str
    detected_state: str
    total_jobs: int
    jobs_in_detected_state: int
    sample_locations: tuple[str, ...]


@dataclass(frozen=True)
class LocationDriftStats:
    companies_evaluated: int
    drift_candidates_found: int
    review_items_enqueued: int
    candidates: tuple[DriftCandidate, ...]


def _detect_state(text: str | None) -> str | None:
    if not text:
        return None
    cleaned = text.lower()
    for state, keywords in STATE_PATTERNS.items():
        if any(f" {kw} " in f" {cleaned} " or f",{kw}" in cleaned or f" {kw}," in cleaned for kw in [state.lower()] + list(keywords[:2])):
            return state
    return None


def detect_location_drift(
    database_url: str,
    *,
    min_jobs: int = 3,
    enqueue_review: bool = False,
) -> LocationDriftStats:
    with psycopg.connect(database_url) as connection:
        rows = connection.execute(
            """
            SELECT c.id, c.slug, c.display_name, cl.raw_address,
                   json_agg(json_build_object('id', j.id, 'loc', j.location_text)) as jobs
            FROM companies c
            JOIN company_locations cl ON cl.company_id = c.id
            JOIN jobs j ON j.company_id = c.id
            WHERE c.status <> 'disabled'
              AND j.expired_at IS NULL
            GROUP BY c.id, c.slug, c.display_name, cl.raw_address
            HAVING count(j.id) >= %s
            """,
            (min_jobs,),
        ).fetchall()

        candidates: list[DriftCandidate] = []
        enqueued_count = 0

        for row in rows:
            company_id = cast(uuid.UUID, row[0])
            slug = cast(str, row[1])
            display_name = cast(str, row[2])
            raw_address = cast(str, row[3])
            jobs_data = cast(list[dict[str, Any]], row[4])

            home_state = _detect_state(raw_address)
            if not home_state:
                continue

            # Filter and categorize Australian job locations
            au_job_states: dict[str, int] = {}
            total_au_jobs = 0
            sample_locs: list[str] = []

            for job in jobs_data:
                loc_text = job.get("loc")
                if not is_australian_location(loc_text):
                    continue
                total_au_jobs += 1
                if loc_text and loc_text not in sample_locs and len(sample_locs) < 5:
                    sample_locs.append(loc_text)

                job_st = _detect_state(loc_text)
                if job_st:
                    au_job_states[job_st] = au_job_states.get(job_st, 0) + 1

            if total_au_jobs < min_jobs:
                continue

            home_state_jobs = au_job_states.get(home_state, 0)
            # Flag if ZERO jobs in recorded home state, and high concentration elsewhere
            if home_state_jobs == 0 and au_job_states:
                most_common_state, count = max(au_job_states.items(), key=lambda item: item[1])
                # At least 70% of mapped jobs in the other state
                if count / max(1, sum(au_job_states.values())) >= 0.7:
                    candidate = DriftCandidate(
                        company_id=company_id,
                        slug=slug,
                        display_name=display_name,
                        recorded_address=raw_address,
                        home_state=home_state,
                        detected_state=most_common_state,
                        total_jobs=total_au_jobs,
                        jobs_in_detected_state=count,
                        sample_locations=tuple(sample_locs),
                    )
                    candidates.append(candidate)

                    if enqueue_review:
                        reason = (
                            f"Potential headquarters location drift: recorded head office in {home_state}, "
                            f"but 0% of {total_au_jobs} active AU jobs are in {home_state} "
                            f"({count} jobs located in {most_common_state})."
                        )
                        inserted = connection.execute(
                            """
                            INSERT INTO review_queue_items (
                                kind, status, company_id, payload, reason, created_at
                            )
                            SELECT 'manual_flag', 'pending', %s, %s, %s, now()
                            WHERE NOT EXISTS (
                                SELECT 1 FROM review_queue_items
                                WHERE company_id = %s
                                  AND status = 'pending'
                                  AND reason LIKE 'Potential headquarters location drift%'
                            )
                            RETURNING id
                            """,
                            (
                                company_id,
                                Jsonb(
                                    {
                                        "recorded_address": raw_address,
                                        "home_state": home_state,
                                        "detected_state": most_common_state,
                                        "total_au_jobs": total_au_jobs,
                                        "sample_locations": sample_locs,
                                    }
                                ),
                                reason,
                                company_id,
                            ),
                        ).fetchone()
                        if inserted is not None:
                            enqueued_count += 1

        return LocationDriftStats(
            companies_evaluated=len(rows),
            drift_candidates_found=len(candidates),
            review_items_enqueued=enqueued_count,
            candidates=tuple(candidates),
        )
