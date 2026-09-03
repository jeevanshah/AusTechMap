import json

import pytest

from austechmap_ingestion.__main__ import main
from austechmap_ingestion.health import build_health


def test_build_health_has_versioned_contract() -> None:
    assert build_health("run-123") == {
        "service": "ingestion",
        "status": "ok",
        "version": 1,
        "runId": "run-123",
    }


def test_build_health_rejects_empty_run_id() -> None:
    with pytest.raises(ValueError, match="must not be empty"):
        build_health("  ")


def test_health_cli_emits_json(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["health", "--run-id", "cli-run"]) == 0
    assert json.loads(capsys.readouterr().out) == build_health("cli-run")
