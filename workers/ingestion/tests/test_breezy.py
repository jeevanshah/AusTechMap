from __future__ import annotations

import json

import pytest

from austechmap_ingestion.fetch_safety import SafeFetchResult
from austechmap_ingestion.hiring.breezy import (
    BreezyParseError,
    fetch_breezy_postings,
    parse_breezy_postings,
)


def test_parse_breezy_postings_valid() -> None:
    payload = json.dumps(
        [
            {
                "id": "2d6de1304dfa",
                "friendly_id": "2d6de1304dfa-customer-experience-analyst",
                "name": "Customer Experience Analyst",
                "url": "https://stake.breezy.hr/p/2d6de1304dfa-customer-experience-analyst",
                "published_date": "2026-08-27T03:32:18.398Z",
                "type": {"id": "fullTime", "name": "Full-Time"},
                "location": {
                    "country": {"name": "Australia", "id": "AU"},
                    "state": {"name": "New South Wales", "id": "NSW"},
                    "city": "Sydney",
                    "is_remote": False,
                },
                "department": "Customer Success",
            }
        ]
    ).encode()

    postings = parse_breezy_postings(payload)

    assert len(postings) == 1
    posting = postings[0]
    assert posting.external_id == "2d6de1304dfa"
    assert posting.title == "Customer Experience Analyst"
    assert posting.department == "Customer Success"
    assert posting.location_text == "Sydney, New South Wales, Australia"
    assert posting.remote_type_raw == "onsite"
    assert posting.employment_type_raw == "Full-Time"
    assert posting.source_url == "https://stake.breezy.hr/p/2d6de1304dfa-customer-experience-analyst"
    assert posting.apply_url == posting.source_url
    assert posting.posted_at is not None
    assert posting.posted_at.year == 2026


def test_parse_breezy_postings_marks_remote_location() -> None:
    payload = json.dumps(
        [
            {
                "id": "remote-1",
                "name": "Remote Platform Engineer",
                "url": "https://example.breezy.hr/p/remote-1",
                "location": {"is_remote": True},
            }
        ]
    ).encode()

    postings = parse_breezy_postings(payload)
    assert postings[0].remote_type_raw == "remote"


def test_parse_breezy_postings_rejects_non_array_payload() -> None:
    with pytest.raises(BreezyParseError, match="bare JSON array"):
        parse_breezy_postings(b"{}")


def test_parse_breezy_postings_rejects_invalid_json() -> None:
    with pytest.raises(BreezyParseError, match="not valid JSON"):
        parse_breezy_postings(b"not json")


def test_parse_breezy_postings_rejects_missing_required_fields() -> None:
    with pytest.raises(BreezyParseError, match="missing id/name/url"):
        parse_breezy_postings(json.dumps([{"id": "missing"}]).encode())


def test_fetch_breezy_postings_uses_company_public_json_feed() -> None:
    observed: dict[str, object] = {}

    def fake_fetch(url: str, *, allowed_hosts: frozenset[str]) -> SafeFetchResult:
        observed["url"] = url
        observed["allowed_hosts"] = allowed_hosts
        return SafeFetchResult(
            final_url=url,
            status_code=200,
            content=b"[]",
            content_type="application/json",
        )

    raw, postings = fetch_breezy_postings("stake", fetch_fn=fake_fetch)

    assert raw == b"[]"
    assert postings == []
    assert observed == {
        "url": "https://stake.breezy.hr/json",
        "allowed_hosts": frozenset({"stake.breezy.hr"}),
    }
