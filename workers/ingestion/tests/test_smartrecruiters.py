from __future__ import annotations

import json

import pytest

from austechmap_ingestion.hiring.smartrecruiters import (
    SmartRecruitersParseError,
    parse_smartrecruiters_postings,
)


def test_parse_smartrecruiters_postings_valid() -> None:
    sample = {
        "totalFound": 1,
        "content": [
            {
                "id": "123456",
                "name": "Staff Frontend Engineer",
                "releasedDate": "2026-09-01T10:00:00.000Z",
                "location": {
                    "city": "Sydney",
                    "region": "NSW",
                    "country": "au",
                    "remote": False,
                    "hybrid": True,
                    "fullLocation": "Sydney, NSW, Australia",
                },
                "department": {"label": "Engineering"},
                "typeOfEmployment": {"label": "Full-time"},
                "visibility": "PUBLIC",
            }
        ],
    }
    payload = json.dumps(sample).encode("utf-8")
    postings = parse_smartrecruiters_postings(payload, company_identifier="canva")

    assert len(postings) == 1
    p = postings[0]
    assert p.external_id == "123456"
    assert p.title == "Staff Frontend Engineer"
    assert p.department == "Engineering"
    assert p.location_text == "Sydney, NSW, au"
    assert p.remote_type_raw == "hybrid"
    assert p.employment_type_raw == "Full-time"
    assert p.source_url == "https://jobs.smartrecruiters.com/canva/123456"
    assert p.posted_at is not None
    assert p.posted_at.year == 2026


def test_parse_smartrecruiters_postings_remote() -> None:
    sample = {
        "content": [
            {
                "id": "999",
                "name": "Remote Architect",
                "location": {
                    "city": "Brisbane",
                    "remote": True,
                    "hybrid": False,
                },
            }
        ]
    }
    payload = json.dumps(sample).encode("utf-8")
    postings = parse_smartrecruiters_postings(payload, company_identifier="canva")
    assert postings[0].remote_type_raw == "remote"


def test_parse_smartrecruiters_postings_rejects_missing_content() -> None:
    with pytest.raises(SmartRecruitersParseError, match="content"):
        parse_smartrecruiters_postings(b"{}")


def test_parse_smartrecruiters_postings_rejects_invalid_json() -> None:
    with pytest.raises(SmartRecruitersParseError, match="not valid JSON"):
        parse_smartrecruiters_postings(b"invalid json")
