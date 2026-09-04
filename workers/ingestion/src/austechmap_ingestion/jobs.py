"""Transactional PostgreSQL job repository with lease fencing."""

from __future__ import annotations

import random
import uuid
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any, cast

import psycopg
from psycopg.types.json import Jsonb

LEASE_DURATION = timedelta(minutes=10)
RETRY_DELAYS = (
    timedelta(minutes=1),
    timedelta(minutes=5),
    timedelta(minutes=30),
    timedelta(hours=2),
    timedelta(hours=6),
)
MAX_RETRY_AFTER = timedelta(hours=24)


class RunStatus(StrEnum):
    QUEUED = "queued"
    RUNNING = "running"
    RETRY_WAIT = "retry_wait"
    SUCCEEDED = "succeeded"
    DEAD_LETTER = "dead_letter"
    CANCELLED = "cancelled"


ALLOWED_TRANSITIONS: Mapping[RunStatus, frozenset[RunStatus]] = {
    RunStatus.QUEUED: frozenset({RunStatus.RUNNING, RunStatus.CANCELLED}),
    RunStatus.RUNNING: frozenset(
        {
            RunStatus.SUCCEEDED,
            RunStatus.RETRY_WAIT,
            RunStatus.DEAD_LETTER,
            RunStatus.CANCELLED,
        }
    ),
    RunStatus.RETRY_WAIT: frozenset({RunStatus.RUNNING, RunStatus.CANCELLED}),
    RunStatus.SUCCEEDED: frozenset(),
    RunStatus.DEAD_LETTER: frozenset(),
    RunStatus.CANCELLED: frozenset(),
}


class JobError(RuntimeError):
    """Base error for job repository operations."""


class InvalidTransitionError(JobError):
    """Raised when a state transition violates the job contract."""


class LostLeaseError(JobError):
    """Raised when a stale or unknown worker attempts a fenced write."""


@dataclass(frozen=True)
class EnqueuedRun:
    run_id: uuid.UUID
    created: bool


@dataclass(frozen=True)
class ClaimedRun:
    run_id: uuid.UUID
    source_id: uuid.UUID | None
    run_type: str
    payload: dict[str, Any]
    attempt_number: int
    max_attempts: int
    worker_id: str
    lease_token: uuid.UUID
    lease_expires_at: datetime
    log_correlation_id: str


@dataclass(frozen=True)
class SnapshotRecord:
    source_id: uuid.UUID
    object_key: str
    sha256: str
    content_type: str
    byte_size: int
    retrieved_at: datetime
    response_metadata: dict[str, Any]


@dataclass(frozen=True)
class ReconciledRun:
    run_id: uuid.UUID
    status: RunStatus


def validate_transition(current: RunStatus, target: RunStatus) -> None:
    """Validate a run-state edge in the single canonical transition map."""
    if target not in ALLOWED_TRANSITIONS[current]:
        raise InvalidTransitionError(f"Invalid import-run transition: {current} -> {target}")


def retry_delay(
    attempt_number: int,
    *,
    jitter_fraction: float | None = None,
    retry_after: timedelta | None = None,
) -> timedelta:
    """Return the ADR retry delay for a failed attempt."""
    if attempt_number < 1 or attempt_number > len(RETRY_DELAYS):
        raise ValueError(f"No retry delay exists after attempt {attempt_number}")
    fraction = random.uniform(-0.2, 0.2) if jitter_fraction is None else jitter_fraction
    if not -0.2 <= fraction <= 0.2:
        raise ValueError("jitter_fraction must be between -0.2 and 0.2")
    delay = RETRY_DELAYS[attempt_number - 1] * (1 + fraction)
    if retry_after is not None:
        delay = max(delay, min(retry_after, MAX_RETRY_AFTER))
    return delay


