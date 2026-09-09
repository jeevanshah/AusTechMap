from __future__ import annotations

import csv
from pathlib import Path

import pytest

from austechmap_ingestion.employers.cohort_triage import (
    CohortCandidate,
    HomepageEvidence,
    ReachabilityResult,
    build_seed_preflight,
    harvest_homepage_evidence,
    load_cohort_fixture,
    load_triage_manifest,
    triage_cohort,
    write_evidence_harvest,
    write_seed_preflight,
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


def test_seed_preflight_only_includes_evidence_backed_candidates(tmp_path: Path) -> None:
    cohort = tmp_path / "cohort.csv"
    cohort.write_text(
        "name,domain,careers_url,city,reason,confidence\n"
        "Live,live.example,https://live.example/careers,Sydney,Original claim,High\n"
        "Down,down.example,https://down.example/careers,Perth,Original claim,High\n",
        encoding="utf-8",
    )
    evidence = tmp_path / "evidence.csv"
    evidence.write_text(
        "name,domain,city,harvest_status,source_url,page_title,meta_description\n"
        "Live,live.example,Sydney,metadata_captured_needs_human_assessment,"
        "https://live.example,Live Software,Build secure software products\n"
        "Down,down.example,Perth,skipped_unreachable,,,,\n",
        encoding="utf-8",
    )

    rows = build_seed_preflight(cohort, evidence)
    output = tmp_path / "preflight.csv"
    write_seed_preflight(output, rows)

    assert len(rows) == 1
    assert rows[0].technology_rationale == "Live Software Build secure software products"
    with output.open(encoding="utf-8", newline="") as handle:
        manifest = list(csv.DictReader(handle))
    assert manifest[0]["confidence"] == "Medium - first-party homepage metadata captured"
