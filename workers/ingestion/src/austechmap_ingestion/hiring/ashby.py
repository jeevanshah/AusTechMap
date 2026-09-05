"""Ashby ATS adapter (Phase 5). Response shape verified against the real,
live public API for a real cohort company (Dovetail, board 'dovetail'),
not assumed: `GET https://api.ashbyhq.com/posting-api/job-board/{board}`
returns `{"jobs": [...], "apiVersion": "1"}`; each job has `id`, `title`,
`department`, `team`, `employmentType`, `location`, `workplaceType`
("Hybrid"/"Remote"/"OnSite" confirmed live, matched case-insensitively),
`publishedAt` (ISO 8601), `isListed`, `jobUrl`, `applyUrl`,
`descriptionPlain`.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime
from typing import Any

from austechmap_ingestion.fetch_safety import SafeFetchResult, safe_fetch
from austechmap_ingestion.hiring.types import RawJobPosting

ASHBY_HOST = "api.ashbyhq.com"
_ASHBY_ALLOWED_HOSTS = frozenset({ASHBY_HOST})
_SUPPORTED_API_VERSION = "1"


class AshbyParseError(Exception):
    """Raised for a malformed Ashby postings response, including an
    unrecognised apiVersion -- hard-failing on a future shape change is
    deliberate, not a missing feature: silently mis-parsing a changed
    response would be worse than an explicit, visible failure."""


def _parse_posting(record: dict[str, Any]) -> RawJobPosting:
    external_id = record.get("id")
    title = record.get("title")
    job_url = record.get("jobUrl")
    if not external_id or not title or not job_url:
        raise AshbyParseError(f"posting missing id/title/jobUrl: {record!r}")

    published_at = record.get("publishedAt")
    posted_at = (
        datetime.fromisoformat(published_at.replace("Z", "+00:00")) if published_at else None
    )

    return RawJobPosting(
        external_id=str(external_id),
        title=str(title),
        department=record.get("department"),
        team=record.get("team"),
        location_text=record.get("location"),
        employment_type_raw=record.get("employmentType"),
        remote_type_raw=record.get("workplaceType"),
        country=None,
        posted_at=posted_at,
        source_url=str(job_url),
        apply_url=record.get("applyUrl"),
        description_html=record.get("descriptionHtml"),
        description_text=record.get("descriptionPlain"),
        raw=record,
    )


def parse_ashby_postings(payload: bytes) -> list[RawJobPosting]:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as error:
        raise AshbyParseError(f"response was not valid JSON: {error}") from error
    if not isinstance(data, dict) or "jobs" not in data:
        raise AshbyParseError(f"expected an object with a 'jobs' array, got {data!r}")
    api_version = data.get("apiVersion")
    if api_version != _SUPPORTED_API_VERSION:
        raise AshbyParseError(
            f"unsupported apiVersion {api_version!r}, expected {_SUPPORTED_API_VERSION!r}"
        )
    return [
        _parse_posting(record)
        for record in data["jobs"]
        if record.get("isListed", True)
    ]


def fetch_ashby_postings(
    board: str, *, fetch_fn: Callable[..., SafeFetchResult] = safe_fetch
) -> tuple[bytes, list[RawJobPosting]]:
    """Returns (raw_bytes, parsed_postings). Raw bytes must be snapshotted
    before parsing, per PRODUCT_SPEC.md §7.3's pipeline stage order."""
    result = fetch_fn(
        f"https://{ASHBY_HOST}/posting-api/job-board/{board}",
        allowed_hosts=_ASHBY_ALLOWED_HOSTS,
    )
    return result.content, parse_ashby_postings(result.content)
