"""ATS source resolution, scheduling, quarantine, and kill-switch controls."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Literal, cast

import psycopg
from psycopg.types.json import Jsonb

AtsProvider = Literal["lever", "ashby", "greenhouse"]
AtsSourceStatus = Literal["active", "paused", "quarantined", "disabled"]

ACTIVE_BOARD_INTERVAL = timedelta(hours=24)
EMPTY_BOARD_INTERVAL = timedelta(hours=72)
TERMINAL_FAILURE_INTERVAL = timedelta(hours=24)
QUARANTINE_THRESHOLD = 3
_VALID_STATUSES = frozenset({"active", "paused", "quarantined", "disabled"})


class AtsSourceOperationError(RuntimeError):
    """Raised when an ATS source cannot make the requested state transition."""


@dataclass(frozen=True)
class CompanyAtsSource:
    id: uuid.UUID
    company_id: uuid.UUID
    ats_provider: AtsProvider
    ats_identifier: str
    source_id: uuid.UUID


@dataclass(frozen=True)
class AtsSourceOperationalState:
    id: uuid.UUID
    status: AtsSourceStatus
    consecutive_failures: int
    next_crawl_at: datetime


def list_active_ats_sources(
    database_url: str,
    *,
    ats_identifier: str | None = None,
    due_at: datetime | None = None,
) -> list[CompanyAtsSource]:
    query = """
        SELECT id, company_id, ats_provider, ats_identifier, source_id
        FROM company_ats_sources
        WHERE status = 'active'
    """
    params: list[object] = []
    if ats_identifier is not None:
        query += " AND ats_identifier = %s"
        params.append(ats_identifier)
    if due_at is not None:
        query += " AND next_crawl_at <= %s"
        params.append(_aware(due_at))
    query += " ORDER BY next_crawl_at ASC, id ASC"

    with psycopg.connect(database_url) as connection:
        rows = connection.execute(query, tuple(params)).fetchall()

    return [
        CompanyAtsSource(
            id=cast(uuid.UUID, row[0]),
            company_id=cast(uuid.UUID, row[1]),
            ats_provider=cast(AtsProvider, row[2]),
            ats_identifier=cast(str, row[3]),
            source_id=cast(uuid.UUID, row[4]),
        )
        for row in rows
    ]


def record_ats_source_success(
    database_url: str,
    *,
    source_id: uuid.UUID,
    observed_at: datetime,
    fetched_jobs: int,
) -> AtsSourceOperationalState:
    if fetched_jobs < 0:
        raise ValueError("fetched_jobs must not be negative")
    completed_at = _aware(observed_at)
    interval = ACTIVE_BOARD_INTERVAL if fetched_jobs > 0 else EMPTY_BOARD_INTERVAL
    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            """
            UPDATE company_ats_sources
            SET consecutive_failures = 0,
                last_attempted_at = %s,
                last_succeeded_at = %s,
                next_crawl_at = %s,
                last_failure_at = NULL,
                last_failure_code = NULL
            WHERE id = %s
            RETURNING id, status, consecutive_failures, next_crawl_at
            """,
            (completed_at, completed_at, completed_at + interval, source_id),
        ).fetchone()
    if row is None:
        raise AtsSourceOperationError(f"ATS source not found: {source_id}")
    return _state(row)


def record_ats_source_terminal_failure(
    database_url: str,
    *,
    source_id: uuid.UUID,
    failed_at: datetime,
    error_code: str,
    actor_id: str,
) -> AtsSourceOperationalState:
    failure_time = _aware(failed_at)
    cleaned_code = error_code.strip()
    if not cleaned_code:
        raise ValueError("error_code is required")
    quarantine_reason = (
        f"Automatic quarantine after {QUARANTINE_THRESHOLD} terminal crawl failures; "
        f"latest={cleaned_code}"
    )
    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            """
            UPDATE company_ats_sources
            SET consecutive_failures = consecutive_failures + 1,
                last_attempted_at = %(failed_at)s,
                last_failure_at = %(failed_at)s,
                last_failure_code = %(error_code)s,
                next_crawl_at = %(next_crawl_at)s,
                status = CASE
                  WHEN consecutive_failures + 1 >= %(threshold)s THEN 'quarantined'
                  ELSE status
                END,
                status_reason = CASE
                  WHEN consecutive_failures + 1 >= %(threshold)s THEN %(reason)s
                  ELSE status_reason
                END,
                status_changed_at = CASE
                  WHEN consecutive_failures + 1 >= %(threshold)s THEN %(failed_at)s
                  ELSE status_changed_at
                END
            WHERE id = %(source_id)s AND status = 'active'
            RETURNING id, status, consecutive_failures, next_crawl_at
            """,
            {
                "failed_at": failure_time,
                "error_code": cleaned_code,
                "next_crawl_at": failure_time + TERMINAL_FAILURE_INTERVAL,
                "threshold": QUARANTINE_THRESHOLD,
                "reason": quarantine_reason,
                "source_id": source_id,
            },
        ).fetchone()
        if row is None:
            raise AtsSourceOperationError(f"active ATS source not found: {source_id}")
        state = _state(row)
        if state.status == "quarantined":
            connection.execute(
                """
                INSERT INTO audit_records (
                  actor_type, actor_id, action, target_type, target_id,
                  after_state, metadata
                )
                VALUES ('worker', %s, 'ats_source_quarantined', 'company_ats_source', %s, %s, %s)
                """,
                (
                    actor_id,
                    str(source_id),
                    Jsonb({"status": state.status}),
                    Jsonb(
                        {
                            "consecutive_failures": state.consecutive_failures,
                            "error_code": cleaned_code,
                        }
                    ),
                ),
            )
    return state


def set_ats_source_status(
    database_url: str,
    *,
    ats_provider: str,
    ats_identifier: str,
    status: str,
    reason: str,
    actor_id: str,
    changed_at: datetime | None = None,
) -> AtsSourceOperationalState:
    if ats_provider not in {"lever", "ashby", "greenhouse"}:
        raise ValueError(f"invalid ATS provider: {ats_provider!r}")
    if status not in _VALID_STATUSES:
        raise ValueError(f"invalid ATS source status: {status!r}")
    cleaned_reason = reason.strip()
    if not cleaned_reason:
        raise ValueError("reason is required")
    transition_time = _aware(changed_at or datetime.now(UTC))
    with psycopg.connect(database_url) as connection:
        before = connection.execute(
            """
            SELECT id, status FROM company_ats_sources
            WHERE ats_provider = %s AND ats_identifier = %s
            FOR UPDATE
            """,
            (ats_provider, ats_identifier),
        ).fetchone()
        if before is None:
            raise AtsSourceOperationError(
                f"ATS source not found: {ats_provider}/{ats_identifier}"
            )
        source_id = cast(uuid.UUID, before[0])
        previous_status = cast(str, before[1])
        row = connection.execute(
            """
            UPDATE company_ats_sources
            SET status = %s,
                status_reason = CASE WHEN %s = 'active' THEN NULL ELSE %s END,
                status_changed_at = %s,
                consecutive_failures = CASE WHEN %s = 'active' THEN 0 ELSE consecutive_failures END,
                next_crawl_at = CASE WHEN %s = 'active' THEN %s ELSE next_crawl_at END
            WHERE id = %s
            RETURNING id, status, consecutive_failures, next_crawl_at
            """,
            (
                status,
                status,
                cleaned_reason,
                transition_time,
                status,
                status,
                transition_time,
                source_id,
            ),
        ).fetchone()
        assert row is not None
        state = _state(row)
        connection.execute(
            """
            INSERT INTO audit_records (
              actor_type, actor_id, action, target_type, target_id,
              before_state, after_state, metadata
            )
            VALUES ('worker', %s, 'ats_source_status_changed', 'company_ats_source', %s, %s, %s, %s)
            """,
            (
                actor_id,
                str(source_id),
                Jsonb({"status": previous_status}),
                Jsonb({"status": state.status}),
                Jsonb(
                    {
                        "reason": cleaned_reason,
                        "ats_provider": ats_provider,
                        "ats_identifier": ats_identifier,
                    }
                ),
            ),
        )
    return state


def _state(row: tuple[object, ...]) -> AtsSourceOperationalState:
    return AtsSourceOperationalState(
        id=cast(uuid.UUID, row[0]),
        status=cast(AtsSourceStatus, row[1]),
        consecutive_failures=cast(int, row[2]),
        next_crawl_at=cast(datetime, row[3]),
    )


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("datetime must be timezone-aware")
    return value
