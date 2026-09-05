"""Job->company resolution via company_ats_sources (Phase 5). The ATS
site/board identifier (e.g. 'immutable', 'dovetail') has no reliable
mechanical relationship to companies.domain, so this table is read
directly rather than re-deriving the match on every fetch."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Literal, cast

import psycopg

AtsProvider = Literal["lever", "ashby"]


@dataclass(frozen=True)
class CompanyAtsSource:
    company_id: uuid.UUID
    ats_provider: AtsProvider
    ats_identifier: str
    source_id: uuid.UUID


def list_active_ats_sources(
    database_url: str, *, ats_identifier: str | None = None
) -> list[CompanyAtsSource]:
    query = """
        SELECT company_id, ats_provider, ats_identifier, source_id
        FROM company_ats_sources
        WHERE status = 'active'
    """
    params: tuple[object, ...] = ()
    if ats_identifier is not None:
        query += " AND ats_identifier = %s"
        params = (ats_identifier,)

    with psycopg.connect(database_url) as connection:
        rows = connection.execute(query, params).fetchall()

    return [
        CompanyAtsSource(
            company_id=cast(uuid.UUID, row[0]),
            ats_provider=cast(AtsProvider, row[1]),
            ats_identifier=cast(str, row[2]),
            source_id=cast(uuid.UUID, row[3]),
        )
        for row in rows
    ]
