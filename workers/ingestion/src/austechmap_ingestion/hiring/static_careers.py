"""Polite, deterministic extraction from static employer careers pages.

This module is intentionally a discovery layer, not an unreviewed job importer.
It only fetches a registered careers URL, honours that host's ``robots.txt``,
uses the project's SSRF-safe fetcher, and returns structured JobPosting data or
candidate role links for the source-operations layer to validate and persist.
Pages with no server-rendered job evidence are flagged for the later Playwright
fallback; they are never guessed from script payloads.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass, field
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.robotparser import RobotFileParser

from selectolax.lexbor import LexborHTMLParser

from austechmap_ingestion.fetch_safety import SafeFetchResult, safe_fetch

STATIC_CAREERS_USER_AGENT = "AusTechMapBot/1.0 (+https://github.com/jeevanshah/AusTechMap)"
_HTML_CONTENT_TYPES = frozenset({"text/html", "application/xhtml+xml"})
_RETRYABLE_STATUS_CODES = frozenset({429, 503})
_ROLE_PATH_TERMS = ("job", "career", "position", "role", "vacanc", "opening", "apply")
_ROLE_TEXT_TERMS = ("view job", "view role", "apply", "open role", "open position")


class StaticCareersError(Exception):
    """Base error for a rejected or failed static-careers operation."""


class InvalidCareersUrlError(StaticCareersError):
    """The registered careers URL cannot be fetched safely."""


class RobotsDisallowedError(StaticCareersError):
    """The site's robots policy excludes the configured crawler identity."""


class StaticCareersFetchError(StaticCareersError):
    """A careers or robots response cannot be used as a static HTML page."""


@dataclass(frozen=True)
class JsonLdJobPosting:
    title: str
    url: str | None
    date_posted: str | None
    employment_types: tuple[str, ...]
    locations: tuple[str, ...]


@dataclass(frozen=True)
class RoleLink:
    title: str
    url: str


@dataclass(frozen=True)
class StaticCareersParseResult:
    job_postings: tuple[JsonLdJobPosting, ...]
    role_links: tuple[RoleLink, ...]
    requires_browser: bool


@dataclass(frozen=True)
class StaticCareersPage:
    requested_url: str
    final_url: str
    parse_result: StaticCareersParseResult


@dataclass
class HostRateLimiter:
    """In-process per-host limiter with conservative adaptive backoff.

    A database-backed scheduler remains responsible for coordinating workers.
    This guard prevents a single worker from bursting a host while it processes
    multiple registered sources, and doubles its delay after 429/503 responses.
    """

    min_interval_seconds: float = 2.0
    max_interval_seconds: float = 60.0
    clock: Callable[[], float] = time.monotonic
    sleep: Callable[[float], None] = time.sleep
    _intervals: dict[str, float] = field(default_factory=dict, init=False)
    _next_allowed: dict[str, float] = field(default_factory=dict, init=False)

    def __post_init__(self) -> None:
        if self.min_interval_seconds <= 0:
            raise ValueError("min_interval_seconds must be positive")
        if self.max_interval_seconds < self.min_interval_seconds:
            raise ValueError("max_interval_seconds must be at least min_interval_seconds")

    def acquire(self, hostname: str) -> None:
        now = self.clock()
        delay = max(0.0, self._next_allowed.get(hostname, now) - now)
        if delay:
            self.sleep(delay)
            now = self.clock()
        interval = self._intervals.get(hostname, self.min_interval_seconds)
        self._next_allowed[hostname] = now + interval

    def record_response(self, hostname: str, status_code: int) -> None:
        current = self._intervals.get(hostname, self.min_interval_seconds)
        if status_code in _RETRYABLE_STATUS_CODES:
            interval = min(self.max_interval_seconds, current * 2)
            self._intervals[hostname] = interval
            now = self.clock()
            self._next_allowed[hostname] = max(
                self._next_allowed.get(hostname, now), now + interval
            )
        elif 200 <= status_code < 400:
            self._intervals[hostname] = self.min_interval_seconds


SafeFetcher = Callable[..., SafeFetchResult]


def _hostname_for_url(url: str) -> str:
    parts = urlsplit(url)
    if parts.scheme not in {"http", "https"} or not parts.hostname:
        raise InvalidCareersUrlError("careers URL must be an absolute http or https URL")
    if parts.username is not None or parts.password is not None:
        raise InvalidCareersUrlError("careers URL must not contain credentials")
    return parts.hostname.lower()


def _robots_url(careers_url: str) -> str:
    parts = urlsplit(careers_url)
    return urlunsplit((parts.scheme, parts.netloc, "/robots.txt", "", ""))


def _request_headers() -> Mapping[str, str]:
    return {
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
        "User-Agent": STATIC_CAREERS_USER_AGENT,
    }


def _robots_policy(result: SafeFetchResult) -> RobotFileParser | None:
    if result.status_code == 404:
        return None
    if not 200 <= result.status_code < 300:
        raise StaticCareersFetchError(f"robots.txt returned HTTP {result.status_code}")
    parser = RobotFileParser()
    parser.parse(result.content.decode("utf-8", errors="replace").splitlines())
    return parser


def _assert_robots_allows(policy: RobotFileParser | None, url: str) -> None:
    if policy is not None and not policy.can_fetch(STATIC_CAREERS_USER_AGENT, url):
        raise RobotsDisallowedError(f"robots.txt disallows {url}")


