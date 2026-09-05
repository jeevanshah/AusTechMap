"""Registration of the ATS sources verified against real data (Phase 5):
each row is a company whose careers page was actually fetched and found
to reference a known ATS domain, then independently confirmed by calling
that ATS's real public API before being added here -- never registered
on a URL-pattern guess alone.

Now a CSV fixture (mirroring employers/seed.py's precedent), promoted
from a 2-row plain constant tuple once real ATS-discovery research (see
IMPLEMENTATION_PLAN.md Phase 5) pushed the list past the "double digits"
threshold this module originally deferred that promotion to.

Automated ATS discovery (turning the fetch+grep technique into a
repeatable tool, rather than a manual research pass each time) remains
explicitly deferred.
"""

from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, cast

import psycopg

from austechmap_ingestion.employers.normalisation import normalise_domain
from austechmap_ingestion.hiring.company_sources import AtsProvider
from austechmap_ingestion.jobs import JobRepository

SOURCE_KEY = "ats-discovery"
DEFAULT_FIXTURE_PATH = Path(__file__).parent / "fixtures" / "ats_source_seed_20260905.csv"
_VALID_PROVIDERS = frozenset({"lever", "ashby", "greenhouse"})


class AtsSourceSeedError(Exception):
    """Raised for a domain that resolves to zero or more than one company,
    or for a malformed seed fixture."""


@dataclass(frozen=True)
class AtsSourceSeed:
    company_domain: str
    ats_provider: AtsProvider
    ats_identifier: str
    discovered_method: Literal["manual_verified"] = "manual_verified"


def load_ats_source_seed_fixture(path: Path = DEFAULT_FIXTURE_PATH) -> tuple[AtsSourceSeed, ...]:
    with path.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        seeds = []
        for row in reader:
            provider = row["ats_provider"].strip()
            if provider not in _VALID_PROVIDERS:
                raise AtsSourceSeedError(f"unrecognised ats_provider: {provider!r}")
            seeds.append(
                AtsSourceSeed(
                    company_domain=row["company_domain"].strip(),
                    ats_provider=cast(AtsProvider, provider),
                    ats_identifier=row["ats_identifier"].strip(),
                )
            )
    if not seeds:
        raise AtsSourceSeedError(f"no ATS sources found in {path}")
    return tuple(seeds)


ATS_SOURCE_SEED: tuple[AtsSourceSeed, ...] = load_ats_source_seed_fixture()


@dataclass(frozen=True)
class AtsSourceSeedStats:
    created: int
    reused: int


def seed_ats_sources(
    database_url: str, seeds: tuple[AtsSourceSeed, ...] = ATS_SOURCE_SEED
) -> AtsSourceSeedStats:
    source_id = JobRepository(database_url).ensure_source(
        source_key=SOURCE_KEY, name="Manually verified ATS source discovery", kind="derived"
    )

    created = reused = 0
    with psycopg.connect(database_url, autocommit=True) as connection:
        for seed in seeds:
            domain = normalise_domain(seed.company_domain)
            if domain is None:
                raise AtsSourceSeedError(f"invalid company domain: {seed.company_domain!r}")

            matches = connection.execute(
                "SELECT id FROM companies WHERE domain = %s AND status <> 'merged'",
                (domain,),
            ).fetchall()
            if len(matches) != 1:
                raise AtsSourceSeedError(
                    f"expected exactly one company for domain {domain!r}, found {len(matches)}"
                )
            company_id = matches[0][0]

            inserted = connection.execute(
                """
                INSERT INTO company_ats_sources (
                  company_id, ats_provider, ats_identifier, discovered_method, source_id
                )
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (company_id, ats_provider) DO NOTHING
                RETURNING id
                """,
                (
                    company_id,
                    seed.ats_provider,
                    seed.ats_identifier,
                    seed.discovered_method,
                    source_id,
                ),
            ).fetchone()
            if inserted is not None:
                created += 1
            else:
                reused += 1

    return AtsSourceSeedStats(created=created, reused=reused)
