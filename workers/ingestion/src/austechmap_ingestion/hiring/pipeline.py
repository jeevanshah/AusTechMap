"""ATS crawl pipeline (Phase 5): fetch -> snapshot -> parse -> normalise
-> persist, reusing JobRepository and SnapshotStore (both Phase 1)
exactly as built -- modelled directly on sample_importer.py. Persistence
happens INSIDE the same success path as complete_with_snapshot: a run is
only marked succeeded once job rows are durably committed, not just once
bytes are fetched.
"""

from __future__ import annotations

import hashlib
import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass, replace
from datetime import UTC, datetime

import psycopg

from austechmap_ingestion.fetch_safety import SafeFetchResult, safe_fetch
from austechmap_ingestion.hiring.ashby import fetch_ashby_postings
from austechmap_ingestion.hiring.breezy import fetch_breezy_payload, parse_breezy_postings
from austechmap_ingestion.hiring.company_sources import (
    CompanyAtsSource,
    record_ats_source_success,
    record_ats_source_terminal_failure,
)
from austechmap_ingestion.hiring.greenhouse import fetch_greenhouse_postings
from austechmap_ingestion.hiring.lever import fetch_lever_postings
from austechmap_ingestion.hiring.normalisation import SkillDef, normalise_job
from austechmap_ingestion.hiring.persistence import mark_expired_jobs, persist_job_posting
from austechmap_ingestion.hiring.pinpoint import fetch_pinpoint_payload, parse_pinpoint_postings
from austechmap_ingestion.hiring.smartrecruiters import fetch_smartrecruiters_postings
from austechmap_ingestion.hiring.static_careers import (
    StaticCareersDocument,
    StaticCareersPage,
    fetch_static_careers_document,
    parse_static_careers_page,
    parse_static_job_postings,
)
from austechmap_ingestion.hiring.workable import fetch_workable_postings
from austechmap_ingestion.jobs import JobRepository, RunStatus, SnapshotRecord
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


