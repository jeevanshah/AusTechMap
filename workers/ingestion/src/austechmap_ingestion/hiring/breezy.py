"""Breezy HR public-board adapter.

Response shape was verified against Stake's live public board on 10 September
2026: ``GET https://{company}.breezy.hr/json`` returns a JSON array of
published positions. Each position has ``id``, ``friendly_id``, ``name``,
``url``, ``published_date``, ``type``, ``location``, and ``department``.
The endpoint is public, read-only, and needs no Breezy account credential.
"""

from __future__ import annotations

import json
import re
from collections.abc import Callable
from contextlib import suppress
from datetime import datetime
from typing import Any

from austechmap_ingestion.fetch_safety import SafeFetchResult, safe_fetch
from austechmap_ingestion.hiring.types import RawJobPosting


class BreezyParseError(Exception):
    """Raised for a malformed Breezy public-board response."""


_COMPANY_IDENTIFIER_RE = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?")
_BREEZY_REQUEST_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "AusTechMapBot/1.0 (+https://github.com/jeevanshah/AusTechMap)",
}


def _string_or_none(value: object) -> str | None:
    return value if isinstance(value, str) and value.strip() else None


def _parse_posting(record: dict[str, Any]) -> RawJobPosting:
    external_id = _string_or_none(record.get("id"))
    title = _string_or_none(record.get("name"))
    source_url = _string_or_none(record.get("url"))
    if external_id is None or title is None or source_url is None:
        raise BreezyParseError(f"posting missing id/name/url: {record!r}")

    location = record.get("location")
    location = location if isinstance(location, dict) else {}
    country_value = location.get("country")
    country = (
        _string_or_none(country_value.get("name"))
        if isinstance(country_value, dict)
        else _string_or_none(country_value)
    )
    state_value = location.get("state")
    state = (
        _string_or_none(state_value.get("name"))
        if isinstance(state_value, dict)
        else _string_or_none(state_value)
    )
    city = _string_or_none(location.get("city"))
    location_text = ", ".join(part for part in (city, state, country) if part) or None

    type_value = record.get("type")
    employment_type_raw = (
        _string_or_none(type_value.get("name"))
        if isinstance(type_value, dict)
        else _string_or_none(type_value)
    )
    published_date = _string_or_none(record.get("published_date"))
    posted_at = None
    if published_date is not None:
        with suppress(ValueError):
            posted_at = datetime.fromisoformat(published_date.replace("Z", "+00:00"))

    return RawJobPosting(
        external_id=external_id,
        title=title,
        department=_string_or_none(record.get("department")),
        team=None,
        location_text=location_text,
        employment_type_raw=employment_type_raw,
        remote_type_raw=(
            "remote"
            if location.get("is_remote") is True
            else "onsite"
            if location.get("is_remote") is False
            else None
        ),
        country=country,
        posted_at=posted_at,
        source_url=source_url,
        apply_url=source_url,
        description_html=None,
        description_text=None,
        raw=record,
    )


def parse_breezy_postings(payload: bytes) -> list[RawJobPosting]:
    try:
        data = json.loads(payload)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise BreezyParseError(f"response was not valid JSON: {error}") from error
    if not isinstance(data, list):
        raise BreezyParseError(f"expected a bare JSON array, got {type(data).__name__}")
    if not all(isinstance(record, dict) for record in data):
        raise BreezyParseError("expected every Breezy posting to be an object")
    return [_parse_posting(record) for record in data]


def fetch_breezy_payload(
    company: str, *, fetch_fn: Callable[..., SafeFetchResult] = safe_fetch
) -> bytes:
    """Fetch a company's public Breezy board without parsing it."""
    if _COMPANY_IDENTIFIER_RE.fullmatch(company) is None:
        raise ValueError(f"invalid Breezy company identifier: {company!r}")
    host = f"{company}.breezy.hr"
    result = fetch_fn(
        f"https://{host}/json",
        allowed_hosts=frozenset({host}),
        headers=_BREEZY_REQUEST_HEADERS,
    )
    return result.content


def fetch_breezy_postings(
    company: str, *, fetch_fn: Callable[..., SafeFetchResult] = safe_fetch
) -> tuple[bytes, list[RawJobPosting]]:
    """Fetch and parse a company's public Breezy board.

    The ingestion pipeline uses :func:`fetch_breezy_payload` directly so it
    can store immutable raw bytes before parsing. This convenience function is
    retained for callers that only need parsed public-board data.
    """
    payload = fetch_breezy_payload(company, fetch_fn=fetch_fn)
    return payload, parse_breezy_postings(payload)