class JobRepository:
    def __init__(self, database_url: str) -> None:
        self._database_url = database_url

    def ensure_source(self, *, source_key: str, name: str, kind: str) -> uuid.UUID:
        with psycopg.connect(self._database_url) as connection:
            inserted = connection.execute(
                """
                INSERT INTO data_sources (source_key, name, kind)
                VALUES (%s, %s, %s)
                ON CONFLICT (source_key) DO NOTHING
                RETURNING id
                """,
                (source_key, name, kind),
            ).fetchone()
            if inserted is not None:
                return cast(uuid.UUID, inserted[0])
            existing = connection.execute(
                "SELECT id FROM data_sources WHERE source_key = %s", (source_key,)
            ).fetchone()
            if existing is None:
                raise JobError(f"Source disappeared during ensure: {source_key}")
            return cast(uuid.UUID, existing[0])

    def enqueue(
        self,
        *,
        run_type: str,
        idempotency_key: str,
        source_id: uuid.UUID | None,
        payload: Mapping[str, Any],
        scheduled_for: datetime,
        priority: int = 100,
        max_attempts: int = 6,
    ) -> EnqueuedRun:
        _utc_now(scheduled_for)
        if not 1 <= max_attempts <= 6:
            raise ValueError("max_attempts must be between 1 and 6")
        available_at = scheduled_for
        with psycopg.connect(self._database_url) as connection:
            inserted = connection.execute(
                """
                INSERT INTO import_runs (
                  run_type, source_id, payload, priority, idempotency_key,
                  scheduled_for, available_at, max_attempts
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (run_type, idempotency_key) DO NOTHING
                RETURNING id
                """,
                (
                    run_type,
                    source_id,
                    Jsonb(dict(payload)),
                    priority,
                    idempotency_key,
                    scheduled_for,
                    available_at,
                    max_attempts,
                ),
            ).fetchone()
            if inserted is not None:
                return EnqueuedRun(cast(uuid.UUID, inserted[0]), True)
            existing = connection.execute(
                """
                SELECT id FROM import_runs
                WHERE run_type = %s AND idempotency_key = %s
                """,
                (run_type, idempotency_key),
            ).fetchone()
            if existing is None:
                raise JobError("Run disappeared after idempotency conflict")
            return EnqueuedRun(cast(uuid.UUID, existing[0]), False)

    def claim_next(self, *, worker_id: str, now: datetime | None = None) -> ClaimedRun | None:
        return self._claim(worker_id=worker_id, run_id=None, now=now)

    def claim_run(
        self, run_id: uuid.UUID, *, worker_id: str, now: datetime | None = None
    ) -> ClaimedRun | None:
        return self._claim(worker_id=worker_id, run_id=run_id, now=now)

    def _claim(
        self,
        *,
        worker_id: str,
        run_id: uuid.UUID | None,
        now: datetime | None,
    ) -> ClaimedRun | None:
        claim_time = _utc_now(now)
        lease_token = uuid.uuid4()
        correlation_id = uuid.uuid4().hex
        with psycopg.connect(self._database_url) as connection:
            row = connection.execute(
                """
                WITH candidate AS (
                  SELECT id
                  FROM import_runs
                  WHERE status IN ('queued', 'retry_wait')
                    AND (%(run_id)s IS NULL OR id = %(run_id)s)
                    AND scheduled_for <= %(now)s
                    AND available_at <= %(now)s
                    AND cancel_requested_at IS NULL
                  ORDER BY priority ASC, available_at ASC, scheduled_for ASC, id ASC
                  FOR UPDATE SKIP LOCKED
                  LIMIT 1
                )
                UPDATE import_runs AS run
                SET status = 'running',
                    attempt_count = run.attempt_count + 1,
                    lease_owner = %(worker_id)s,
                    lease_token = %(lease_token)s,
                    lease_expires_at = %(lease_expires_at)s,
                    heartbeat_at = %(now)s,
                    first_started_at = COALESCE(run.first_started_at, %(now)s),
                    last_started_at = %(now)s
                FROM candidate
                WHERE run.id = candidate.id
                RETURNING run.id, run.source_id, run.run_type, run.payload,
                          run.attempt_count, run.max_attempts, run.lease_expires_at
                """,
                {
                    "now": claim_time,
                    "run_id": run_id,
                    "worker_id": worker_id,
                    "lease_token": lease_token,
                    "lease_expires_at": claim_time + LEASE_DURATION,
                },
            ).fetchone()
            if row is None:
                return None
            claimed = _claimed_run(row, worker_id, lease_token, correlation_id)
            connection.execute(
                """
                INSERT INTO import_run_attempts (
                  run_id, attempt_number, worker_id, lease_token,
                  started_at, heartbeat_at, log_correlation_id
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    claimed.run_id,
                    claimed.attempt_number,
                    worker_id,
                    lease_token,
                    claim_time,
                    claim_time,
                    correlation_id,
                ),
            )
            return claimed

    def heartbeat(self, claim: ClaimedRun, *, now: datetime | None = None) -> datetime:
        heartbeat_at = _utc_now(now)
        lease_expires_at = heartbeat_at + LEASE_DURATION
        with psycopg.connect(self._database_url) as connection:
            updated = connection.execute(
                """
                UPDATE import_runs
                SET heartbeat_at = %(now)s, lease_expires_at = %(lease_expires_at)s
                WHERE id = %(run_id)s
                  AND status = 'running'
                  AND lease_owner = %(worker_id)s
                  AND lease_token = %(lease_token)s
                  AND lease_expires_at > %(now)s
                RETURNING id
                """,
                {
                    "now": heartbeat_at,
                    "lease_expires_at": lease_expires_at,
                    "run_id": claim.run_id,
                    "worker_id": claim.worker_id,
                    "lease_token": claim.lease_token,
                },
            ).fetchone()
            if updated is None:
                raise LostLeaseError(f"Lease lost for run {claim.run_id}")
            attempt = connection.execute(
                """
                UPDATE import_run_attempts
                SET heartbeat_at = %s
                WHERE run_id = %s AND lease_token = %s AND outcome = 'running'
                RETURNING id
                """,
                (heartbeat_at, claim.run_id, claim.lease_token),
            ).fetchone()
            if attempt is None:
                raise JobError(f"Active attempt missing for run {claim.run_id}")
        return lease_expires_at

    def complete_with_snapshot(
        self,
        claim: ClaimedRun,
        snapshot: SnapshotRecord,
        *,
        metrics: Mapping[str, Any] | None = None,
        now: datetime | None = None,
    ) -> uuid.UUID:
        completed_at = _utc_now(now)
        validate_transition(RunStatus.RUNNING, RunStatus.SUCCEEDED)
        if claim.source_id != snapshot.source_id:
            raise JobError("Snapshot source does not match the claimed run")

        with psycopg.connect(self._database_url) as connection:
            fenced = _finish_run(
                connection,
                claim,
                target=RunStatus.SUCCEEDED,
                now=completed_at,
            )
            if not fenced:
                raise LostLeaseError(f"Lease lost for run {claim.run_id}")
            snapshot_row = connection.execute(
                """
                INSERT INTO raw_snapshots (
                  source_id, import_run_id, object_key, sha256, content_type,
                  byte_size, retrieved_at, response_metadata
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
                """,
                (
                    snapshot.source_id,
                    claim.run_id,
                    snapshot.object_key,
                    snapshot.sha256,
                    snapshot.content_type,
                    snapshot.byte_size,
                    snapshot.retrieved_at,
                    Jsonb(snapshot.response_metadata),
                ),
            ).fetchone()
            if snapshot_row is None:
                raise JobError("Snapshot insert returned no identifier")
            attempt = connection.execute(
                """
                UPDATE import_run_attempts
                SET finished_at = %s, outcome = 'succeeded', metrics = %s
                WHERE run_id = %s AND lease_token = %s AND outcome = 'running'
                RETURNING id
                """,
                (completed_at, Jsonb(dict(metrics or {})), claim.run_id, claim.lease_token),
            ).fetchone()
            if attempt is None:
                raise JobError(f"Active attempt missing for run {claim.run_id}")
            connection.execute(
                """
                INSERT INTO audit_records (
                  actor_type, actor_id, action, target_type, target_id,
                  after_state, metadata, request_id
                )
                VALUES ('worker', %s, 'import_succeeded', 'import_run', %s, %s, %s, %s)
                """,
                (
                    claim.worker_id,
                    str(claim.run_id),
                    Jsonb({"status": RunStatus.SUCCEEDED}),
                    Jsonb({"snapshot_id": str(snapshot_row[0])}),
                    claim.log_correlation_id,
                ),
            )
            return cast(uuid.UUID, snapshot_row[0])

    def fail(
        self,
        claim: ClaimedRun,
        *,
        retryable: bool,
        error_code: str,
        error_message: str,
        retry_after: timedelta | None = None,
        jitter_fraction: float | None = None,
        now: datetime | None = None,
    ) -> RunStatus:
        failed_at = _utc_now(now)
        can_retry = retryable and claim.attempt_number < claim.max_attempts
        target = RunStatus.RETRY_WAIT if can_retry else RunStatus.DEAD_LETTER
        validate_transition(RunStatus.RUNNING, target)
        available_at = (
            failed_at
            + retry_delay(
                claim.attempt_number,
                jitter_fraction=jitter_fraction,
                retry_after=retry_after,
            )
            if can_retry
            else failed_at
        )
        outcome = "retryable_failure" if retryable else "permanent_failure"

        with psycopg.connect(self._database_url) as connection:
            fenced = _finish_run(
                connection,
                claim,
                target=target,
                now=failed_at,
                available_at=available_at,
                error_code=error_code,
                error_message=error_message,
            )
            if not fenced:
                raise LostLeaseError(f"Lease lost for run {claim.run_id}")
            attempt = connection.execute(
                """
                UPDATE import_run_attempts
                SET finished_at = %s, outcome = %s, retry_classification = %s,
                    error_class = %s, error_message = %s
                WHERE run_id = %s AND lease_token = %s AND outcome = 'running'
                RETURNING id
                """,
                (
                    failed_at,
                    outcome,
                    "retryable" if retryable else "permanent",
                    error_code,
                    error_message,
                    claim.run_id,
                    claim.lease_token,
                ),
            ).fetchone()
            if attempt is None:
                raise JobError(f"Active attempt missing for run {claim.run_id}")
        return target

    def reconcile_one_expired(
        self,
        *,
        now: datetime | None = None,
        jitter_fraction: float | None = None,
    ) -> ReconciledRun | None:
        reconciled_at = _utc_now(now)
        with psycopg.connect(self._database_url) as connection:
            row = connection.execute(
                """
                SELECT id, attempt_count, max_attempts, lease_token
                FROM import_runs
                WHERE status = 'running' AND lease_expires_at <= %s
                ORDER BY lease_expires_at ASC, id ASC
                FOR UPDATE SKIP LOCKED
                LIMIT 1
                """,
                (reconciled_at,),
            ).fetchone()
            if row is None:
                return None
            run_id = cast(uuid.UUID, row[0])
            attempt_number = cast(int, row[1])
            max_attempts = cast(int, row[2])
            lease_token = cast(uuid.UUID, row[3])
            can_retry = attempt_number < max_attempts
            target = RunStatus.RETRY_WAIT if can_retry else RunStatus.DEAD_LETTER
            validate_transition(RunStatus.RUNNING, target)
            available_at = (
                reconciled_at
                + retry_delay(attempt_number, jitter_fraction=jitter_fraction)
                if can_retry
                else reconciled_at
            )
            updated = connection.execute(
                """
                UPDATE import_runs
                SET status = %s, available_at = %s,
                    lease_owner = NULL, lease_token = NULL,
                    lease_expires_at = NULL, heartbeat_at = NULL,
                    finished_at = %s,
                    terminal_error_code = %s,
                    terminal_error_message = %s
                WHERE id = %s AND status = 'running' AND lease_token = %s
                RETURNING id
                """,
                (
                    target,
                    available_at,
                    reconciled_at if target is RunStatus.DEAD_LETTER else None,
                    "lease_expired" if target is RunStatus.DEAD_LETTER else None,
                    "Lease expired on final attempt" if target is RunStatus.DEAD_LETTER else None,
                    run_id,
                    lease_token,
                ),
            ).fetchone()
            if updated is None:
                raise LostLeaseError(f"Lease changed while reconciling run {run_id}")
            attempt = connection.execute(
                """
                UPDATE import_run_attempts
                SET finished_at = %s, outcome = 'lease_expired',
                    retry_classification = 'retryable',
                    error_class = 'lease_expired', error_message = 'Worker lease expired'
                WHERE run_id = %s AND lease_token = %s AND outcome = 'running'
                RETURNING id
                """,
                (reconciled_at, run_id, lease_token),
            ).fetchone()
            if attempt is None:
                raise JobError(f"Active attempt missing for expired run {run_id}")
            return ReconciledRun(run_id, target)


def _finish_run(
    connection: psycopg.Connection[tuple[Any, ...]],
    claim: ClaimedRun,
    *,
    target: RunStatus,
    now: datetime,
    available_at: datetime | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
) -> bool:
    finished_at = now if target in {RunStatus.SUCCEEDED, RunStatus.DEAD_LETTER} else None
    updated = connection.execute(
        """
        UPDATE import_runs
        SET status = %(target)s,
            available_at = COALESCE(%(available_at)s, available_at),
            lease_owner = NULL,
            lease_token = NULL,
            lease_expires_at = NULL,
            heartbeat_at = NULL,
            finished_at = %(finished_at)s,
            terminal_error_code = %(error_code)s,
            terminal_error_message = %(error_message)s
        WHERE id = %(run_id)s
          AND status = 'running'
          AND lease_owner = %(worker_id)s
          AND lease_token = %(lease_token)s
          AND lease_expires_at > %(now)s
        RETURNING id
        """,
        {
            "target": target,
            "available_at": available_at,
            "finished_at": finished_at,
            "error_code": error_code if target is RunStatus.DEAD_LETTER else None,
            "error_message": error_message if target is RunStatus.DEAD_LETTER else None,
            "run_id": claim.run_id,
            "worker_id": claim.worker_id,
            "lease_token": claim.lease_token,
            "now": now,
        },
    ).fetchone()
    return updated is not None


def _claimed_run(
    row: tuple[Any, ...], worker_id: str, lease_token: uuid.UUID, correlation_id: str
) -> ClaimedRun:
    return ClaimedRun(
        run_id=cast(uuid.UUID, row[0]),
        source_id=cast(uuid.UUID | None, row[1]),
        run_type=cast(str, row[2]),
        payload=cast(dict[str, Any], row[3]),
        attempt_number=cast(int, row[4]),
        max_attempts=cast(int, row[5]),
        worker_id=worker_id,
        lease_token=lease_token,
        lease_expires_at=cast(datetime, row[6]),
        log_correlation_id=correlation_id,
    )


def _utc_now(value: datetime | None) -> datetime:
    resolved = datetime.now(UTC) if value is None else value
    if resolved.tzinfo is None or resolved.utcoffset() is None:
        raise ValueError("datetime must be timezone-aware")
    return resolved
