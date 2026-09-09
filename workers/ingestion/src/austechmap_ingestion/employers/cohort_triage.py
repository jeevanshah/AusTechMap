"""Non-mutating, bulk first-pass validation for a candidate employer cohort.

This module deliberately separates a reachable website from a verified company.
Its output is a review manifest: a candidate may only move into a seed fixture
after first-party company and technology evidence has been recorded separately.
"""

from __future__ import annotations

import csv
import re
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

_USER_AGENT = "AusTechMap cohort validation/1.0"
_LOCATION_PATHS = ("", "contact", "contact-us", "locations", "support")
_SCRIPT_STYLE_RE = re.compile(
    r"<(script|style|noscript)\b[^>]*>.*?</\1>",
    re.IGNORECASE | re.DOTALL,
)
_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")
_STREET_TYPES = (
    r"(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Boulevard|Blvd|"
    r"Parade|Pde|Place|Pl|Court|Ct|Crescent|Cres|Way|Highway|Hwy|"
    r"Terrace|Tce|Circuit|Cct|Close|Cl)"
)
_STATE = r"(?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)"
_AU_ADDRESS_RE = re.compile(
    rf"\b("
    rf"\d{{1,5}}[A-Za-z]?(?:/\d{{1,5}}[A-Za-z]?)?"
    rf"\s+[A-Za-z][A-Za-z0-9'’.\-]*(?:\s+[A-Za-z][A-Za-z0-9'’.\-]*){{0,4}}"
    rf"\s+{_STREET_TYPES}"
    rf"(?:\s*,?\s+[A-Za-z][A-Za-z'’\-]*(?:\s+[A-Za-z][A-Za-z'’\-]*){{0,3}})?"
    rf"(?:\s*,?\s+{_STATE})?"
    rf"(?:\s+\d{{4}})?"
    rf")\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class CohortCandidate:
    name: str
    domain: str
    city: str


@dataclass(frozen=True)
class ReachabilityResult:
    reachable: bool
    http_status: int | None
    final_url: str | None
    detail: str | None


@dataclass(frozen=True)
class TriageRow:
    candidate: CohortCandidate
    reachability: ReachabilityResult

    @property
    def status(self) -> str:
        return (
            "reachable_needs_primary_evidence"
            if self.reachability.reachable
            else "unreachable_needs_manual_review"
        )

    @property
    def next_action(self) -> str:
        if self.reachability.reachable:
            return "Record first-party company, technology, and street-address evidence."
        return "Check the claimed domain against an authoritative company source before seeding."


@dataclass(frozen=True)
class HomepageEvidence:
    http_status: int | None
    final_url: str | None
    title: str | None
    description: str | None
    detail: str | None


@dataclass(frozen=True)
class EvidenceHarvestRow:
    triage: TriageRow
    evidence: HomepageEvidence | None

    @property
    def status(self) -> str:
        if not self.triage.reachability.reachable:
            return "skipped_unreachable"
        if self.evidence is not None and (self.evidence.title or self.evidence.description):
            return "metadata_captured_needs_human_assessment"
        return "reachable_but_metadata_unavailable"


@dataclass(frozen=True)
class SeedPreflightRow:
    candidate: CohortCandidate
    careers_url: str
    original_reason: str
    source_url: str
    technology_rationale: str


@dataclass(frozen=True)
class LocationPageFetch:
    url: str
    final_url: str | None
    text: str | None
    detail: str | None


@dataclass(frozen=True)
class LocationDiscoveryRow:
    candidate: CohortCandidate
    pages_checked: tuple[str, ...]
    address_candidates: tuple[str, ...]

    @property
    def status(self) -> str:
        return (
            "address_candidate_needs_verification"
            if self.address_candidates
            else "no_candidate_found"
        )

    @property
    def next_action(self) -> str:
        return "Verify candidate text on the cited first-party page before geocoding."


class _MetadataParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._in_title = False
        self._title_parts: list[str] = []
        self.description: str | None = None

    @property
    def title(self) -> str | None:
        title = " ".join(self._title_parts).strip()
        return title or None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "title":
            self._in_title = True
            return
        if tag.lower() != "meta":
            return
        attributes = {key.lower(): (value or "") for key, value in attrs}
        name = attributes.get("name", attributes.get("property", "")).lower()
        if name not in {"description", "og:description", "twitter:description"}:
            return
        content = " ".join(attributes.get("content", "").split())
        if content and self.description is None:
            self.description = content[:500]

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self._title_parts.append(data)


def load_cohort_fixture(path: Path) -> tuple[CohortCandidate, ...]:
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError("missing CSV header")
        required = {"name", "domain", "city"}
        missing = sorted(required - set(reader.fieldnames))
        if missing:
            raise ValueError(f"missing required columns: {', '.join(missing)}")
        candidates = tuple(
            CohortCandidate(
                name=row["name"].strip(),
                domain=row["domain"].strip().lower(),
                city=row["city"].strip(),
            )
            for row in reader
        )
    if not candidates:
        raise ValueError("cohort fixture contains no candidates")
    invalid: list[str] = []
    for candidate in candidates:
        if not candidate.name or not candidate.domain:
            invalid.append(candidate.name)
    if invalid:
        raise ValueError(f"candidate requires name and domain: {', '.join(invalid)}")
    return candidates


def probe_https_domain(domain: str, *, timeout_seconds: float) -> ReachabilityResult:
    request = Request(f"https://{domain}", headers={"User-Agent": _USER_AGENT})
    try:
        with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310 - domain is fixture data
            return ReachabilityResult(
                reachable=True,
                http_status=response.status,
                final_url=response.url,
                detail=None,
            )
    except HTTPError as error:
        # A response such as 401/403/404 proves the domain is live; it does not
        # prove the candidate is an eligible company.
        return ReachabilityResult(
            reachable=True,
            http_status=error.code,
            final_url=error.url,
            detail=f"HTTP {error.code}",
        )
    except (TimeoutError, URLError, OSError) as error:
        return ReachabilityResult(
            reachable=False,
            http_status=None,
            final_url=None,
            detail=type(error).__name__,
        )


def triage_cohort(
    candidates: tuple[CohortCandidate, ...],
    *,
    timeout_seconds: float = 12.0,
    workers: int = 20,
    probe: Callable[[str], ReachabilityResult] | None = None,
) -> tuple[TriageRow, ...]:
    if workers < 1:
        raise ValueError("workers must be at least 1")
    check = probe or (lambda domain: probe_https_domain(domain, timeout_seconds=timeout_seconds))
    with ThreadPoolExecutor(max_workers=workers) as executor:
        results = tuple(executor.map(lambda candidate: check(candidate.domain), candidates))
    return tuple(
        TriageRow(candidate, result) for candidate, result in zip(candidates, results, strict=True)
    )


def load_triage_manifest(path: Path) -> tuple[TriageRow, ...]:
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError("missing triage manifest header")
        required = {
            "name",
            "domain",
            "city",
            "reachability_status",
            "http_status",
            "final_url",
            "diagnostic",
        }
        missing = sorted(required - set(reader.fieldnames))
        if missing:
            raise ValueError(f"missing triage manifest columns: {', '.join(missing)}")
        rows = tuple(
            TriageRow(
                candidate=CohortCandidate(
                    name=row["name"].strip(),
                    domain=row["domain"].strip(),
                    city=row["city"].strip(),
                ),
                reachability=ReachabilityResult(
                    reachable=row["reachability_status"].strip()
                    == "reachable_needs_primary_evidence",
                    http_status=int(row["http_status"]) if row["http_status"].strip() else None,
                    final_url=row["final_url"].strip() or None,
                    detail=row["diagnostic"].strip() or None,
                ),
            )
            for row in reader
        )
    if not rows:
        raise ValueError("triage manifest contains no rows")
    return rows


def load_evidence_harvest(path: Path) -> tuple[dict[str, str], ...]:
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError("missing evidence harvest header")
        required = {
            "name",
            "domain",
            "city",
            "harvest_status",
            "source_url",
            "page_title",
            "meta_description",
        }
        missing = sorted(required - set(reader.fieldnames))
        if missing:
            raise ValueError(f"missing evidence harvest columns: {', '.join(missing)}")
        return tuple(reader)


def build_seed_preflight(
    cohort_fixture: Path, evidence_harvest: Path
) -> tuple[SeedPreflightRow, ...]:
    candidates = load_cohort_fixture(cohort_fixture)
    with cohort_fixture.open(encoding="utf-8", newline="") as handle:
        original_rows = {row["domain"].strip().lower(): row for row in csv.DictReader(handle)}
    evidence_by_domain = {
        row["domain"].strip().lower(): row for row in load_evidence_harvest(evidence_harvest)
    }

    preflight: list[SeedPreflightRow] = []
    for candidate in candidates:
        evidence = evidence_by_domain.get(candidate.domain)
        original = original_rows[candidate.domain]
        if (
            evidence is None
            or evidence["harvest_status"] != "metadata_captured_needs_human_assessment"
        ):
            continue
        title = evidence["page_title"].strip()
        description = evidence["meta_description"].strip()
        rationale = " ".join(part for part in (title, description) if part)
        source_url = evidence["source_url"].strip()
        if not source_url or len(rationale) < 20:
            continue
        preflight.append(
            SeedPreflightRow(
                candidate=candidate,
                careers_url=original["careers_url"].strip(),
                original_reason=original["reason"].strip(),
                source_url=source_url,
                technology_rationale=rationale,
            )
        )
    return tuple(preflight)


def fetch_homepage_metadata(url: str, *, timeout_seconds: float) -> HomepageEvidence:
    request = Request(url, headers={"User-Agent": _USER_AGENT})
    try:
        with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310 - reviewed manifest input
            content_type = response.headers.get_content_type()
            if content_type not in {"text/html", "application/xhtml+xml"}:
                return HomepageEvidence(
                    http_status=response.status,
                    final_url=response.url,
                    title=None,
                    description=None,
                    detail=f"unsupported content type: {content_type}",
                )
            charset = response.headers.get_content_charset() or "utf-8"
            parser = _MetadataParser()
            parser.feed(response.read(131_072).decode(charset, errors="replace"))
            parser.close()
            return HomepageEvidence(
                http_status=response.status,
                final_url=response.url,
                title=parser.title,
                description=parser.description,
                detail=None,
            )
    except HTTPError as error:
        return HomepageEvidence(error.code, error.url, None, None, f"HTTP {error.code}")
    except (TimeoutError, URLError, OSError) as error:
        return HomepageEvidence(None, None, None, None, type(error).__name__)


def harvest_homepage_evidence(
    triage_rows: tuple[TriageRow, ...],
    *,
    timeout_seconds: float = 12.0,
    workers: int = 12,
    fetch: Callable[[str], HomepageEvidence] | None = None,
) -> tuple[EvidenceHarvestRow, ...]:
    if workers < 1:
        raise ValueError("workers must be at least 1")
    get = fetch or (lambda url: fetch_homepage_metadata(url, timeout_seconds=timeout_seconds))
    reachable_rows = tuple(
        row for row in triage_rows if row.reachability.reachable and row.reachability.final_url
    )
    urls = tuple(row.reachability.final_url or "" for row in reachable_rows)
    with ThreadPoolExecutor(max_workers=workers) as executor:
        evidence = tuple(executor.map(get, urls))
    evidence_by_domain = {
        row.candidate.domain: result for row, result in zip(reachable_rows, evidence, strict=True)
    }
    return tuple(
        EvidenceHarvestRow(row, evidence_by_domain.get(row.candidate.domain)) for row in triage_rows
    )


def write_triage_manifest(path: Path, rows: tuple[TriageRow, ...]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=(
                "name",
                "domain",
                "city",
                "reachability_status",
                "http_status",
                "final_url",
                "diagnostic",
                "next_action",
            ),
            lineterminator="\n",
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "name": row.candidate.name,
                    "domain": row.candidate.domain,
                    "city": row.candidate.city,
                    "reachability_status": row.status,
                    "http_status": row.reachability.http_status or "",
                    "final_url": row.reachability.final_url or "",
                    "diagnostic": row.reachability.detail or "",
                    "next_action": row.next_action,
                }
            )


