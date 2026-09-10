"""Read-only discovery of known public ATS boards from careers-page fixtures.

Candidates from this module are review evidence only.  They are never
registered in ``company_ats_sources`` and never trigger a crawl.
"""

from __future__ import annotations

import csv
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from functools import partial
from pathlib import Path
from urllib.parse import urljoin, urlsplit

from selectolax.lexbor import LexborHTMLParser

from austechmap_ingestion.fetch_safety import FetchSafetyError, SafeFetchResult, safe_fetch
from austechmap_ingestion.hiring.company_sources import AtsProvider
from austechmap_ingestion.hiring.static_careers import (
    StaticCareersError,
    fetch_static_careers_document,
)


@dataclass(frozen=True)
class CareersFixtureRow:
    domain: str
    careers_url: str


@dataclass(frozen=True)
class AtsDiscoveryCandidate:
    company_domain: str
    ats_provider: AtsProvider
    ats_identifier: str
    evidence_url: str
    careers_url: str


@dataclass(frozen=True)
class AtsDiscoveryResult:
    candidates: tuple[AtsDiscoveryCandidate, ...]
    checked: int
    errors: tuple[tuple[str, str], ...]


_SUPPORTED_HOSTS = frozenset(
    {
        "jobs.lever.co",
        "jobs.ashbyhq.com",
        "boards.greenhouse.io",
        "jobs.smartrecruiters.com",
        "apply.workable.com",
    }
)
_NON_BOARD_PATH_SEGMENTS = frozenset({"api", "embed", "j", "job", "jobs"})


def load_careers_fixture(path: Path) -> tuple[CareersFixtureRow, ...]:
    """Load a standard cohort fixture, retaining only usable careers URLs."""
    rows: dict[str, CareersFixtureRow] = {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            domain = (row.get("domain") or "").strip().lower()
            careers_url = (row.get("careers_url") or "").strip()
            if domain and careers_url:
                rows[domain] = CareersFixtureRow(domain, careers_url)
    return tuple(rows[domain] for domain in sorted(rows))


def _first_path_segment(url: str) -> str | None:
    segments = [segment for segment in urlsplit(url).path.split("/") if segment]
    return segments[0] if segments else None


def _candidate_from_url(
    url: str, *, company_domain: str, evidence_url: str, careers_url: str
) -> AtsDiscoveryCandidate | None:
    parts = urlsplit(url)
    hostname = (parts.hostname or "").lower()
    identifier: str | None = None
    provider: AtsProvider | None = None
    if hostname == "jobs.lever.co":
        provider, identifier = "lever", _first_path_segment(url)
    elif hostname == "jobs.ashbyhq.com":
        provider, identifier = "ashby", _first_path_segment(url)
    elif hostname == "boards.greenhouse.io":
        provider, identifier = "greenhouse", _first_path_segment(url)
    elif hostname == "jobs.smartrecruiters.com":
        provider, identifier = "smartrecruiters", _first_path_segment(url)
    elif hostname == "apply.workable.com":
        provider, identifier = "workable", _first_path_segment(url)
    elif hostname.endswith(".breezy.hr"):
        provider, identifier = "breezy", hostname.removesuffix(".breezy.hr")
    elif hostname.endswith(".pinpointhq.com"):
        provider, identifier = "pinpoint", hostname.removesuffix(".pinpointhq.com")
    if provider is None or identifier is None or not identifier.strip():
        return None
    if provider in {"greenhouse", "workable"} and identifier.lower() in _NON_BOARD_PATH_SEGMENTS:
        return None
    return AtsDiscoveryCandidate(
        company_domain=company_domain,
        ats_provider=provider,
        ats_identifier=identifier,
        evidence_url=evidence_url,
        careers_url=careers_url,
    )


def extract_ats_candidates(
    html: bytes | str, *, page_url: str, company_domain: str, careers_url: str
) -> tuple[AtsDiscoveryCandidate, ...]:
    """Extract known ATS board links without inferring unrecognised hosts."""
    tree = LexborHTMLParser(html)
    candidates: dict[tuple[AtsProvider, str], AtsDiscoveryCandidate] = {}
    for node in tree.css("a[href], iframe[src]"):
        raw_url = node.attributes.get("href") or node.attributes.get("src")
        if not raw_url:
            continue
        resolved = urljoin(page_url, raw_url)
        hostname = (urlsplit(resolved).hostname or "").lower()
        if hostname not in _SUPPORTED_HOSTS and not (
            hostname.endswith(".breezy.hr") or hostname.endswith(".pinpointhq.com")
        ):
            continue
        candidate = _candidate_from_url(
            resolved,
            company_domain=company_domain,
            evidence_url=page_url,
            careers_url=careers_url,
        )
        if candidate is not None:
            candidates[(candidate.ats_provider, candidate.ats_identifier)] = candidate
    return tuple(candidates[key] for key in sorted(candidates))


def _discover_one(
    row: CareersFixtureRow, *, fetcher: Callable[..., SafeFetchResult]
) -> tuple[tuple[AtsDiscoveryCandidate, ...], tuple[str, str] | None]:
    try:
        document = fetch_static_careers_document(row.careers_url, fetcher=fetcher)
    except (FetchSafetyError, OSError, StaticCareersError, ValueError) as error:
        return (), (row.domain, f"{type(error).__name__}: {error}")
    return (
        extract_ats_candidates(
            document.content,
            page_url=document.final_url,
            company_domain=row.domain,
            careers_url=row.careers_url,
        ),
        None,
    )


def discover_ats_sources(
    rows: Iterable[CareersFixtureRow],
    *,
    workers: int = 4,
    fetcher: Callable[..., SafeFetchResult] = safe_fetch,
) -> AtsDiscoveryResult:
    """Fetch careers pages and return only evidence-backed, known ATS links."""
    if workers < 1:
        raise ValueError("workers must be positive")
    unique_rows = tuple({row.domain: row for row in rows}.values())
    discovery = partial(_discover_one, fetcher=fetcher)
    with ThreadPoolExecutor(max_workers=workers) as executor:
        outcomes = tuple(executor.map(discovery, unique_rows))
    candidates: dict[tuple[str, AtsProvider, str], AtsDiscoveryCandidate] = {}
    errors: list[tuple[str, str]] = []
    for found, error in outcomes:
        for candidate in found:
            candidates[
                (candidate.company_domain, candidate.ats_provider, candidate.ats_identifier)
            ] = candidate
        if error is not None:
            errors.append(error)
    return AtsDiscoveryResult(
        candidates=tuple(candidates[key] for key in sorted(candidates)),
        checked=len(unique_rows),
        errors=tuple(sorted(errors)),
    )


def write_ats_discovery_preflight(path: Path, result: AtsDiscoveryResult) -> None:
    """Write a review CSV; it is deliberately not seed-ats-sources input."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "company_domain",
                "ats_provider",
                "ats_identifier",
                "evidence_url",
                "careers_url",
                "status",
            ],
        )
        writer.writeheader()
        for candidate in result.candidates:
            writer.writerow(
                {
                    "company_domain": candidate.company_domain,
                    "ats_provider": candidate.ats_provider,
                    "ats_identifier": candidate.ats_identifier,
                    "evidence_url": candidate.evidence_url,
                    "careers_url": candidate.careers_url,
                    "status": "candidate_requires_manual_live_board_verification",
                }
            )
