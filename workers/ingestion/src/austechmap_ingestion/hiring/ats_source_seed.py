"""One-time manual registration of the ATS sources verified against real
data (Phase 5): Immutable's Lever site and Dovetail's Ashby board, found
by actually fetching their careers pages and grepping for a known ATS
domain reference -- a plain constant tuple, not a CSV, since 2 rows
doesn't warrant fixture-file ceremony; promote to a CSV (mirroring
employers/seed.py's precedent) once this list reaches double digits.

Automated ATS discovery (turning that fetch+grep technique into a
repeatable tool) is explicitly deferred -- this stays a manual research
step for now.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

import psycopg

from austechmap_ingestion.employers.normalisation import normalise_domain
from austechmap_ingestion.hiring.company_sources import AtsProvider
from austechmap_ingestion.jobs import JobRepository

SOURCE_KEY = "ats-discovery"


class AtsSourceSeedError(Exception):
    """Raised for a domain that resolves to zero or more than one company."""


@dataclass(frozen=True)
class AtsSourceSeed:
    company_domain: str
    ats_provider: AtsProvider
    ats_identifier: str
    discovered_method: Literal["manual_verified"] = "manual_verified"


ATS_SOURCE_SEED: tuple[AtsSourceSeed, ...] = (
    AtsSourceSeed(company_domain="immutable.com", ats_provider="lever", ats_identifier="immutable"),
    AtsSourceSeed(company_domain="dovetail.com", ats_provider="ashby", ats_identifier="dovetail"),
)


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