def write_evidence_harvest(path: Path, rows: tuple[EvidenceHarvestRow, ...]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=(
                "name",
                "domain",
                "city",
                "harvest_status",
                "source_url",
                "http_status",
                "page_title",
                "meta_description",
                "diagnostic",
                "next_action",
            ),
            lineterminator="\n",
        )
        writer.writeheader()
        for row in rows:
            evidence = row.evidence
            source_url = evidence.final_url if evidence else ""
            http_status = evidence.http_status if evidence else ""
            page_title = evidence.title if evidence else ""
            meta_description = evidence.description if evidence else ""
            diagnostic = evidence.detail if evidence else ""
            writer.writerow(
                {
                    "name": row.triage.candidate.name,
                    "domain": row.triage.candidate.domain,
                    "city": row.triage.candidate.city,
                    "harvest_status": row.status,
                    "source_url": source_url or "",
                    "http_status": http_status or "",
                    "page_title": page_title or "",
                    "meta_description": meta_description or "",
                    "diagnostic": diagnostic or "",
                    "next_action": (
                        "Assess this primary-source metadata before creating a seed fixture."
                        if row.status == "metadata_captured_needs_human_assessment"
                        else "Find an authoritative company source before creating a seed fixture."
                    ),
                }
            )


def write_seed_preflight(path: Path, rows: tuple[SeedPreflightRow, ...]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=(
                "name",
                "domain",
                "careers_url",
                "city",
                "reason",
                "confidence",
                "source_url",
                "technology_rationale",
            ),
            lineterminator="\n",
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "name": row.candidate.name,
                    "domain": row.candidate.domain,
                    "careers_url": row.careers_url,
                    "city": row.candidate.city,
                    "reason": row.original_reason,
                    "confidence": "Medium - first-party homepage metadata captured",
                    "source_url": row.source_url,
                    "technology_rationale": row.technology_rationale,
                }
            )


