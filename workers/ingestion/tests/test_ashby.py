from __future__ import annotations

import json
from pathlib import Path

import pytest

from austechmap_ingestion.hiring.ashby import AshbyParseError, parse_ashby_postings

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "ashby_dovetail_postings.json"


def test_parse_ashby_postings_reads_the_real_recorded_fixture() -> None:
    payload = FIXTURE_PATH.read_bytes()
    postings = parse_ashby_postings(payload)

    assert len(postings) == 4
    first = next(p for p in postings if p.external_id == "a63ec0ac-b226-497c-aee4-e5d67ec31636")
    assert first.title == "Senior Platform Engineer"
    assert first.department == "Engineering"
    assert first.team == "Engineering"
    assert first.location_text == "Sydney"
    assert first.employment_type_raw == "FullTime"
    assert first.remote_type_raw == "Hybrid"
    assert first.source_url == "https://jobs.ashbyhq.com/dovetail/a63ec0ac-b226-497c-aee4-e5d67ec31636"
    assert first.posted_at is not None
    assert first.posted_at.tzinfo is not None


def test_parse_ashby_postings_excludes_unlisted_jobs() -> None:
    payload = json.dumps(
        {
            "jobs": [
                {
                    "id": "a",
                    "title": "Listed Job",
                    "jobUrl": "https://jobs.ashbyhq.com/example/a",
                    "isListed": True,
                },
                {
                    "id": "b",
                    "title": "Unlisted Job",
                    "jobUrl": "https://jobs.ashbyhq.com/example/b",
                    "isListed": False,
                },
            ],
            "apiVersion": "1",
        }
    ).encode()
    postings = parse_ashby_postings(payload)
    assert [p.external_id for p in postings] == ["a"]


def test_parse_ashby_postings_rejects_an_unsupported_api_version() -> None:
    payload = json.dumps({"jobs": [], "apiVersion": "2"}).encode()
    with pytest.raises(AshbyParseError, match="unsupported apiVersion"):
        parse_ashby_postings(payload)


def test_parse_ashby_postings_rejects_a_payload_without_a_jobs_array() -> None:
    with pytest.raises(AshbyParseError, match="jobs"):
        parse_ashby_postings(json.dumps({"apiVersion": "1"}).encode())


def test_parse_ashby_postings_rejects_invalid_json() -> None:
    with pytest.raises(AshbyParseError, match="not valid JSON"):
        parse_ashby_postings(b"not json at all")


def test_parse_ashby_postings_rejects_a_posting_missing_required_fields() -> None:
    payload = json.dumps({"jobs": [{"id": "abc"}], "apiVersion": "1"}).encode()
    with pytest.raises(AshbyParseError, match="missing id/title/jobUrl"):
        parse_ashby_postings(payload)
