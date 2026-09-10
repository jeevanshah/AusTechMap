"""Pinpoint public job-postings feed adapter.

Pinpoint documents the unauthenticated, public endpoint as
``https://{company-subdomain}.pinpointhq.com/postings.json``.  It is the
public careers-site feed, not Pinpoint's credentialed management API.
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


class PinpointParseError(Exception):
    """Raised for a malformed Pinpoint public postings response."""


_COMPANY_IDENTIFIER_RE = re.compile(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?")
_PINPOINT_REQUEST_HEADERS = {
    "Accept": "application/json",
    "User-Agent": "AusTechMapBot/1.0 (+https://github.com/jeevanshah/AusTechMap)",
}
_WORKPLACE_TYPE_MAP = {
    "remote": "remote",
    "hybrid": "hybrid",
    "onsite": "onsite",
    "on_site": "onsite",
    "on-site": "onsite",
}


def _string_or_none(value: object) -> str | None:
    return value if isinstance(value, str) and value.strip() else None


def _location_text(location: object) -> str | None:
    if not isinstance(location, dict):
        return None
    parts: list[str] = []
    for key in ("name", "city", "province"):
        value = _string_or_none(location.get(key))
        if value is not None and value not in parts:
            parts.append(value)
    return ", ".join(parts) or None


def _department(record: dict[str, Any]) -> str | None:
    job = record.get("job")
    if not isinstance(job, dict):
        return None
    department = job.get("department")
    return _string_or_none(department.get("name")) if isinstance(department, dict) else None


def _parse_posting(record: dict[str, Any]) -> RawJobPosting:
    external_id = record.get("id")
    title = _string_or_none(record.get("title"))
    source_url = _string_or_none(record.get("url"))
    if external_id is None or title is None or source_url is None:
        raise PinpointParseError(f"posting missing id/title/url: {record!r}")

    posted_at = None
    timestamp = _string_or_none(record.get("published_at")) or _string_or_none(
        record.get("created_at")
    )
    if timestamp is not None:
        with suppress(ValueError):
            posted_at = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))

    workplace_type = _string_or_none(record.get("workplace_type"))
    remote_type_raw = (
        _WORKPLACE_TYPE_MAP.get(workplace_type.lower()) if workplace_type is not None else None
    )
    location = record.get("location")
    country = _string_or_none(location.get("country")) if isinstance(location, dict) else None

    return RawJobPosting(
        external_id=str(external_id),
        title=title,
        department=_department(record),
        team=None,
        location_text=_location_text(location),
        employment_type_raw=_string_or_none(record.get("employment_type_text"))
        or _string_or_none(record.get("employment_type")),
        remote_type_raw=remote_type_raw,
        country=country,
        posted_at=posted_at,
        source_url=source_url,
        apply_url=_string_or_none(record.get("application_form_url")) or source_url,
        description_html=_string_or_none(record.get("description")),
        description_text=None,
        raw=record,
    )


def parse_pinpoint_postings(payload: bytes) -> list[RawJobPosting]:
    try:
        data = json.loads(payload)
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise PinpointParseError(f"response was not valid JSON: {error}") from error
    if not isinstance(data, dict) or not isinstance(data.get("data"), list):
        raise PinpointParseError("expected an object with a 'data' array")
    records = data["data"]
    if not all(isinstance(record, dict) for record in records):
        raise PinpointParseError("expected every Pinpoint posting to be an object")
    return [_parse_posting(record) for record in records]


def fetch_pinpoint_payload(
    company: str, *, fetch_fn: Callable[..., SafeFetchResult] = safe_fetch
) -> bytes:
    """Fetch a Pinpoint public postings feed without parsing it."""
    if _COMPANY_IDENTIFIER_RE.fullmatch(company) is None:
        raise ValueError(f"invalid Pinpoint company identifier: {company!r}")
    host = f"{company}.pinpointhq.com"
    result = fetch_fn(
        f"https://{host}/postings.json",
        allowed_hosts=frozenset({host}),
        headers=_PINPOINT_REQUEST_HEADERS,
    )
    return result.content


def fetch_pinpoint_postings(
    company: str, *, fetch_fn: Callable[..., SafeFetchResult] = safe_fetch
) -> tuple[bytes, list[RawJobPosting]]:
    """Fetch and parse a company's Pinpoint public postings feed."""
    payload = fetch_pinpoint_payload(company, fetch_fn=fetch_fn)
    return payload, parse_pinpoint_postings(payload)