def load_seed_preflight(path: Path) -> tuple[SeedPreflightRow, ...]:
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError("missing seed preflight header")
        required = {
            "name",
            "domain",
            "careers_url",
            "city",
            "reason",
            "source_url",
            "technology_rationale",
        }
        missing = sorted(required - set(reader.fieldnames))
        if missing:
            raise ValueError(f"missing seed preflight columns: {', '.join(missing)}")
        rows = tuple(
            SeedPreflightRow(
                candidate=CohortCandidate(
                    name=row["name"].strip(),
                    domain=row["domain"].strip().lower(),
                    city=row["city"].strip(),
                ),
                careers_url=row["careers_url"].strip(),
                original_reason=row["reason"].strip(),
                source_url=row["source_url"].strip(),
                technology_rationale=row["technology_rationale"].strip(),
            )
            for row in reader
        )
    if not rows:
        raise ValueError("seed preflight contains no rows")
    return rows


def html_to_visible_text(html: str) -> str:
    without_blocks = _SCRIPT_STYLE_RE.sub(" ", html)
    text = _TAG_RE.sub(" ", without_blocks)
    return _WHITESPACE_RE.sub(" ", text).strip()


def extract_au_street_addresses(text: str) -> tuple[str, ...]:
    found: list[str] = []
    seen: set[str] = set()
    for match in _AU_ADDRESS_RE.finditer(text):
        candidate = _WHITESPACE_RE.sub(" ", match.group(1)).strip(" ,")
        key = candidate.casefold()
        if key in seen:
            continue
        # Discovery-only: keep Australian-looking street addresses with a number
        # and a state code so marketing copy and foreign offices stay out.
        if not re.search(r"\d", candidate):
            continue
        if not re.search(rf"\b{_STATE}\b", candidate, re.IGNORECASE):
            continue
        seen.add(key)
        found.append(candidate)
    return tuple(found)


