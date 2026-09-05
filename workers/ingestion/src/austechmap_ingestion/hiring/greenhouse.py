"""Greenhouse ATS adapter (Phase 5). Response shape verified against the
real, live public API for a real cohort company (Culture Amp, board
'cultureamp'), not assumed: `GET https://boards-api.greenhouse.io/v1/
boards/{board}/jobs?content=true` returns `{"jobs": [...], "meta": {...}}`;
each job has `id`, `title`, `absolute_url`, `location` (`{"name": ...}`),
`departments` (array of `{"id", "name", "child_ids", "parent_id"}`),
`first_published` (ISO 8601), and `content` (an HTML description).

Unlike Lever/Ashby, Greenhouse's public API has no separate plain-text
description field and no employment-type/remote-type field at all --
description_text/employment_type_raw/remote_type_raw stay None here
rather than guessed from stripped HTML or a location name.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime
from typing import Any

from austechmap_ingestion.fetch_safety import SafeFetchResult, safe_fetch
from austechmap_ingestion.hiring.types import RawJobPosting

GREENHOUSE_HOST = "boards-api.greenhouse.io"
_GREENHOUSE_ALLOWED_HOSTS = frozenset({GREENHOUSE_HOST})


class GreenhouseParseError(Exception):
    """Raised for a malformed Greenhouse postings response."""


def _parse_posting(record: dict[str, Any]) -> RawJobPosting:
    external_id = record.get("id")
    title = record.get("title")
    absolute_url = record.get("absolute_url")
    if not external_id or not title or not absolute_url:
        raise GreenhouseParseError(f"posting missing id/title/absolute_url: {record!r}")

    departments = record.get("departments") or []
    department = departments[0].get("name") if departments else None
    location = record.get("location") or {}

    first_published = record.get("first_published")
    posted_at = (
        datetime.fromisoformat(first_published.replace("Z", "+00:00"))
        if first_published
        else None
    )

    return RawJobPosting(
        external_id=str(external_id),
        title=str(title),
        department=department,
        team=None,
        location_text=location.get("name"),
        employment_type_raw=None,
        remote_type_raw=None,
        country=None,
        posted_at=posted_at,
        source_url=str(absolute_url),
        apply_url=None,
        description_html=record.get("content"),
        description_text=None,
        raw=record,
    )


def parse_greenhouse_postings(payload: bytes) -> list[RawJobPosting]:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as error:
        raise GreenhouseParseError(f"response was not valid JSON: {error}") from error
    if not isinstance(data, dict) or "jobs" not in data:
        raise GreenhouseParseError(f"expected an object with a 'jobs' array, got {data!r}")
    return [_parse_posting(record) for record in data["jobs"]]


def fetch_greenhouse_postings(
    board: str, *, fetch_fn: Callable[..., SafeFetchResult] = safe_fetch
) -> tuple[bytes, list[RawJobPosting]]:
    """Returns (raw_bytes, parsed_postings). Raw bytes must be snapshotted
    before parsing, per PRODUCT_SPEC.md §7.3's pipeline stage order."""
    result = fetch_fn(
        f"https://{GREENHOUSE_HOST}/v1/boards/{board}/jobs?content=true",
        allowed_hosts=_GREENHOUSE_ALLOWED_HOSTS,
    )
    return result.content, parse_greenhouse_postings(result.content)