def _normalise_text(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    normalised = " ".join(value.split())
    return normalised or None


def _normalise_strings(value: object) -> tuple[str, ...]:
    candidates = value if isinstance(value, list) else [value]
    return tuple(text for item in candidates if (text := _normalise_text(item)) is not None)


def _location_names(value: object) -> tuple[str, ...]:
    locations = value if isinstance(value, list) else [value]
    names: list[str] = []
    for location in locations:
        if not isinstance(location, dict):
            continue
        address = location.get("address", location)
        if not isinstance(address, dict):
            continue
        parts = [
            _normalise_text(address.get(field))
            for field in (
                "streetAddress",
                "addressLocality",
                "addressRegion",
                "postalCode",
                "addressCountry",
            )
        ]
        name = ", ".join(part for part in parts if part)
        if name:
            names.append(name)
    return tuple(dict.fromkeys(names))


def _walk_json(value: object) -> tuple[dict[str, object], ...]:
    if isinstance(value, dict):
        return (value, *tuple(item for child in value.values() for item in _walk_json(child)))
    if isinstance(value, list):
        return tuple(item for child in value for item in _walk_json(child))
    return ()


def _is_job_posting(value: dict[str, object]) -> bool:
    types = value.get("@type")
    type_values = types if isinstance(types, list) else [types]
    return any(item == "JobPosting" for item in type_values)


def _extract_json_ld(tree: LexborHTMLParser) -> tuple[JsonLdJobPosting, ...]:
    postings: list[JsonLdJobPosting] = []
    seen: set[JsonLdJobPosting] = set()
    for script in tree.css('script[type="application/ld+json"]'):
        try:
            payload = json.loads(script.text())
        except (json.JSONDecodeError, TypeError):
            continue
        for item in _walk_json(payload):
            if not _is_job_posting(item):
                continue
            title = _normalise_text(item.get("title"))
            if title is None:
                continue
            url = _normalise_text(item.get("url"))
            posting = JsonLdJobPosting(
                title=title,
                url=url,
                date_posted=_normalise_text(item.get("datePosted")),
                employment_types=_normalise_strings(item.get("employmentType")),
                locations=_location_names(item.get("jobLocation")),
            )
            if posting not in seen:
                seen.add(posting)
                postings.append(posting)
    return tuple(postings)


def _looks_like_role_link(href: str, title: str) -> bool:
    haystack = f"{urlsplit(href).path.lower()} {title.lower()}"
    return any(term in haystack for term in _ROLE_PATH_TERMS) or any(
        term in title.lower() for term in _ROLE_TEXT_TERMS
    )


def _extract_role_links(tree: LexborHTMLParser, page_url: str) -> tuple[RoleLink, ...]:
    links: list[RoleLink] = []
    seen: set[str] = set()
    for anchor in tree.css("a[href]"):
        href = str(anchor.attributes.get("href") or "").strip()
        title = " ".join(anchor.text(separator=" ", strip=True).split())
        if not href or not title:
            continue
        absolute = urljoin(page_url, href)
        parts = urlsplit(absolute)
        if (
            parts.scheme not in {"http", "https"}
            or parts.username is not None
            or parts.password is not None
        ):
            continue
        absolute = urlunsplit((parts.scheme, parts.netloc, parts.path, parts.query, ""))
        if absolute in seen or not _looks_like_role_link(absolute, title):
            continue
        seen.add(absolute)
        links.append(RoleLink(title=title, url=absolute))
    return tuple(links)


def _looks_like_browser_shell(tree: LexborHTMLParser) -> bool:
    for node in tree.css("script, style, noscript, template"):
        node.decompose()
    visible = " ".join(tree.text(separator=" ", strip=True).lower().split())
    return "loading job" in visible or "enable javascript" in visible


def parse_static_careers_page(html: bytes | str, *, page_url: str) -> StaticCareersParseResult:
    """Extract server-rendered jobs and candidate links without network I/O."""
    _hostname_for_url(page_url)
    markup = html.decode("utf-8", errors="replace") if isinstance(html, bytes) else html
    tree = LexborHTMLParser(markup)
    postings = _extract_json_ld(tree)
    links = _extract_role_links(tree, page_url)
    return StaticCareersParseResult(
        job_postings=postings,
        role_links=links,
        requires_browser=not postings and not links and _looks_like_browser_shell(tree),
    )


def fetch_static_careers_page(
    careers_url: str,
    *,
    fetcher: SafeFetcher = safe_fetch,
    rate_limiter: HostRateLimiter | None = None,
) -> StaticCareersPage:
    """Fetch one registered careers page, respecting robots before parsing it."""
    hostname = _hostname_for_url(careers_url)
    allowed_hosts = frozenset({hostname})
    limiter = rate_limiter or HostRateLimiter()
    headers = _request_headers()

    limiter.acquire(hostname)
    robots = fetcher(_robots_url(careers_url), allowed_hosts=allowed_hosts, headers=headers)
    limiter.record_response(hostname, robots.status_code)
    policy = _robots_policy(robots)
    _assert_robots_allows(policy, careers_url)

    limiter.acquire(hostname)
    page = fetcher(
        careers_url,
        allowed_hosts=allowed_hosts,
        headers=headers,
        redirect_validator=lambda redirected_url: _assert_robots_allows(policy, redirected_url),
    )
    limiter.record_response(hostname, page.status_code)
    if _hostname_for_url(page.final_url) != hostname:
        raise InvalidCareersUrlError("careers page redirected outside its registered host")
    _assert_robots_allows(policy, page.final_url)
    if not 200 <= page.status_code < 300:
        raise StaticCareersFetchError(f"careers page returned HTTP {page.status_code}")
    content_type = page.content_type.split(";", 1)[0].lower().strip()
    if content_type not in _HTML_CONTENT_TYPES:
        raise StaticCareersFetchError(f"careers page was not HTML: {page.content_type!r}")
    return StaticCareersPage(
        requested_url=careers_url,
        final_url=page.final_url,
        parse_result=parse_static_careers_page(page.content, page_url=page.final_url),
    )
