from __future__ import annotations

import json

import pytest

from austechmap_ingestion.fetch_safety import SafeFetchResult
from austechmap_ingestion.hiring.pinpoint import (
    PinpointParseError,
    fetch_pinpoint_postings,
    parse_pinpoint_postings,
)


def test_parse_pinpoint_postings_valid() -> None:
    payload = json.dumps(
        {
            "data": [
                {
                    "id": "559663",
                    "title": "Senior Platform Engineer",
                    "url": "https://careers.example.pinpointhq.com/en/postings/role-1",
                    "application_form_url": "https://careers.example.pinpointhq.com/apply/role-1",
                    "description": "<p>Build systems.</p>",
                    "employment_type": "full_time",
                    "employment_type_text": "Full Time",
                    "workplace_type": "hybrid",
                    "published_at": "2026-09-10T01:02:03Z",
                    "location": {
                        "name": "Sydney",
                        "city": "Sydney",
                        "province": "NSW",
                        "country": "Australia",
                    },
                    "job": {"department": {"id": "9", "name": "Engineering"}},
                }
            ]
        }
    ).encode()

    postings = parse_pinpoint_postings(payload)

    assert len(postings) == 1
    posting = postings[0]
    assert posting.external_id == "559663"
    assert posting.title == "Senior Platform Engineer"
    assert posting.department == "Engineering"
    assert posting.location_text == "Sydney, NSW"
    assert posting.country == "Australia"
    assert posting.employment_type_raw == "Full Time"
    assert posting.remote_type_raw == "hybrid"
    assert posting.apply_url == "https://careers.example.pinpointhq.com/apply/role-1"
    assert posting.description_html == "<p>Build systems.</p>"
    assert posting.posted_at is not None
    assert posting.posted_at.year == 2026


@pytest.mark.parametrize(
    ("workplace_type", "expected"),
    [("remote", "remote"), ("on_site", "onsite"), ("unknown", None)],
)
def test_parse_pinpoint_postings_normalises_workplace_type(
    workplace_type: str, expected: str | None
) -> None:
    postings = parse_pinpoint_postings(
        json.dumps(
            {
                "data": [
                    {
                        "id": 1,
                        "title": "Engineer",
                        "url": "https://example.pinpointhq.com/posting/1",
                        "workplace_type": workplace_type,
                    }
                ]
            }
        ).encode()
    )

    assert postings[0].remote_type_raw == expected


def test_parse_pinpoint_postings_rejects_invalid_payloads() -> None:
    with pytest.raises(PinpointParseError, match="data"):
        parse_pinpoint_postings(b"{}")
    with pytest.raises(PinpointParseError, match="not valid JSON"):
        parse_pinpoint_postings(b"not json")
    with pytest.raises(PinpointParseError, match="id/title/url"):
        parse_pinpoint_postings(json.dumps({"data": [{"id": "missing"}]}).encode())


def test_fetch_pinpoint_postings_uses_public_feed() -> None:
    observed: dict[str, object] = {}

    def fake_fetch(
        url: str, *, allowed_hosts: frozenset[str], headers: dict[str, str]
    ) -> SafeFetchResult:
        observed["url"] = url
        observed["allowed_hosts"] = allowed_hosts
        observed["headers"] = headers
        return SafeFetchResult(url, 200, b'{"data": []}', "application/json")

    raw, postings = fetch_pinpoint_postings("workwithus", fetch_fn=fake_fetch)

    assert raw == b'{"data": []}'
    assert postings == []
    assert observed == {
        "url": "https://workwithus.pinpointhq.com/postings.json",
        "allowed_hosts": frozenset({"workwithus.pinpointhq.com"}),
        "headers": {
            "Accept": "application/json",
            "User-Agent": "AusTechMapBot/1.0 (+https://github.com/jeevanshah/AusTechMap)",
        },
    }


def test_fetch_pinpoint_postings_rejects_unsafe_company_identifier() -> None:
    with pytest.raises(ValueError, match="invalid Pinpoint company identifier"):
        fetch_pinpoint_postings("workwithus.evil")