def candidate_location_urls(source_url: str) -> tuple[str, ...]:
    parsed = urlparse(source_url)
    if not parsed.scheme or not parsed.netloc:
        raise ValueError(f"source_url must be an absolute URL: {source_url}")
    base = f"{parsed.scheme}://{parsed.netloc}{parsed.path}"
    if not base.endswith("/"):
        base = f"{base}/"
    urls: list[str] = []
    seen: set[str] = set()
    for suffix in _LOCATION_PATHS:
        url = base if not suffix else urljoin(base, suffix)
        if url not in seen:
            seen.add(url)
            urls.append(url)
    return tuple(urls)


def fetch_location_page(url: str, *, timeout_seconds: float) -> LocationPageFetch:
    request = Request(url, headers={"User-Agent": _USER_AGENT})
    try:
        with urlopen(request, timeout=timeout_seconds) as response:  # noqa: S310 - reviewed preflight URL
            content_type = response.headers.get_content_type()
            if content_type not in {"text/html", "application/xhtml+xml"}:
                return LocationPageFetch(
                    url=url,
                    final_url=response.url,
                    text=None,
                    detail=f"unsupported content type: {content_type}",
                )
            charset = response.headers.get_content_charset() or "utf-8"
            html = response.read(196_608).decode(charset, errors="replace")
            return LocationPageFetch(
                url=url,
                final_url=response.url,
                text=html_to_visible_text(html),
                detail=None,
            )
    except HTTPError as error:
        return LocationPageFetch(url, error.url, None, f"HTTP {error.code}")
    except (TimeoutError, URLError, OSError) as error:
        return LocationPageFetch(url, None, None, type(error).__name__)


