from __future__ import annotations

from collections.abc import Callable, Mapping
from pathlib import Path

import pytest

from austechmap_ingestion.fetch_safety import SafeFetchResult
from austechmap_ingestion.hiring.static_careers import (
    HostRateLimiter,
    RobotsDisallowedError,
    StaticCareersFetchError,
    StaticCareersPage,
    StaticCareersParseError,
    fetch_static_careers_page,
    parse_static_careers_page,
    parse_static_job_postings,
)

_FIXTURES = Path(__file__).parent / "fixtures"
_CAREERS_URL = "https://careers.example.test/jobs"


def test_parse_static_careers_page_extracts_json_ld_and_role_links() -> None:
    result = parse_static_careers_page(
        (_FIXTURES / "static_careers_structured.html").read_bytes(), page_url=_CAREERS_URL
    )

    assert result.requires_browser is False
    assert result.job_postings[0].title == "Senior Platform Engineer"
    assert result.job_postings[0].employment_types == ("FULL_TIME", "PERMANENT")
    assert result.job_postings[0].locations == ("1 Example Street, Sydney, NSW, 2000, AU",)
    assert len(result.role_links) == 2


def test_parse_static_careers_page_discovers_only_safe_role_links() -> None:
    result = parse_static_careers_page(
        (_FIXTURES / "static_careers_structured.html").read_bytes(), page_url=_CAREERS_URL
    )

    assert [(link.title, link.url) for link in result.role_links] == [
        ("Senior Platform Engineer", "https://careers.example.test/jobs/platform-engineer"),
        ("Apply for Staff Data Engineer", "https://apply.example-ats.test/role/123"),
    ]


def test_parse_static_careers_page_marks_empty_browser_shell_for_fallback() -> None:
    result = parse_static_careers_page(
        (_FIXTURES / "static_careers_browser_shell.html").read_bytes(), page_url=_CAREERS_URL
    )

    assert result.job_postings == ()
    assert result.role_links == ()
    assert result.requires_browser is True


def test_parse_static_careers_page_ignores_invalid_json_ld() -> None:
    result = parse_static_careers_page(
        b'<script type="application/ld+json">{not valid}</script>', page_url=_CAREERS_URL
    )

    assert result.job_postings == ()
    assert result.role_links == ()
    assert result.requires_browser is False


def test_parse_static_job_postings_uses_stable_job_urls_only() -> None:
    content = (_FIXTURES / "static_careers_structured.html").read_bytes()
    page = StaticCareersPage(
        requested_url=_CAREERS_URL,
        final_url=_CAREERS_URL,
        content=content,
        content_type="text/html",
        parse_result=parse_static_careers_page(content, page_url=_CAREERS_URL),
    )

    postings = parse_static_job_postings(page)

    assert len(postings) == 1
    assert postings[0].title == "Senior Platform Engineer"
    assert postings[0].source_url == "https://careers.example.test/jobs/platform-engineer"
    assert postings[0].external_id == (
        "e81a3f0a4f11447e42d18a7e30f3f9c537bdae2ed35f830634348b7ac5affe1f"
    )
    assert postings[0].posted_at is not None
    assert postings[0].employment_type_raw == "FULL_TIME, PERMANENT"


def test_parse_static_job_postings_rejects_link_only_page() -> None:
    content = b'<a href="/jobs/123">Senior Engineer</a>'
    page = StaticCareersPage(
        requested_url=_CAREERS_URL,
        final_url=_CAREERS_URL,
        content=content,
        content_type="text/html",
        parse_result=parse_static_careers_page(content, page_url=_CAREERS_URL),
    )

    with pytest.raises(StaticCareersParseError, match="JSON-LD JobPosting"):
        parse_static_job_postings(page)


class _FakeFetcher:
    def __init__(self, responses: list[SafeFetchResult]) -> None:
        self._responses = iter(responses)
        self.calls: list[tuple[str, frozenset[str], Mapping[str, str]]] = []

    def __call__(
        self,
        url: str,
        *,
        allowed_hosts: frozenset[str],
        headers: Mapping[str, str],
        redirect_validator: Callable[[str], None] | None = None,
    ) -> SafeFetchResult:
        self.calls.append((url, allowed_hosts, headers))
        return next(self._responses)


