"""Privacy-safe structured logging and optional exception reporting."""

from __future__ import annotations

import json
import logging
import os
import sys
from collections.abc import Mapping
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from typing import Protocol, TextIO

import sentry_sdk as _sentry_sdk

SERVICE_NAME = "austechmap-ingestion"


@dataclass(frozen=True)
class LogContext:
    """Identifiers approved for logs and error-reporting metadata."""

    run_id: str | None = None
    source_id: str | None = None
    company_id: str | None = None
    parser_version: str | None = None
    correlation_id: str | None = None

    def populated(self) -> dict[str, str]:
        return {key: value for key, value in asdict(self).items() if value is not None}


@dataclass(frozen=True)
class PipelineMetrics:
    fetched: int = 0
    parsed: int = 0
    created: int = 0
    updated: int = 0
    unchanged: int = 0
    failed: int = 0
    quarantined: int = 0


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        document: dict[str, object] = {
            "timestamp": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname.lower(),
            "service": SERVICE_NAME,
            "event": record.getMessage(),
        }
        fields = getattr(record, "structured_fields", {})
        if isinstance(fields, Mapping):
            document.update(fields)
        return json.dumps(document, separators=(",", ":"), sort_keys=True)


class StructuredLogger:
    """Emit a fixed JSON schema without accepting arbitrary source payloads."""

    def __init__(self, logger: logging.Logger) -> None:
        self._logger = logger

    def event(
        self,
        name: str,
        *,
        context: LogContext | None = None,
        metrics: PipelineMetrics | None = None,
        duration_ms: int | None = None,
        error_code: str | None = None,
        level: int = logging.INFO,
    ) -> None:
        fields: dict[str, object] = {}
        if context is not None:
            fields.update(context.populated())
        if metrics is not None:
            fields["metrics"] = asdict(metrics)
        if duration_ms is not None:
            fields["duration_ms"] = duration_ms
        if error_code is not None:
            fields["error_code"] = error_code
        self._logger.log(level, name, extra={"structured_fields": fields})


def configure_structured_logging(
    *, level: str | int | None = None, stream: TextIO | None = None
) -> StructuredLogger:
    """Configure the worker logger once for the current process."""
    logger = logging.getLogger(SERVICE_NAME)
    logger.handlers.clear()
    logger.propagate = False
    configured_level = level if level is not None else os.environ.get("LOG_LEVEL", "INFO")
    logger.setLevel(configured_level)
    handler = logging.StreamHandler(stream if stream is not None else sys.stderr)
    handler.setFormatter(_JsonFormatter())
    logger.addHandler(handler)
    return StructuredLogger(logger)


class ErrorReporter(Protocol):
    def capture_exception(self, error: BaseException, *, context: LogContext) -> None: ...


class NullErrorReporter:
    def capture_exception(self, error: BaseException, *, context: LogContext) -> None:
        del error, context


class SentryErrorReporter:
    def capture_exception(self, error: BaseException, *, context: LogContext) -> None:
        with _sentry_sdk.new_scope() as scope:
            for key, value in context.populated().items():
                scope.set_tag(key, value)
            scope.set_tag("exception_type", type(error).__name__)
            sanitized = RuntimeError("Worker exception details redacted")
            sanitized.__traceback__ = error.__traceback__
            _sentry_sdk.capture_exception(sanitized, scope=scope)


def build_error_reporter_from_env() -> ErrorReporter:
    """Enable Sentry only when a server-side DSN is explicitly configured."""
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return NullErrorReporter()
    _sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get("APP_ENV", "development"),
        release=os.environ.get("APP_RELEASE"),
        send_default_pii=False,
        include_local_variables=False,
        traces_sample_rate=0.0,
    )
    return SentryErrorReporter()