def discover_location_candidates(
    preflight_rows: tuple[SeedPreflightRow, ...],
    *,
    timeout_seconds: float = 12.0,
    workers: int = 8,
    fetch_page: Callable[[str], LocationPageFetch] | None = None,
) -> tuple[LocationDiscoveryRow, ...]:
    if workers < 1:
        raise ValueError("workers must be at least 1")
    get = fetch_page or (lambda url: fetch_location_page(url, timeout_seconds=timeout_seconds))

    def discover_one(row: SeedPreflightRow) -> LocationDiscoveryRow:
        try:
            urls = candidate_location_urls(row.source_url)
        except ValueError:
            return LocationDiscoveryRow(row.candidate, (), ())
        pages: list[str] = []
        addresses: list[str] = []
        seen_addresses: set[str] = set()
        for url in urls:
            page = get(url)
            checked = page.final_url or url
            if checked not in pages:
                pages.append(checked)
            if not page.text:
                continue
            for address in extract_au_street_addresses(page.text):
                key = address.casefold()
                if key in seen_addresses:
                    continue
                seen_addresses.add(key)
                addresses.append(address)
        return LocationDiscoveryRow(row.candidate, tuple(pages), tuple(addresses))

    with ThreadPoolExecutor(max_workers=workers) as executor:
        return tuple(executor.map(discover_one, preflight_rows))


def write_location_candidates(path: Path, rows: tuple[LocationDiscoveryRow, ...]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=(
                "name",
                "domain",
                "city",
                "status",
                "pages_checked",
                "address_candidates",
                "next_action",
            ),
            lineterminator="\n",
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(
                {
                    "name": row.candidate.name,
                    "domain": row.candidate.domain,
                    "city": row.candidate.city,
                    "status": row.status,
                    "pages_checked": " | ".join(row.pages_checked),
                    "address_candidates": " | ".join(row.address_candidates),
                    "next_action": row.next_action,
                }
            )
