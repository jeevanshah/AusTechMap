from __future__ import annotations

import json
import logging
from io import StringIO
from types import TracebackType
from typing import Any

import pytest
import sentry_sdk

from austechmap_ingestion.observability import (
    LogContext,
    NullErrorReporter,
    PipelineMetrics,
    SentryErrorReporter,
    build_error_reporter_from_env,
    configure_structured_logging,
)


def test_structured_logger_emits_only_fixed_context_and_metric_fields() -> None:
    output = StringIO()
    logger = configure_structured_logging(level="INFO", stream=output)

    logger.event(
        "import_finished",
        context=LogContext(run_id="run-1", source_id="source-1", parser_version="v2"),
        metrics=PipelineMetrics(fetched=4, parsed=3, created=2, quarantined=1),
        duration_ms=125,
    )

    document = json.loads(output.getvalue())
    assert document["service"] == "austechmap-ingestion"
    assert document["level"] == "info"
    assert document["event"] == "import_finished"
    assert document["run_id"] == "run-1"
    assert document["source_id"] == "source-1"
    assert document["parser_version"] == "v2"
    assert document["duration_ms"] == 125
    assert document["metrics"] == {
        "created": 2,
        "failed": 0,
        "fetched": 4,
        "parsed": 3,
        "quarantined": 1,
        "unchanged": 0,
        "updated": 0,
    }
    assert "company_id" not in document
    assert "message" not in document


def test_structured_logger_honours_level_filter() -> None:
    output = StringIO()
    logger = configure_structured_logging(level="ERROR", stream=output)

    logger.event("not_emitted")
    logger.event("emitted", error_code="timeout", level=logging.ERROR)

    document = json.loads(output.getvalue())
    assert document["event"] == "emitted"
    assert document["error_code"] == "timeout"


def test_error_reporting_is_disabled_without_dsn(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SENTRY_DSN", raising=False)

    reporter = build_error_reporter_from_env()

    assert isinstance(reporter, NullErrorReporter)
    reporter.capture_exception(ValueError("private source payload"), context=LogContext())


def test_sentry_setup_disables_pii_tracing_and_local_variables(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    configured: dict[str, Any] = {}

    def init(**kwargs: Any) -> None:
        configured.update(kwargs)

    monkeypatch.setenv("SENTRY_DSN", "https://public@example.invalid/1")
    monkeypatch.setenv("APP_ENV", "test")
    monkeypatch.setenv("APP_RELEASE", "abc123")
    monkeypatch.setattr(sentry_sdk, "init", init)

    reporter = build_error_reporter_from_env()

    assert isinstance(reporter, SentryErrorReporter)
    assert configured == {
        "dsn": "https://public@example.invalid/1",
        "environment": "test",
        "include_local_variables": False,
        "release": "abc123",
        "send_default_pii": False,
        "traces_sample_rate": 0.0,
    }


class _FakeScope:
    def __init__(self) -> None:
        self.tags: dict[str, str] = {}

    def __enter__(self) -> _FakeScope:
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        del exc_type, exc_value, traceback

    def set_tag(self, key: str, value: str) -> None:
        self.tags[key] = value


def test_sentry_reporter_redacts_exception_details(monkeypatch: pytest.MonkeyPatch) -> None:
    scope = _FakeScope()
    captured: list[BaseException] = []

    def capture_exception(error: BaseException, **kwargs: Any) -> None:
        assert kwargs["scope"] is scope
        captured.append(error)

    monkeypatch.setattr(sentry_sdk, "new_scope", lambda: scope)
    monkeypatch.setattr(sentry_sdk, "capture_exception", capture_exception)
    reporter = SentryErrorReporter()

    reporter.capture_exception(
        ValueError("private source payload"),
        context=LogContext(run_id="run-1", source_id="source-1"),
    )

    assert str(captured[0]) == "Worker exception details redacted"
    assert "private source payload" not in str(captured[0])
    assert scope.tags == {
        "exception_type": "ValueError",
        "run_id": "run-1",
        "source_id": "source-1",
    }
