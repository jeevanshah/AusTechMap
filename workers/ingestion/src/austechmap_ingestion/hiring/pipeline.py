"""ATS crawl pipeline (Phase 5): fetch -> snapshot -> parse -> normalise
-> persist, reusing JobRepository and SnapshotStore (both Phase 1)
exactly as built -- modelled directly on sample_importer.py. Persistence
happens INSIDE the same success path as complete_with_snapshot: a run is
only marked succeeded once job rows are durably committed, not just once
bytes are fetched.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime

import psycopg

from austechmap_ingestion.fetch_safety import SafeFetchResult, safe_fetch
from austechmap_ingestion.hiring.ashby import fetch_ashby_postings
from austechmap_ingestion.hiring.company_sources import CompanyAtsSource
from austechmap_ingestion.hiring.lever import fetch_lever_postings
from austechmap_ingestion.hiring.normalisation import SkillDef, normalise_job
from austechmap_ingestion.hiring.persistence import mark_expired_jobs, persist_job_posting
from austechmap_ingestion.jobs import JobRepository, SnapshotRecord
from austechmap_ingestion.storage import SnapshotStore


@dataclass(frozen=True)
class AtsCrawlResult:
    run_id: uuid.UUID
    created: bool
    fetched: int
    jobs_created: int
    jobs_updated: int
    jobs_unchanged: int
    jobs_expired: int


def run_ats_crawl(
    repository: JobRepository,
    store: SnapshotStore,
    *,
    database_url: str,
    company_ats_source: CompanyAtsSource,
    skills: tuple[SkillDef, ...],
    worker_id: str = "ats-crawler",
    now: datetime | None = None,
    fetch_fn: Callable[..., SafeFetchResult] = safe_fetch,
) -> AtsCrawlResult:
    crawl_time = datetime.now(UTC) if now is None else now
    identifier = company_ats_source.ats_identifier
    provider = company_ats_source.ats_provider

    # A distinct data_sources row from company_ats_source.source_id: that
    # one records provenance for the discovery ("how we know this company
    # uses this ATS"); this one is the ongoing job-feed source jobs/
    # observations/skill-links actually cite.
    crawl_source_id = repository.ensure_source(
        source_key=f"ats-{provider}-{identifier}",
        name=f"{provider.capitalize()} jobs: {identifier}",
        kind="employer_first_party",
    )

    enqueued = repository.enqueue(
        run_type="ats_job_fetch",
        idempotency_key=f"{identifier}:{crawl_time.date().isoformat()}",
        source_id=crawl_source_id,
        payload={"ats_provider": provider, "ats_identifier": identifier},
        scheduled_for=crawl_time,
    )
    if not enqueued.created:
        return AtsCrawlResult(enqueued.run_id, False, 0, 0, 0, 0, 0)

    claim = repository.claim_run(enqueued.run_id, worker_id=worker_id, now=crawl_time)
    if claim is None:
        raise RuntimeError(f"New ATS crawl run could not be claimed: {enqueued.run_id}")

    try:
        if provider == "lever":
            raw_bytes, postings = fetch_lever_postings(identifier, fetch_fn=fetch_fn)
        else:
            raw_bytes, postings = fetch_ashby_postings(identifier, fetch_fn=fetch_fn)

        # Snapshot before parsing, per PRODUCT_SPEC.md §7.3's pipeline
        # stage order.
        stored = store.put(
            source_key=f"ats-{provider}-{identifier}",
            content=raw_bytes,
            content_type="application/json",
        )

        created = updated = unchanged = 0
        seen_external_ids: set[str] = set()
        with psycopg.connect(database_url) as connection, connection.transaction():
            for posting in postings:
                seen_external_ids.add(posting.external_id)
                normalised, skill_matches = normalise_job(
                    posting, provider=provider, skills=skills
                )
                result = persist_job_posting(
                    connection,
                    company_id=company_ats_source.company_id,
                    source_id=crawl_source_id,
                    run_id=claim.run_id,
                    source_system=provider,
                    posting=posting,
                    normalised=normalised,
                    skill_matches=skill_matches,
                    observed_at=crawl_time,
                )
                if result.created:
                    created += 1
                elif result.content_changed:
                    updated += 1
                else:
                    unchanged += 1

            expired = mark_expired_jobs(
                connection,
                company_id=company_ats_source.company_id,
                source_system=provider,
                source_id=crawl_source_id,
                run_id=claim.run_id,
                seen_external_ids=seen_external_ids,
                observed_at=crawl_time,
            )

        repository.complete_with_snapshot(
            claim,
            SnapshotRecord(
                source_id=crawl_source_id,
                object_key=stored.object_key,
                sha256=stored.sha256,
                content_type="application/json",
                byte_size=stored.byte_size,
                retrieved_at=crawl_time,
                response_metadata={"ats_provider": provider, "ats_identifier": identifier},
            ),
            metrics={
                "fetched": len(postings),
                "created": created,
                "updated": updated,
                "unchanged": unchanged,
                "expired": expired,
            },
            now=crawl_time,
        )
    except Exception as error:
        repository.fail(
            claim,
            retryable=True,
            error_code=type(error).__name__,
            error_message=str(error),
            now=crawl_time,
        )
        raise

    return AtsCrawlResult(claim.run_id, True, len(postings), created, updated, unchanged, expired)
