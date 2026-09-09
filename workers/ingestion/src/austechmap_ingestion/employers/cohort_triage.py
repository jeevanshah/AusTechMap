"""Non-mutating, bulk first-pass validation for a candidate employer cohort.

This module deliberately separates a reachable website from a verified company.
Its output is a review manifest: a candidate may only move into a seed fixture
after first-party company and technology evidence has been recorded separately.
"""

from __future__ import annotations

import csv
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

_USER_AGENT = "AusTechMap cohort validation/1.0"


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
