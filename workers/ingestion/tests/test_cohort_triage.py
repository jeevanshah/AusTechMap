from __future__ import annotations

import csv
from pathlib import Path

import pytest

from austechmap_ingestion.employers.cohort_triage import (
    CohortCandidate,
    HomepageEvidence,
    ReachabilityResult,
    harvest_homepage_evidence,
    load_cohort_fixture,
    load_triage_manifest,
    triage_cohort,
    write_evidence_harvest,
    write_triage_manifest,
)


def test_triage_creates_safe_review_states_and_manifest(tmp_path: Path) -> None:
    candidates = (
        CohortCandidate(name="Live", domain="live.example", city="Sydney"),
        CohortCandidate(name="Down", domain="down.example", city="Perth"),
    )
    results = {
        "live.example": ReachabilityResult(True, 200, "https://live.example/", None),
        "down.example": ReachabilityResult(False, None, None, "URLError"),
    }

    rows = triage_cohort(candidates, workers=2, probe=results.__getitem__)
    output = tmp_path / "manifest.csv"
    write_triage_manifest(output, rows)

    assert [row.status for row in rows] == [
        "reachable_needs_primary_evidence",
        "unreachable_needs_manual_review",
    ]
    with output.open(encoding="utf-8", newline="") as handle:
        manifest = list(csv.DictReader(handle))
    assert manifest[0]["next_action"] == (
        "Record first-party company, technology, and street-address evidence."
    )
    assert manifest[1]["diagnostic"] == "URLError"


def test_load_cohort_fixture_requires_identity_columns(tmp_path: Path) -> None:
    fixture = tmp_path / "cohort.csv"
    fixture.write_text("name,domain\nMissing city,example.com\n", encoding="utf-8")

    with pytest.raises(ValueError, match="missing required columns: city"):
        load_cohort_fixture(fixture)


def test_evidence_harvest_captures_only_reachable_candidates(tmp_path: Path) -> None:
    candidates = (
        CohortCandidate(name="Live", domain="live.example", city="Sydney"),
        CohortCandidate(name="Down", domain="down.example", city="Perth"),
    )
    triage_rows = triage_cohort(
        candidates,
        probe=lambda domain: {
            "live.example": ReachabilityResult(True, 200, "https://live.example", None),
            "down.example": ReachabilityResult(False, None, None, "URLError"),
        }[domain],
    )

    rows = harvest_homepage_evidence(
        triage_rows,
        fetch=lambda url: HomepageEvidence(200, url, "Live Company", "Software company", None),
    )
    output = tmp_path / "evidence.csv"
    write_evidence_harvest(output, rows)

    assert [row.status for row in rows] == [
        "metadata_captured_needs_human_assessment",
        "skipped_unreachable",
    ]
    with output.open(encoding="utf-8", newline="") as handle:
        manifest = list(csv.DictReader(handle))
    assert manifest[0]["page_title"] == "Live Company"
    assert manifest[1]["source_url"] == ""


def test_load_triage_manifest_reads_written_manifest(tmp_path: Path) -> None:
    candidates = (CohortCandidate(name="Live", domain="live.example", city="Sydney"),)
    triage_rows = triage_cohort(
        candidates,
        probe=lambda _domain: ReachabilityResult(True, 200, "https://live.example", None),
    )
    manifest = tmp_path / "triage.csv"
    write_triage_manifest(manifest, triage_rows)

    loaded = load_triage_manifest(manifest)

    assert loaded == triage_rows
