"""Workable ATS adapter (Phase 8). Response shape verified against the
real, live public API for a real cohort company (Rokt, account 'rokt'),
not assumed: `GET https://apply.workable.com/api/v1/widget/accounts/{account}`
returns `{"name": "...", "jobs": [...]}`; each job has `title`, `shortcode`,
`employment_type`, `telecommuting` (boolean), `department`, `url`,
`published_on`, `created_at`, `city`, `state`, `country`.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime
from typing import Any

from austechmap_ingestion.fetch_safety import SafeFetchResult, safe_fetch
from austechmap_ingestion.hiring.types import RawJobPosting

WORKABLE_HOST = "apply.workable.com"
_WORKABLE_ALLOWED_HOSTS = frozenset({WORKABLE_HOST})


class WorkableParseError(Exception):
    """Raised for a malformed Workable postings response."""


def _parse_posting(record: dict[str, Any]) -> RawJobPosting:
    external_id = record.get("shortcode") or record.get("id")
    title = record.get("title")
    job_url = record.get("url") or record.get("shortlink")
    if not external_id or not title:
        raise WorkableParseError(f"posting missing shortcode/title: {record!r}")

    city = record.get("city")
    state = record.get("state")
    country = record.get("country")
    loc_parts = [p for p in (city, state, country) if p]
    location_text = ", ".join(loc_parts) if loc_parts else None

    is_remote = record.get("telecommuting") is True
    remote_type_raw = "remote" if is_remote else "onsite"

    published_on = record.get("published_on") or record.get("created_at")
    posted_at = None
    if published_on:
        try:
            posted_at = datetime.fromisoformat(
                published_on.replace("Z", "+00:00")
            )
        except ValueError:
            pass

    return RawJobPosting(
        external_id=str(external_id),
        title=str(title),
        department=record.get("department"),
        team=None,
        location_text=location_text,
        employment_type_raw=record.get("employment_type"),
        remote_type_raw=remote_type_raw,
        country=country,
        posted_at=posted_at,
        source_url=str(job_url) if job_url else f"https://apply.workable.com/j/{external_id}",
        apply_url=record.get("application_url"),
        description_html=record.get("description"),
        description_text=None,
        raw=record,
    )


def parse_workable_postings(payload: bytes) -> list[RawJobPosting]:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as error:
        raise WorkableParseError(
            f"response was not valid JSON: {error}"
        ) from error
    if not isinstance(data, dict) or "jobs" not in data:
        raise WorkableParseError(
            f"expected an object with a 'jobs' array, got {data!r}"
        )
    return [_parse_posting(record) for record in data["jobs"]]


def fetch_workable_postings(
    account: str, *, fetch_fn: Callable[..., SafeFetchResult] = safe_fetch
) -> tuple[bytes, list[RawJobPosting]]:
    """Returns (raw_bytes, parsed_postings). Raw bytes must be snapshotted
    before parsing, per PRODUCT_SPEC.md §7.3's pipeline stage order."""
    result = fetch_fn(
        f"https://{WORKABLE_HOST}/api/v1/widget/accounts/{account}",
        allowed_hosts=_WORKABLE_ALLOWED_HOSTS,
    )
    return result.content, parse_workable_postings(result.content)
