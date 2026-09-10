from __future__ import annotations

import json

import pytest

from austechmap_ingestion.hiring.workable import (
    WorkableParseError,
    parse_workable_postings,
)


def test_parse_workable_postings_valid() -> None:
    sample = {
        "name": "Rokt",
        "jobs": [
            {
                "title": "Senior Machine Learning Engineer",
                "shortcode": "ROKT123",
                "employment_type": "Full-time",
                "telecommuting": False,
                "department": "Engineering",
                "url": "https://apply.workable.com/j/ROKT123",
                "published_on": "2026-08-15T00:00:00Z",
                "country": "Australia",
                "city": "Sydney",
                "state": "NSW",
            }
        ],
    }
    payload = json.dumps(sample).encode("utf-8")
    postings = parse_workable_postings(payload)

    assert len(postings) == 1
    p = postings[0]
    assert p.external_id == "ROKT123"
    assert p.title == "Senior Machine Learning Engineer"
    assert p.department == "Engineering"
    assert p.location_text == "Sydney, NSW, Australia"
    assert p.remote_type_raw == "onsite"
    assert p.employment_type_raw == "Full-time"
    assert p.source_url == "https://apply.workable.com/j/ROKT123"
    assert p.posted_at is not None
    assert p.posted_at.year == 2026


def test_parse_workable_postings_telecommuting_is_remote() -> None:
    sample = {
        "jobs": [
            {
                "title": "Remote Backend Engineer",
                "shortcode": "REMOTE1",
                "telecommuting": True,
            }
        ]
    }
    payload = json.dumps(sample).encode("utf-8")
    postings = parse_workable_postings(payload)
    assert postings[0].remote_type_raw == "remote"


def test_parse_workable_postings_rejects_missing_jobs() -> None:
    with pytest.raises(WorkableParseError, match="jobs"):
        parse_workable_postings(b"{}")


def test_parse_workable_postings_rejects_invalid_json() -> None:
    with pytest.raises(WorkableParseError, match="not valid JSON"):
        parse_workable_postings(b"not json")