def _result(status: int, content: bytes, content_type: str = "text/html") -> SafeFetchResult:
    return SafeFetchResult(
        final_url=_CAREERS_URL,
        status_code=status,
        content=content,
        content_type=content_type,
    )


def _no_wait_limiter() -> HostRateLimiter:
    return HostRateLimiter(min_interval_seconds=0.001, clock=lambda: 1.0, sleep=lambda _: None)


def test_fetch_static_careers_page_fetches_robots_first_with_identifying_headers() -> None:
    fetcher = _FakeFetcher(
        [
            _result(200, b"User-agent: *\nDisallow: /private\n", "text/plain"),
            _result(200, (_FIXTURES / "static_careers_structured.html").read_bytes()),
        ]
    )

    page = fetch_static_careers_page(_CAREERS_URL, fetcher=fetcher, rate_limiter=_no_wait_limiter())

    assert page.parse_result.job_postings[0].title == "Senior Platform Engineer"
    assert [call[0] for call in fetcher.calls] == [
        "https://careers.example.test/robots.txt",
        _CAREERS_URL,
    ]
    assert fetcher.calls[0][1] == frozenset({"careers.example.test"})
    assert "AusTechMapBot/1.0" in fetcher.calls[0][2]["User-Agent"]


def test_fetch_static_careers_page_allows_missing_robots_txt() -> None:
    fetcher = _FakeFetcher(
        [
            _result(404, b"not found", "text/plain"),
            _result(200, (_FIXTURES / "static_careers_structured.html").read_bytes()),
        ]
    )

    assert fetch_static_careers_page(_CAREERS_URL, fetcher=fetcher, rate_limiter=_no_wait_limiter())


def test_fetch_static_careers_page_does_not_fetch_disallowed_path() -> None:
    blocked_url = "https://careers.example.test/private/jobs"
    fetcher = _FakeFetcher([_result(200, b"User-agent: *\nDisallow: /private\n", "text/plain")])

    with pytest.raises(RobotsDisallowedError):
        fetch_static_careers_page(blocked_url, fetcher=fetcher, rate_limiter=_no_wait_limiter())

    assert len(fetcher.calls) == 1


def test_fetch_static_careers_page_checks_robots_before_redirect_target() -> None:
    fetcher = _FakeFetcher([_result(200, b"User-agent: *\nDisallow: /private\n", "text/plain")])

    def redirecting_fetcher(
        url: str,
        *,
        allowed_hosts: frozenset[str],
        headers: Mapping[str, str],
        redirect_validator: Callable[[str], None] | None = None,
    ) -> SafeFetchResult:
        if url.endswith("robots.txt"):
            return fetcher(url, allowed_hosts=allowed_hosts, headers=headers)
        assert redirect_validator is not None
        redirect_validator("https://careers.example.test/private/jobs")
        raise AssertionError("disallowed redirect must not be fetched")

    with pytest.raises(RobotsDisallowedError):
        fetch_static_careers_page(
            _CAREERS_URL,
            fetcher=redirecting_fetcher,
            rate_limiter=_no_wait_limiter(),
        )


def test_fetch_static_careers_page_rejects_non_html_response() -> None:
    fetcher = _FakeFetcher(
        [_result(404, b"not found", "text/plain"), _result(200, b"{}", "application/json")]
    )

    with pytest.raises(StaticCareersFetchError, match="not HTML"):
        fetch_static_careers_page(_CAREERS_URL, fetcher=fetcher, rate_limiter=_no_wait_limiter())


def test_rate_limiter_waits_between_requests_and_backs_off_after_429() -> None:
    now = [0.0]
    waits: list[float] = []

    def sleep(delay: float) -> None:
        waits.append(delay)
        now[0] += delay

    limiter = HostRateLimiter(
        min_interval_seconds=2.0,
        max_interval_seconds=8.0,
        clock=lambda: now[0],
        sleep=sleep,
    )
    limiter.acquire("example.test")
    limiter.record_response("example.test", 429)
    limiter.acquire("example.test")
    limiter.acquire("example.test")

    assert waits == [4.0, 4.0]
