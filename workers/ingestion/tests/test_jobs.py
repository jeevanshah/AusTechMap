from __future__ import annotations

import os
import uuid
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from pathlib import Path

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.jobs import (
    ALLOWED_TRANSITIONS,
    ClaimedRun,
    InvalidTransitionError,
    JobRepository,
    LostLeaseError,
    RunStatus,
    SnapshotRecord,
    retry_delay,
    validate_transition,
)
from austechmap_ingestion.sample_importer import run_sample_import
from austechmap_ingestion.storage import FilesystemSnapshotStore

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"
FIXED_NOW = datetime(2026, 9, 4, 3, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (current, target)
        for current, targets in ALLOWED_TRANSITIONS.items()
        for target in RunStatus
        if target in targets
    ],
)
def test_valid_transitions_are_accepted(current: RunStatus, target: RunStatus) -> None:
    validate_transition(current, target)


@pytest.mark.parametrize(
    ("current", "target"),
    [
        (current, target)
        for current, targets in ALLOWED_TRANSITIONS.items()
        for target in RunStatus
        if target not in targets
    ],
)
def test_other_transitions_are_rejected(current: RunStatus, target: RunStatus) -> None:
    with pytest.raises(InvalidTransitionError):
        validate_transition(current, target)


def test_retry_policy_applies_jitter_and_retry_after_cap() -> None:
    assert retry_delay(1, jitter_fraction=-0.2) == timedelta(seconds=48)
    assert retry_delay(5, jitter_fraction=0.2) == timedelta(hours=7, minutes=12)
    assert retry_delay(
        1, jitter_fraction=0, retry_after=timedelta(days=2)
    ) == timedelta(hours=24)
    with pytest.raises(ValueError, match="No retry delay"):
        retry_delay(6, jitter_fraction=0)


def test_filesystem_store_is_content_addressed_and_idempotent(tmp_path: Path) -> None:
    store = FilesystemSnapshotStore(tmp_path)

    first = store.put(source_key="sample-source", content=b'{"ok":true}')
    second = store.put(source_key="sample-source", content=b'{"ok":true}')

    assert first == second
    assert first.object_key.startswith("raw/sample-source/")
    assert (tmp_path / Path(first.object_key)).read_bytes() == b'{"ok":true}'


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


def _repository_and_source() -> tuple[str, JobRepository, uuid.UUID, str]:
    database_url = _database_url()
    repository = JobRepository(database_url)
    suffix = uuid.uuid4().hex
    source_id = repository.ensure_source(
        source_key=f"jobs-{suffix}", name="Job integration source", kind="structured_feed"
    )
    return database_url, repository, source_id, suffix


def _enqueue_and_claim(
    repository: JobRepository,
    source_id: uuid.UUID,
    suffix: str,
    *,
    max_attempts: int = 6,
) -> ClaimedRun:
    enqueued = repository.enqueue(
        run_type="integration",
        idempotency_key=suffix,
        source_id=source_id,
        payload={"fixture": suffix},
        scheduled_for=FIXED_NOW,
        max_attempts=max_attempts,
    )
    claim = repository.claim_run(enqueued.run_id, worker_id="worker-a", now=FIXED_NOW)
    assert claim is not None
    return claim