def build_ats_source_key(provider: str, identifier: str) -> str:
    """Build a valid snapshot and provenance source_key from an ATS provider and identifier.

    SnapshotStore.put() requires a lowercase slug containing only [a-z0-9_-]. ATS identifiers
    may be legitimately mixed-case (e.g. Lever's 'Zeller') or contain dots/symbols
    (e.g. Ashby's 'harrison.ai'). Sanitizing the identifier slug prevents storage errors
    while preserving the raw case-sensitive identifier for the fetch URL and provenance records.
    """
    if provider == "static_careers":
        return f"ats-static-careers-{hashlib.sha256(identifier.encode('utf-8')).hexdigest()[:24]}"
    slug = re.sub(r"[^a-z0-9_-]+", "-", identifier.lower()).strip("-")
    return f"ats-{provider}-{slug}"


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
    source_key = build_ats_source_key(provider, identifier)
    snapshot_content_type = "application/json"
    static_document: StaticCareersDocument | None = None

    # A distinct data_sources row from company_ats_source.source_id: that
    # one records provenance for the discovery ("how we know this company
    # uses this ATS"); this one is the ongoing job-feed source jobs/
    # observations/skill-links actually cite.
    crawl_source_id = repository.ensure_source(
        source_key=source_key,
        name=f"{provider.capitalize()} jobs: {identifier}",
        kind="employer_first_party",
    )

    enqueued = repository.enqueue(
        run_type="ats_job_fetch",
        # ATS identifiers are only unique within a provider.  For example,
        # a company can move from SmartRecruiters to Lever while both boards
        # use the identifier "mable".  Provider-scoping prevents the new
        # board from being mistaken for the old board's same-day crawl.
        idempotency_key=f"{provider}:{identifier}:{crawl_time.date().isoformat()}",
        source_id=crawl_source_id,
        payload={"ats_provider": provider, "ats_identifier": identifier},
        scheduled_for=crawl_time,
    )
    # Always attempt to claim the run this idempotency key resolved to,
    # whether freshly enqueued or a pre-existing same-day row -- claim_run
    # only succeeds for a 'queued' or 'retry_wait' row whose backoff has
    # elapsed, so a run that already succeeded (or is running elsewhere)
    # correctly stays untouched. Returning early on `not enqueued.created`
    # alone (the previous behaviour) meant a retryable failure from earlier
    # today could never actually be retried within the same day, since its
    # idempotency key already existed.
    claim = repository.claim_run(enqueued.run_id, worker_id=worker_id, now=crawl_time)
    if claim is None:
        if enqueued.created:
            raise RuntimeError(f"New ATS crawl run could not be claimed: {enqueued.run_id}")
        return AtsCrawlResult(enqueued.run_id, False, 0, 0, 0, 0, 0)

    # Reconcile claim.source_id with crawl_source_id if a pre-existing same-day
    # run row was originally enqueued with a differing or stale source_id.
    if claim.source_id != crawl_source_id:
        with psycopg.connect(database_url) as connection:
            connection.execute(
                "UPDATE import_runs SET source_id = %s WHERE id = %s",
                (crawl_source_id, claim.run_id),
            )
        claim = replace(claim, source_id=crawl_source_id)

    try:
        if provider == "lever":
            raw_bytes, postings = fetch_lever_postings(identifier, fetch_fn=fetch_fn)
        elif provider == "ashby":
            raw_bytes, postings = fetch_ashby_postings(identifier, fetch_fn=fetch_fn)
        elif provider == "greenhouse":
            raw_bytes, postings = fetch_greenhouse_postings(identifier, fetch_fn=fetch_fn)
        elif provider == "smartrecruiters":
            raw_bytes, postings = fetch_smartrecruiters_postings(identifier, fetch_fn=fetch_fn)
        elif provider == "workable":
            raw_bytes, postings = fetch_workable_postings(identifier, fetch_fn=fetch_fn)
        elif provider == "breezy":
            raw_bytes = fetch_breezy_payload(identifier, fetch_fn=fetch_fn)
        elif provider == "pinpoint":
            raw_bytes = fetch_pinpoint_payload(identifier, fetch_fn=fetch_fn)
        elif provider == "static_careers":
            static_document = fetch_static_careers_document(identifier, fetcher=fetch_fn)
            raw_bytes = static_document.content
            snapshot_content_type = static_document.content_type
        else:
            raise ValueError(f"unsupported ats_provider: {provider!r}")

        # Snapshot before parsing, per PRODUCT_SPEC.md §7.3's pipeline
        # stage order.
        stored = store.put(
            source_key=source_key,
            content=raw_bytes,
            content_type=snapshot_content_type,
        )
        if provider == "breezy":
            postings = parse_breezy_postings(raw_bytes)
        elif provider == "pinpoint":
            postings = parse_pinpoint_postings(raw_bytes)
        elif provider == "static_careers":
            if static_document is None:
                raise RuntimeError("static careers document was not fetched")
            static_page = StaticCareersPage(
                requested_url=static_document.requested_url,
                final_url=static_document.final_url,
                content=raw_bytes,
                content_type=static_document.content_type,
                parse_result=parse_static_careers_page(
                    raw_bytes, page_url=static_document.final_url
                ),
            )
            postings = list(parse_static_job_postings(static_page))

        created = updated = unchanged = 0
        seen_external_ids: set[str] = set()
        with psycopg.connect(database_url) as connection, connection.transaction():
            for posting in postings:
                seen_external_ids.add(posting.external_id)
                normalised, skill_matches = normalise_job(posting, provider=provider, skills=skills)
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
                content_type=snapshot_content_type,
                byte_size=stored.byte_size,
                retrieved_at=crawl_time,
                response_metadata={
                    "ats_provider": provider,
                    "ats_identifier": identifier,
                    **(
                        {"final_url": static_document.final_url}
                        if provider == "static_careers" and static_document is not None
                        else {}
                    ),
                },
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
        failure_status = repository.fail(
            claim,
            retryable=True,
            error_code=type(error).__name__,
            error_message=str(error),
            now=crawl_time,
        )
        if failure_status is RunStatus.DEAD_LETTER:
            record_ats_source_terminal_failure(
                database_url,
                source_id=company_ats_source.id,
                failed_at=crawl_time,
                error_code=type(error).__name__,
                actor_id=worker_id,
                request_id=claim.log_correlation_id,
            )
        raise

    record_ats_source_success(
        database_url,
        source_id=company_ats_source.id,
        import_run_id=claim.run_id,
        observed_at=crawl_time,
        fetched_jobs=len(postings),
        actor_id=worker_id,
        request_id=claim.log_correlation_id,
    )

    return AtsCrawlResult(claim.run_id, True, len(postings), created, updated, unchanged, expired)
