from __future__ import annotations

import json
from pathlib import Path

import pytest

from austechmap_ingestion.hiring.greenhouse import GreenhouseParseError, parse_greenhouse_postings

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "greenhouse_cultureamp_postings.json"


def test_parse_greenhouse_postings_reads_the_real_recorded_fixture() -> None:
    payload = FIXTURE_PATH.read_bytes()
    postings = parse_greenhouse_postings(payload)

    assert len(postings) == 5
    first = next(p for p in postings if p.external_id == "8054865")
    assert first.title == "Associate Data Scientist"
    assert first.department == "Data"
    assert first.team is None
    assert first.location_text == "Melbourne"
    assert first.employment_type_raw is None
    assert first.remote_type_raw is None
    assert first.source_url == "https://job-boards.greenhouse.io/cultureamp/jobs/8054865"
    assert first.apply_url is None
    assert first.description_html is not None
    assert first.description_text is None
    assert first.posted_at is not None
    assert first.posted_at.tzinfo is not None


def test_parse_greenhouse_postings_handles_a_posting_with_no_department() -> None:
    payload = json.dumps(
        {
            "jobs": [
                {
                    "id": "1",
                    "title": "Generalist",
                    "absolute_url": "https://job-boards.greenhouse.io/example/jobs/1",
                    "departments": [],
                    "location": {"name": "Remote"},
                }
            ],
            "meta": {"total": 1},
        }
    ).encode()
    postings = parse_greenhouse_postings(payload)
    assert postings[0].department is None


def test_parse_greenhouse_postings_rejects_a_payload_without_a_jobs_array() -> None:
    with pytest.raises(GreenhouseParseError, match="jobs"):
        parse_greenhouse_postings(json.dumps({"meta": {"total": 0}}).encode())


def test_parse_greenhouse_postings_rejects_invalid_json() -> None:
    with pytest.raises(GreenhouseParseError, match="not valid JSON"):
        parse_greenhouse_postings(b"not json at all")


def test_parse_greenhouse_postings_rejects_a_posting_missing_required_fields() -> None:
    payload = json.dumps({"jobs": [{"id": "abc"}], "meta": {"total": 1}}).encode()
    with pytest.raises(GreenhouseParseError, match="missing id/title/absolute_url"):
        parse_greenhouse_postings(payload)