@pytest.mark.integration
def test_enqueue_claim_heartbeat_and_fenced_completion() -> None:
    database_url, repository, source_id, suffix = _repository_and_source()
    first = repository.enqueue(
        run_type="integration",
        idempotency_key=suffix,
        source_id=source_id,
        payload={"fixture": suffix},
        scheduled_for=FIXED_NOW,
    )
    duplicate = repository.enqueue(
        run_type="integration",
        idempotency_key=suffix,
        source_id=source_id,
        payload={"ignored": True},
        scheduled_for=FIXED_NOW,
    )
    assert first.created is True
    assert duplicate == replace(first, created=False)

    claim = repository.claim_run(first.run_id, worker_id="worker-a", now=FIXED_NOW)
    assert claim is not None
    assert claim.attempt_number == 1
    assert repository.heartbeat(claim, now=FIXED_NOW + timedelta(minutes=1)) == (
        FIXED_NOW + timedelta(minutes=11)
    )

    snapshot = SnapshotRecord(
        source_id=source_id,
        object_key=f"raw/jobs/{suffix}",
        sha256="b" * 64,
        content_type="application/json",
        byte_size=2,
        retrieved_at=FIXED_NOW,
        response_metadata={},
    )
    with pytest.raises(LostLeaseError):
        repository.complete_with_snapshot(
            replace(claim, lease_token=uuid.uuid4()),
            snapshot,
            now=FIXED_NOW + timedelta(minutes=2),
        )
    snapshot_id = repository.complete_with_snapshot(
        claim, snapshot, metrics={"records": 1}, now=FIXED_NOW + timedelta(minutes=2)
    )
    repeated_claim = _enqueue_and_claim(repository, source_id, f"{suffix}-repeat")
    repository.complete_with_snapshot(
        repeated_claim,
        snapshot,
        metrics={"records": 1},
        now=FIXED_NOW + timedelta(minutes=2),
    )

    with psycopg.connect(database_url) as connection:
        run = connection.execute(
            "SELECT status, lease_token FROM import_runs WHERE id = %s", (claim.run_id,)
        ).fetchone()
        attempt = connection.execute(
            "SELECT outcome, metrics FROM import_run_attempts WHERE run_id = %s", (claim.run_id,)
        ).fetchone()
        audit = connection.execute(
            "SELECT action FROM audit_records WHERE target_id = %s", (str(claim.run_id),)
        ).fetchone()
        observation_count = connection.execute(
            "SELECT count(*) FROM raw_snapshots WHERE object_key = %s", (snapshot.object_key,)
        ).fetchone()
    assert run == ("succeeded", None)
    assert attempt == ("succeeded", {"records": 1})
    assert audit == ("import_succeeded",)
    assert observation_count == (2,)
    assert isinstance(snapshot_id, uuid.UUID)


@pytest.mark.integration
def test_retry_dead_letter_and_expired_lease_reconciliation() -> None:
    database_url, repository, source_id, suffix = _repository_and_source()
    first_claim = _enqueue_and_claim(repository, source_id, suffix, max_attempts=2)
    assert repository.fail(
        first_claim,
        retryable=True,
        error_code="timeout",
        error_message="temporary",
        jitter_fraction=0,
        now=FIXED_NOW,
    ) is RunStatus.RETRY_WAIT
    assert repository.claim_run(
        first_claim.run_id, worker_id="worker-b", now=FIXED_NOW
    ) is None
    second_claim = repository.claim_run(
        first_claim.run_id, worker_id="worker-b", now=FIXED_NOW + timedelta(minutes=1)
    )
    assert second_claim is not None
    assert repository.fail(
        second_claim,
        retryable=True,
        error_code="timeout",
        error_message="exhausted",
        now=FIXED_NOW + timedelta(minutes=1),
    ) is RunStatus.DEAD_LETTER

    expired = _enqueue_and_claim(repository, source_id, f"{suffix}-expired", max_attempts=2)
    reconciled = repository.reconcile_one_expired(
        now=FIXED_NOW + timedelta(minutes=11), jitter_fraction=0
    )
    assert reconciled is not None
    assert reconciled.run_id == expired.run_id
    assert reconciled.status is RunStatus.RETRY_WAIT
    with pytest.raises(LostLeaseError):
        repository.heartbeat(expired, now=FIXED_NOW + timedelta(minutes=11))

    with psycopg.connect(database_url) as connection:
        outcomes = connection.execute(
            """
            SELECT attempt_number, outcome
            FROM import_run_attempts
            WHERE run_id = %s
            ORDER BY attempt_number
            """,
            (first_claim.run_id,),
        ).fetchall()
    assert outcomes == [(1, "retryable_failure"), (2, "retryable_failure")]


@pytest.mark.integration
def test_sample_importer_persists_one_idempotent_snapshot(tmp_path: Path) -> None:
    database_url = _database_url()
    repository = JobRepository(database_url)
    store = FilesystemSnapshotStore(tmp_path)
    source_key = f"sample-{uuid.uuid4().hex}"

    first = run_sample_import(
        repository,
        store,
        source_key=source_key,
        content=b'{"sample":true}',
        now=FIXED_NOW,
    )
    duplicate = run_sample_import(
        repository,
        store,
        source_key=source_key,
        content=b'{"sample":true}',
        now=FIXED_NOW,
    )

    assert first.created is True
    assert first.snapshot_id is not None
    assert duplicate == replace(first, snapshot_id=None, created=False)
    with psycopg.connect(database_url) as connection:
        snapshot_count = connection.execute(
            "SELECT count(*) FROM raw_snapshots WHERE import_run_id = %s", (first.run_id,)
        ).fetchone()
    assert snapshot_count == (1,)
