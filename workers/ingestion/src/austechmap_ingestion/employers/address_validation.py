"""Quality gate for newly researched employer address fixtures.

Historic fixtures predate this contract.  New map-eligible cohorts must have
street-level addresses, a public evidence URL, and no unexplained address
reuse.  The validator is deliberately read-only so research can be corrected
before any company or location is written to the database.
"""

from __future__ import annotations

import csv
import re
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from austechmap_ingestion.employers.location_quality import street_address_lacks_number

_REQUIRED_COLUMNS = frozenset(
    {
        "domain",
        "street_address",
        "suburb",
        "state",
        "postcode",
        "source_confidence",
        "source_note",
        "source_url",
    }
)
_WHITESPACE_RE = re.compile(r"\s+")


class AddressFixtureValidationError(Exception):
    """Raised when an address fixture cannot be parsed as a CSV contract."""


@dataclass(frozen=True)
class AddressFixtureValidation:
    rows: int
    errors: tuple[str, ...]
    duplicate_addresses: tuple[tuple[str, tuple[str, ...]], ...]

    @property
    def valid(self) -> bool:
        return not self.errors


def _normalise_address(row: dict[str, str]) -> str:
    return _WHITESPACE_RE.sub(
        " ",
        ", ".join(
            [
                row["street_address"].strip(),
                row["suburb"].strip(),
                row["state"].strip(),
                row["postcode"].strip(),
            ]
        ).casefold(),
    )


def _is_public_http_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def validate_address_fixture(
    path: Path, *, max_domains_per_address: int = 1
) -> AddressFixtureValidation:
    """Validate the strict contract required before a new cohort is geocoded."""
    if max_domains_per_address < 1:
        raise ValueError("max_domains_per_address must be at least 1")
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise AddressFixtureValidationError(f"missing CSV header: {path}")
        missing_columns = sorted(_REQUIRED_COLUMNS - set(reader.fieldnames))
        if missing_columns:
            raise AddressFixtureValidationError(
                f"missing required columns in {path}: {', '.join(missing_columns)}"
            )
        rows = list(reader)
    if not rows:
        raise AddressFixtureValidationError(f"no address rows found in {path}")

    errors: list[str] = []
    addresses: dict[str, list[str]] = {}
    domains: Counter[str] = Counter()
    for row_number, row in enumerate(rows, start=2):
        domain = row["domain"].strip().casefold()
        street_address = row["street_address"].strip()
        source_url = row["source_url"].strip()
        if not domain:
            errors.append(f"row {row_number}: domain is required")
        else:
            domains[domain] += 1
        if street_address_lacks_number(street_address):
            errors.append(
                f"row {row_number} ({domain or 'unknown'}): street_address needs a number"
            )
        if not _is_public_http_url(source_url):
            errors.append(
                f"row {row_number} ({domain or 'unknown'}): source_url must be public http(s)"
            )
        address = _normalise_address(row)
        addresses.setdefault(address, []).append(domain)

    duplicate_domains = sorted(domain for domain, count in domains.items() if count > 1)
    errors.extend(f"duplicate domain: {domain}" for domain in duplicate_domains)
    duplicate_addresses = tuple(
        (address, tuple(sorted(domains_at_address)))
        for address, domains_at_address in sorted(addresses.items())
        if len(domains_at_address) > max_domains_per_address
    )
    errors.extend(
        "address reused by " + ", ".join(domains_at_address)
        for _, domains_at_address in duplicate_addresses
    )
    return AddressFixtureValidation(
        rows=len(rows), errors=tuple(errors), duplicate_addresses=duplicate_addresses
    )
