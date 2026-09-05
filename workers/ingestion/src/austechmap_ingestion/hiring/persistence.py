"""Transactional persist-without-overwrite for job postings (Phase 5),
matching this project's never-delete philosophy already used for
companies/regions/audit_records. Both functions here run inside a single
connection/transaction the caller (pipeline.py) manages -- one fetch's
worth of postings, persisted then reconciled against what's now missing,
commits together or not at all.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import cast

import psycopg

from austechmap_ingestion.hiring.normalisation import NormalisedJob
from austechmap_ingestion.hiring.types import RawJobPosting

_KEYWORD_MATCH_METHOD = "keyword_match"


@dataclass(frozen=True)
class PersistResult:
    job_id: uuid.UUID
    created: bool
    content_changed: bool


def _role_family_id(
    connection: psycopg.Connection[tuple[object, ...]], role_family_key: str | None
) -> uuid.UUID | None:
    if role_family_key is None:
        return None
    row = connection.execute(
        "SELECT id FROM role_families WHERE key = %s", (role_family_key,)
    ).fetchone()
    return cast(uuid.UUID, row[0]) if row is not None else None


def _replace_skill_links(
    connection: psycopg.Connection[tuple[object, ...]],
    job_id: uuid.UUID,
    skill_matches: list[tuple[str, float]],
    source_id: uuid.UUID,
) -> None:
    """job_skill_links is a re-derivable classification artifact, unlike
    job_observations' append-only historical record -- delete and
    reinsert on every content change rather than accumulating stale
    matches from a previous version of the posting."""
    connection.execute(
        "DELETE FROM job_skill_links WHERE job_id = %s AND method = %s",
        (job_id, _KEYWORD_MATCH_METHOD),
    )
    for skill_key, confidence in skill_matches:
        skill_row = connection.execute(
            "SELECT id FROM skills WHERE key = %s", (skill_key,)
        ).fetchone()
        if skill_row is None:
            continue
        connection.execute(
            """
            INSERT INTO job_skill_links (job_id, skill_id, confidence, method, evidence_source_id)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (job_id, skill_row[0], confidence, _KEYWORD_MATCH_METHOD, source_id),
        )


def _insert_observation(
    connection: psycopg.Connection[tuple[object, ...]],
    *,
    job_id: uuid.UUID,
    observed_at: datetime,
    active: bool,
    content_hash: str,
    source_id: uuid.UUID,
    run_id: uuid.UUID | None,
) -> None:
    connection.execute(
        """
        INSERT INTO job_observations (
          job_id, observed_at, active, content_hash, source_id, import_run_id
        )
        VALUES (%s, %s, %s, %s, %s, %s)
        ON CONFLICT (job_id, observed_at) DO NOTHING
        """,
        (job_id, observed_at, active, content_hash, source_id, run_id),
    )


