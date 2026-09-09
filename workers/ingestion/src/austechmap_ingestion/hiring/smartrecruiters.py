"""SmartRecruiters ATS adapter (Phase 8). Response shape verified against the
real, live public API for a real cohort company (Canva, company 'canva'),
not assumed: `GET https://api.smartrecruiters.com/v1/companies/{company}/postings`
returns `{"totalFound": N, "content": [...]}`; each posting has `id`, `name`,
`releasedDate`, `location` (`city`, `region`, `country`, `remote`, `hybrid`),
`department` or `function` (`label`), `typeOfEmployment` (`label`), and
`ref` (`https://api.smartrecruiters.com/v1/companies/{company}/postings/{id}`).
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import datetime
from typing import Any

from austechmap_ingestion.fetch_safety import SafeFetchResult, safe_fetch
from austechmap_ingestion.hiring.types import RawJobPosting

SMARTRECRUITERS_HOST = "api.smartrecruiters.com"
_SMARTRECRUITERS_ALLOWED_HOSTS = frozenset({SMARTRECRUITERS_HOST})
_PAGE_LIMIT = 100


class SmartRecruitersParseError(Exception):
    """Raised for a malformed SmartRecruiters postings response."""


def _parse_posting(record: dict[str, Any], company_identifier: str) -> RawJobPosting:
    external_id = record.get("id")
    title = record.get("name")
    if not external_id or not title:
        raise SmartRecruitersParseError(f"posting missing id/name: {record!r}")

    location = record.get("location") or {}
    city = location.get("city")
    region = location.get("region")
    country = location.get("country")
    loc_parts = [p for p in (city, region, country) if p]
    location_text = ", ".join(loc_parts) if loc_parts else location.get("fullLocation")

    remote_flag = location.get("remote") is True
    hybrid_flag = location.get("hybrid") is True
    if remote_flag:
        remote_type_raw = "remote"
    elif hybrid_flag:
        remote_type_raw = "hybrid"
    else:
        remote_type_raw = "onsite"

    employment_type_obj = record.get("typeOfEmployment") or {}
    employment_type_raw = (
        employment_type_obj.get("label")
        if isinstance(employment_type_obj, dict)
        else str(employment_type_obj)
    )

    department_obj = record.get("department") or {}
    function_obj = record.get("function") or {}
    department = (
        department_obj.get("label")
        if isinstance(department_obj, dict) and department_obj.get("label")
        else function_obj.get("label") if isinstance(function_obj, dict) else None
    )

    released_date = record.get("releasedDate")
    posted_at = (
        datetime.fromisoformat(released_date.replace("Z", "+00:00"))
        if released_date
        else None
    )

    # SmartRecruiters candidate portal public URL
    company_slug = (
        record.get("company", {}).get("identifier") or company_identifier
    )
    source_url = f"https://jobs.smartrecruiters.com/{company_slug}/{external_id}"

    return RawJobPosting(
        external_id=str(external_id),
        title=str(title),
        department=department,
        team=None,
        location_text=location_text,
        employment_type_raw=employment_type_raw,
        remote_type_raw=remote_type_raw,
        country=country,
        posted_at=posted_at,
        source_url=source_url,
        apply_url=None,
        description_html=None,
        description_text=None,
        raw=record,
    )


def parse_smartrecruiters_postings(
    payload: bytes, company_identifier: str = ""
) -> list[RawJobPosting]:
    try:
        data = json.loads(payload)
    except json.JSONDecodeError as error:
        raise SmartRecruitersParseError(
            f"response was not valid JSON: {error}"
        ) from error
    if not isinstance(data, dict) or "content" not in data:
        raise SmartRecruitersParseError(
            f"expected an object with a 'content' array, got {data!r}"
        )
    return [
        _parse_posting(record, company_identifier)
        for record in data["content"]
        if record.get("visibility") == "PUBLIC" or "visibility" not in record
    ]


def fetch_smartrecruiters_postings(
    company: str, *, fetch_fn: Callable[..., SafeFetchResult] = safe_fetch
) -> tuple[bytes, list[RawJobPosting]]:
    """Fetches all postings from SmartRecruiters, paginating if needed.
    Returns (combined_raw_bytes, parsed_postings)."""
    offset = 0
    all_content: list[dict[str, Any]] = []
    total_found = None

    while True:
        url = (
            f"https://{SMARTRECRUITERS_HOST}/v1/companies/{company}/postings"
            f"?limit={_PAGE_LIMIT}&offset={offset}"
        )
        result = fetch_fn(url, allowed_hosts=_SMARTRECRUITERS_ALLOWED_HOSTS)
        try:
            page_data = json.loads(result.content)
        except json.JSONDecodeError as error:
            raise SmartRecruitersParseError(
                f"page at offset {offset} not valid JSON: {error}"
            ) from error

        content = page_data.get("content", [])
        if total_found is None:
            total_found = page_data.get("totalFound", len(content))

        all_content.extend(content)
        offset += len(content)

        if not content or offset >= total_found:
            break

    combined_data = {
        "totalFound": len(all_content),
        "content": all_content,
    }
    combined_bytes = json.dumps(combined_data, separators=(",", ":")).encode(
        "utf-8"
    )
    return combined_bytes, parse_smartrecruiters_postings(
        combined_bytes, company
    )
