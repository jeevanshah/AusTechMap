"""Read-only replay of an immutable ATS snapshot through current parsers."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import cast

import psycopg

from austechmap_ingestion.hiring.ashby import AshbyParseError, parse_ashby_postings
from austechmap_ingestion.hiring.breezy import BreezyParseError, parse_breezy_postings
from austechmap_ingestion.hiring.company_sources import AtsProvider
from austechmap_ingestion.hiring.greenhouse import (
    GreenhouseParseError,
    parse_greenhouse_postings,
)
from austechmap_ingestion.hiring.lever import LeverParseError, parse_lever_postings
from austechmap_ingestion.hiring.normalisation import SkillDef, normalise_job
from austechmap_ingestion.hiring.smartrecruiters import (
    SmartRecruitersParseError,
    parse_smartrecruiters_postings,
)
from austechmap_ingestion.hiring.types import RawJobPosting
from austechmap_ingestion.hiring.workable import (
    WorkableParseError,
    parse_workable_postings,
)
from austechmap_ingestion.storage import SnapshotStore

_PROVIDERS = frozenset({"lever", "ashby", "greenhouse", "smartrecruiters", "workable", "breezy"})


class AtsReplayError(RuntimeError):
    """Raised when a run cannot be reproduced from its immutable snapshot."""


@dataclass(frozen=True)
class ReplayedJob:
    external_id: str
    title: str
    content_hash: str
    role_family_key: str | None
    seniority: str
    remote_type: str


@dataclass(frozen=True)
class AtsReplayResult:
    original_run_id: uuid.UUID
    ats_provider: AtsProvider
    ats_identifier: str
    snapshot_sha256: str
    jobs: tuple[ReplayedJob, ...]


def replay_ats_snapshot(
    database_url: str,
    store: SnapshotStore,
    *,
    run_id: uuid.UUID,
    skills: tuple[SkillDef, ...],
) -> AtsReplayResult:
    """Re-run parsing and normalisation without mutating current job state.

    Historical snapshots can be older than the live jobs table. Persisting an
    old replay through the normal crawl path could incorrectly expire newer
    jobs or move last_seen_at backwards, so replay deliberately returns a
    deterministic report for comparison instead.
    """
    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            """
            SELECT ir.run_type, ir.payload, rs.object_key, rs.sha256
            FROM import_runs ir
            JOIN raw_snapshots rs ON rs.import_run_id = ir.id
            WHERE ir.id = %s AND ir.status = 'succeeded'
            ORDER BY rs.created_at ASC, rs.id ASC
            LIMIT 1
            """,
            (run_id,),
        ).fetchone()
    if row is None:
        raise AtsReplayError(f"succeeded run with snapshot not found: {run_id}")
    if row[0] != "ats_job_fetch":
        raise AtsReplayError(f"run is not an ATS job fetch: {run_id}")

    payload = cast(dict[str, object], row[1])
    provider_value = payload.get("ats_provider")
    identifier_value = payload.get("ats_identifier")
    if provider_value not in _PROVIDERS or not isinstance(identifier_value, str):
        raise AtsReplayError(f"run has invalid ATS replay metadata: {run_id}")
    provider = cast(AtsProvider, provider_value)
    object_key = cast(str, row[2])
    snapshot_sha256 = cast(str, row[3])
    raw_bytes = store.get(object_key=object_key, expected_sha256=snapshot_sha256)
    postings = _parse(provider, raw_bytes)

    replayed: list[ReplayedJob] = []
    for posting in postings:
        normalised, _ = normalise_job(posting, provider=provider, skills=skills)
        replayed.append(
            ReplayedJob(
                external_id=posting.external_id,
                title=posting.title,
                content_hash=normalised.content_hash,
                role_family_key=normalised.role_family_key,
                seniority=normalised.seniority,
                remote_type=normalised.remote_type,
            )
        )
    replayed.sort(key=lambda job: job.external_id)
    return AtsReplayResult(
        original_run_id=run_id,
        ats_provider=provider,
        ats_identifier=identifier_value,
        snapshot_sha256=snapshot_sha256,
        jobs=tuple(replayed),
    )


def _parse(provider: AtsProvider, payload: bytes) -> list[RawJobPosting]:
    try:
        if provider == "lever":
            return parse_lever_postings(payload)
        if provider == "ashby":
            return parse_ashby_postings(payload)
        if provider == "greenhouse":
            return parse_greenhouse_postings(payload)
        if provider == "smartrecruiters":
            return parse_smartrecruiters_postings(payload)
        if provider == "workable":
            return parse_workable_postings(payload)
        if provider == "breezy":
            return parse_breezy_postings(payload)
        raise ValueError(f"unsupported provider: {provider}")
    except (
        AshbyParseError,
        BreezyParseError,
        GreenhouseParseError,
        LeverParseError,
        SmartRecruitersParseError,
        WorkableParseError,
    ) as error:
        raise AtsReplayError(f"{provider} snapshot no longer parses: {error}") from error
