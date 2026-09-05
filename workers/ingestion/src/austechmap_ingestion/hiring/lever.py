"""Lever ATS adapter (Phase 5). Response shape verified against the real,
live public API for a real cohort company (Immutable, site 'immutable'),
not assumed: `GET https://api.lever.co/v0/postings/{site}?mode=json`
returns a bare JSON array; each entry has `id`, `text` (title),
`categories` (`commitment`/`department`/`location`/`team`/`allLocations`),
`country`, `workplaceType` ("hybrid"/"remote" confirmed live; "on-site" is
Lever's documented third state, handled defensively), `createdAt`
(milliseconds since epoch), `hostedUrl`, `applyUrl`, `descriptionPlain`.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from austechmap_ingestion.fetch_safety import SafeFetchResult, safe_fetch
from austechmap_ingestion.hiring.types import RawJobPosting

LEVER_HOST = "api.lever.co"
_LEVER_ALLOWED_HOSTS = frozenset({LEVER_HOST})


class LeverParseError(Exception):
    """Raised for a malformed Lever postings response."""


def _parse_posting(record: dict[str, Any]) -> RawJobPosting:
    external_id = record.get("id")
    title = record.get("text")
    hosted_url = record.get("hostedUrl")
    if not external_id or not title or not hosted_url:
        raise LeverParseError(f"posting missing id/text/hostedUrl: {record!r}")

    categories = record.get("categories") or {}
    created_at_ms = record.get("createdAt")
    posted_at = (
        datetime.fromtimestamp(created_at_ms / 1000, tz=UTC) if created_at_ms is not None else None
    )

    return RawJobPosting(
        external_id=str(external_id),
        title=str(title),
        department=categories.get("department"),
        team=categories.get("team"),
        location_text=categories.get("location"),
        employment_type_raw=categories.get("commitment"),
        remote_type_raw=record.get("workplaceType"),
        country=record.get("country"),
        posted_at=posted_at,
        source_url=str(hosted_url),
        apply_url=record.get("applyUrl"),
        description_html=record.get("description"),
        description_text=record.get("descriptionPlain"),
        raw=record,
    )


def parse_lever_postings(payload: bytes) -> list[RawJobPosting]:
    try:
        records = json.loads(payload)
    except json.JSONDecodeError as error:
        raise LeverParseError(f"response was not valid JSON: {error}") from error
    if not isinstance(records, list):
        raise LeverParseError(f"expected a bare JSON array, got {type(records).__name__}")
    return [_parse_posting(record) for record in records]


def fetch_lever_postings(
    site: str, *, fetch_fn: Callable[..., SafeFetchResult] = safe_fetch
) -> tuple[bytes, list[RawJobPosting]]:
    """Returns (raw_bytes, parsed_postings). Raw bytes must be snapshotted
    before parsing, per PRODUCT_SPEC.md §7.3's pipeline stage order."""
    result = fetch_fn(
        f"https://{LEVER_HOST}/v0/postings/{site}?mode=json",
        allowed_hosts=_LEVER_ALLOWED_HOSTS,
    )
    return result.content, parse_lever_postings(result.content)
