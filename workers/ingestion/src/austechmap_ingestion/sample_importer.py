"""Small end-to-end importer proving the Phase 1 persistence contract."""

from __future__ import annotations

import hashlib
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime

from austechmap_ingestion.jobs import JobRepository, SnapshotRecord
from austechmap_ingestion.storage import SnapshotStore


@dataclass(frozen=True)
class SampleImportResult:
    run_id: uuid.UUID
    snapshot_id: uuid.UUID | None
    created: bool


def run_sample_import(
    repository: JobRepository,
    store: SnapshotStore,
    *,
    source_key: str,
    content: bytes,
    content_type: str = "application/json",
    worker_id: str = "sample-importer",
    now: datetime | None = None,
) -> SampleImportResult:
    """Persist one idempotent sample snapshot and its audited run."""
    import_time = datetime.now(UTC) if now is None else now
    if import_time.tzinfo is None or import_time.utcoffset() is None:
        raise ValueError("now must be timezone-aware")
    source_id = repository.ensure_source(
        source_key=source_key,
        name=f"Sample source: {source_key}",
        kind="derived",
    )
    digest = hashlib.sha256(content).hexdigest()
    enqueued = repository.enqueue(
        run_type="sample_snapshot",
        idempotency_key=f"{source_key}:{digest}",
        source_id=source_id,
        payload={"content_type": content_type, "sha256": digest},
        scheduled_for=import_time,
    )
    if not enqueued.created:
        return SampleImportResult(enqueued.run_id, None, False)

    claim = repository.claim_run(enqueued.run_id, worker_id=worker_id, now=import_time)
    if claim is None:
        raise RuntimeError(f"New sample run could not be claimed: {enqueued.run_id}")
    try:
        stored = store.put(source_key=source_key, content=content)
    except Exception as error:
        repository.fail(
            claim,
            retryable=True,
            error_code=type(error).__name__,
            error_message=str(error),
            jitter_fraction=0,
            now=import_time,
        )
        raise
    snapshot_id = repository.complete_with_snapshot(
        claim,
        SnapshotRecord(
            source_id=source_id,
            object_key=stored.object_key,
            sha256=stored.sha256,
            content_type=content_type,
            byte_size=stored.byte_size,
            retrieved_at=import_time,
            response_metadata={"importer": "sample", "version": 1},
        ),
        metrics={"bytes": stored.byte_size, "snapshots": 1},
        now=import_time,
    )
    return SampleImportResult(enqueued.run_id, snapshot_id, True)