def persist_job_posting(
    connection: psycopg.Connection[tuple[object, ...]],
    *,
    company_id: uuid.UUID,
    source_id: uuid.UUID,
    run_id: uuid.UUID | None,
    source_system: str,
    posting: RawJobPosting,
    normalised: NormalisedJob,
    skill_matches: list[tuple[str, float]],
    observed_at: datetime,
) -> PersistResult:
    existing = connection.execute(
        """
        SELECT id, content_hash FROM jobs
        WHERE company_id = %s AND source_system = %s AND external_id = %s
        FOR UPDATE
        """,
        (company_id, source_system, posting.external_id),
    ).fetchone()

    role_family_id = _role_family_id(connection, normalised.role_family_key)

    if existing is None:
        inserted = connection.execute(
            """
            INSERT INTO jobs (
              company_id, source_id, source_system, external_id, title, normalized_title,
              role_family_id, seniority, employment_type, remote_type, location_text,
              salary_min, salary_max, salary_period, graduate_role, internship_role,
              source_url, description_text, content_hash, posted_at,
              first_seen_at, last_seen_at
            )
            VALUES (
              %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            )
            RETURNING id
            """,
            (
                company_id,
                source_id,
                source_system,
                posting.external_id,
                posting.title,
                normalised.normalized_title,
                role_family_id,
                normalised.seniority,
                posting.employment_type_raw,
                normalised.remote_type,
                posting.location_text,
                normalised.salary_min,
                normalised.salary_max,
                normalised.salary_period,
                normalised.graduate_role,
                normalised.internship_role,
                posting.source_url,
                posting.description_text,
                normalised.content_hash,
                posting.posted_at,
                observed_at,
                observed_at,
            ),
        ).fetchone()
        if inserted is None:
            raise RuntimeError("jobs insert did not return an id")
        job_id = cast(uuid.UUID, inserted[0])
        _replace_skill_links(connection, job_id, skill_matches, source_id)
        _insert_observation(
            connection,
            job_id=job_id,
            observed_at=observed_at,
            active=True,
            content_hash=normalised.content_hash,
            source_id=source_id,
            run_id=run_id,
        )
        return PersistResult(job_id=job_id, created=True, content_changed=True)

    job_id = cast(uuid.UUID, existing[0])
    previous_hash = cast(str, existing[1])
    content_changed = previous_hash != normalised.content_hash

    if content_changed:
        # first_seen_at, created_at, id are never touched here.
        connection.execute(
            """
            UPDATE jobs SET
              title = %s, normalized_title = %s, role_family_id = %s, seniority = %s,
              employment_type = %s, remote_type = %s, location_text = %s,
              salary_min = %s, salary_max = %s, salary_period = %s,
              graduate_role = %s, internship_role = %s, description_text = %s,
              content_hash = %s, last_seen_at = %s, expired_at = NULL
            WHERE id = %s
            """,
            (
                posting.title,
                normalised.normalized_title,
                role_family_id,
                normalised.seniority,
                posting.employment_type_raw,
                normalised.remote_type,
                posting.location_text,
                normalised.salary_min,
                normalised.salary_max,
                normalised.salary_period,
                normalised.graduate_role,
                normalised.internship_role,
                posting.description_text,
                normalised.content_hash,
                observed_at,
                job_id,
            ),
        )
        _replace_skill_links(connection, job_id, skill_matches, source_id)
    else:
        # A reappeared job un-expires even with unchanged content.
        connection.execute(
            "UPDATE jobs SET last_seen_at = %s, expired_at = NULL WHERE id = %s",
            (observed_at, job_id),
        )

    _insert_observation(
        connection,
        job_id=job_id,
        observed_at=observed_at,
        active=True,
        content_hash=normalised.content_hash,
        source_id=source_id,
        run_id=run_id,
    )
    return PersistResult(job_id=job_id, created=False, content_changed=content_changed)


def mark_expired_jobs(
    connection: psycopg.Connection[tuple[object, ...]],
    *,
    company_id: uuid.UUID,
    source_system: str,
    source_id: uuid.UUID,
    run_id: uuid.UUID | None,
    seen_external_ids: set[str],
    observed_at: datetime,
) -> int:
    """Any prior job for this company+source not seen in this fetch gets
    expired_at set + a final active=false observation. Never deletes the
    job row -- this is what actually populates expired_at/
    observations.active, which would otherwise go permanently unused."""
    rows = connection.execute(
        """
        SELECT id, external_id, content_hash FROM jobs
        WHERE company_id = %s AND source_system = %s AND expired_at IS NULL
        """,
        (company_id, source_system),
    ).fetchall()

    expired_count = 0
    for row in rows:
        job_id = cast(uuid.UUID, row[0])
        external_id = cast(str, row[1])
        content_hash = cast(str, row[2])
        if external_id in seen_external_ids:
            continue
        connection.execute(
            "UPDATE jobs SET expired_at = %s WHERE id = %s", (observed_at, job_id)
        )
        _insert_observation(
            connection,
            job_id=job_id,
            observed_at=observed_at,
            active=False,
            content_hash=content_hash,
            source_id=source_id,
            run_id=run_id,
        )
        expired_count += 1
    return expired_count
