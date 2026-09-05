from __future__ import annotations

import json
from pathlib import Path

import pytest

from austechmap_ingestion.hiring.lever import LeverParseError, parse_lever_postings

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "lever_immutable_postings.json"


def test_parse_lever_postings_reads_the_real_recorded_fixture() -> None:
    payload = FIXTURE_PATH.read_bytes()
    postings = parse_lever_postings(payload)

    assert len(postings) == 7
    first = next(p for p in postings if p.external_id == "520a5e9a-ad1a-4a1b-b9f9-0e98f9b26b7f")
    assert first.title == "Chief of Staff, CCO"
    assert first.department == "Go to Market"
    assert first.team == "GTM | Leadership"
    assert first.location_text == "Sydney"
    assert first.employment_type_raw == "Full Time Permanent"
    assert first.remote_type_raw == "hybrid"
    assert first.country == "AU"
    assert first.source_url == "https://jobs.lever.co/immutable/520a5e9a-ad1a-4a1b-b9f9-0e98f9b26b7f"
    assert first.posted_at is not None
    assert first.posted_at.tzinfo is not None


def test_parse_lever_postings_rejects_a_non_array_payload() -> None:
    with pytest.raises(LeverParseError, match="bare JSON array"):
        parse_lever_postings(json.dumps({"not": "an array"}).encode())


def test_parse_lever_postings_rejects_invalid_json() -> None:
    with pytest.raises(LeverParseError, match="not valid JSON"):
        parse_lever_postings(b"not json at all")


def test_parse_lever_postings_rejects_a_posting_missing_required_fields() -> None:
    with pytest.raises(LeverParseError, match="missing id/text/hostedUrl"):
        parse_lever_postings(json.dumps([{"id": "abc"}]).encode())
