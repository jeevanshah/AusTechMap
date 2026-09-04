"""Deterministic company matching and review-routing (Phase 3).

Given a candidate company (from an ABR lookup, a future ATS/careers-page
crawl, or manual seeding), decides whether it matches an existing
`companies` row, should become a new one, or needs human review — per
IMPLEMENTATION_PLAN.md Phase 3's "route ambiguous or conflicting matches to
review instead of auto-merging."

Confidence model, deliberately conservative: an ABN match is treated as
certain (two different real businesses cannot share one active ABN, and
the CHECK/unique-index pair in migration 0007 already enforces that at the
database level). A domain match is high-confidence but not certain (two
otherwise-unrelated brands could share a parent domain). Either auto-
accepts when it names exactly one existing company and goes to review when
it names more than one. A bare company-name match — however unique it
looks — never auto-accepts: name collisions between unrelated real
businesses are common enough that this always needs a human, not a
confidence score, deciding whether it's the same entity.

Name matching happens by fetching active companies and comparing with
normalise_company_name() in Python, not a SQL predicate that reimplements
the same normalisation rules a second time and risks drifting from them —
deliberately affordable at this phase's realistic scale (the seed cohort
is 100-200 companies, expanding toward 1,000 in Phase 8), not something
that would scale to G-NAF- or ABR-sized data.
"""

from __future__ import annotations

import re
import uuid
from dataclasses import dataclass
from typing import Literal, cast

import psycopg
from psycopg.types.json import Jsonb

from austechmap_ingestion.employers.normalisation import (
    normalise_abn,
    normalise_acn,
    normalise_company_name,
    normalise_domain,
)


class EmployerIdentityError(Exception):
    """Raised for invalid candidate data."""


@dataclass(frozen=True)
class CandidateCompany:
    display_name: str
    source_id: uuid.UUID
    abn: str | None = None
    acn: str | None = None
    domain: str | None = None
    careers_url: str | None = None


@dataclass(frozen=True)
class ExistingCompany:
    id: uuid.UUID
    display_name: str
    abn: str | None
    domain: str | None
    status: str


MatchDecision = Literal["matched", "created", "review"]


@dataclass(frozen=True)
class MatchOutcome:
    decision: MatchDecision
    company_id: uuid.UUID | None
    confidence: float
    reason: str


_ABN_MATCH_CONFIDENCE = 1.0
_DOMAIN_MATCH_CONFIDENCE = 0.9


def match_or_create_company(database_url: str, candidate: CandidateCompany) -> MatchOutcome:
    abn = normalise_abn(candidate.abn) if candidate.abn else None
    if candidate.abn and abn is None:
        raise EmployerIdentityError(f"invalid ABN: {candidate.abn!r}")
    acn = normalise_acn(candidate.acn) if candidate.acn else None
    if candidate.acn and acn is None:
        raise EmployerIdentityError(f"invalid ACN: {candidate.acn!r}")
    domain = normalise_domain(candidate.domain) if candidate.domain else None
    if candidate.domain and domain is None:
        raise EmployerIdentityError(f"invalid domain: {candidate.domain!r}")
    normalised_name = normalise_company_name(candidate.display_name)
    if not normalised_name:
        raise EmployerIdentityError(
            f"company name has no content after normalising: {candidate.display_name!r}"
        )

    with psycopg.connect(database_url) as connection:
        if abn:
            matches = _find_active_by_abn(connection, abn)
            if len(matches) == 1:
                return _accept(
                    connection,
                    matches[0],
                    _ABN_MATCH_CONFIDENCE,
                    "abn",
                    candidate,
                    abn,
                    acn,
                    domain,
                )
            if len(matches) > 1:
                # Defensive: migration 0007's partial unique index already
                # guarantees at most one non-merged company per ABN, so
                # this should be unreachable in practice. Handled anyway
                # rather than trusting that invariant blindly from here.
                return _to_review(
                    connection,
                    candidate,
                    matches,
                    "abn",
                    "multiple active companies share this ABN",
                )

        if domain:
            matches = _find_active_by_domain(connection, domain)
            if len(matches) == 1:
                return _accept(
                    connection,
                    matches[0],
                    _DOMAIN_MATCH_CONFIDENCE,
                    "domain",
                    candidate,
                    abn,
                    acn,
                    domain,
                )
            if len(matches) > 1:
                return _to_review(
                    connection,
                    candidate,
                    matches,
                    "domain",
                    "multiple active companies share this domain",
                )

        name_matches = _find_active_by_normalised_name(connection, normalised_name)
        if name_matches:
            return _to_review(
                connection,
                candidate,
                name_matches,
                "name",
                "name-only match needs human confirmation",
            )

        return _create(connection, candidate, abn, acn, domain)


def _existing_company_from_row(row: tuple[object, ...]) -> ExistingCompany:
    return ExistingCompany(
        id=cast(uuid.UUID, row[0]),
        display_name=cast(str, row[1]),
        abn=cast("str | None", row[2]),
        domain=cast("str | None", row[3]),
        status=cast(str, row[4]),
    )


def _find_active_by_abn(
    connection: psycopg.Connection[tuple[object, ...]], abn: str
) -> list[ExistingCompany]:
    rows = connection.execute(
        """
        SELECT id, display_name, abn, domain, status FROM companies
        WHERE status NOT IN ('merged', 'disabled') AND abn = %s
        """,
        (abn,),
    ).fetchall()
    return [_existing_company_from_row(row) for row in rows]


def _find_active_by_domain(
    connection: psycopg.Connection[tuple[object, ...]], domain: str
) -> list[ExistingCompany]:
    rows = connection.execute(
        """
        SELECT id, display_name, abn, domain, status FROM companies
        WHERE status NOT IN ('merged', 'disabled') AND domain = %s
        """,
        (domain,),
    ).fetchall()
    return [_existing_company_from_row(row) for row in rows]


def _find_active_by_normalised_name(
    connection: psycopg.Connection[tuple[object, ...]], normalised_name: str
) -> list[ExistingCompany]:
    rows = connection.execute(
        """
        SELECT id, display_name, abn, domain, status FROM companies
        WHERE status NOT IN ('merged', 'disabled')
        """
    ).fetchall()
    return [
        _existing_company_from_row(row)
        for row in rows
        if normalise_company_name(cast(str, row[1])) == normalised_name
    ]


def _accept(
    connection: psycopg.Connection[tuple[object, ...]],
    existing: ExistingCompany,
    confidence: float,
    method: str,
    candidate: CandidateCompany,
    abn: str | None,
    acn: str | None,
    domain: str | None,
) -> MatchOutcome:
    # Enrichment, per Phase 3's "identity/enrichment source" framing: fill
    # fields the existing record is missing, never overwrite what it
    # already has.
    connection.execute(
        """
        UPDATE companies
        SET abn = COALESCE(abn, %s),
            acn = COALESCE(acn, %s),
            domain = COALESCE(domain, %s),
            careers_url = COALESCE(careers_url, %s)
        WHERE id = %s
        """,
        (abn, acn, domain, candidate.careers_url, existing.id),
    )
    connection.execute(
        """
        INSERT INTO evidence (
          entity_type, entity_id, claim_type, claim_value, source_id, confidence, observed_at
        )
        VALUES ('company', %s, 'identity_match', %s, %s, %s, now())
        """,
        (
            str(existing.id),
            Jsonb({"method": method, "candidate_display_name": candidate.display_name}),
            candidate.source_id,
            confidence,
        ),
    )
    candidate_key = normalise_company_name(candidate.display_name)
    existing_key = normalise_company_name(existing.display_name)
    if candidate_key != existing_key:
        connection.execute(
            """
            INSERT INTO company_aliases (company_id, alias, alias_type, source_id)
            VALUES (%s, %s, 'trading_name', %s)
            ON CONFLICT (company_id, alias, alias_type) DO NOTHING
            """,
            (existing.id, candidate.display_name, candidate.source_id),
        )
    return MatchOutcome("matched", existing.id, confidence, f"matched by {method}")


def _to_review(
    connection: psycopg.Connection[tuple[object, ...]],
    candidate: CandidateCompany,
    matches: list[ExistingCompany],
    method: str,
    reason: str,
) -> MatchOutcome:
    payload = {
        "candidate_display_name": candidate.display_name,
        "candidate_abn": candidate.abn,
        "candidate_acn": candidate.acn,
        "candidate_domain": candidate.domain,
        "match_method": method,
        "candidate_company_ids": [str(match.id) for match in matches],
    }
    connection.execute(
        """
        INSERT INTO review_queue_items (kind, company_id, payload, reason, source_id)
        VALUES ('candidate_match', %s, %s, %s, %s)
        """,
        (matches[0].id, Jsonb(payload), reason, candidate.source_id),
    )
    return MatchOutcome("review", None, 0.0, reason)


def _create(
    connection: psycopg.Connection[tuple[object, ...]],
    candidate: CandidateCompany,
    abn: str | None,
    acn: str | None,
    domain: str | None,
) -> MatchOutcome:
    slug = _unique_slug(connection, candidate.display_name)
    row = connection.execute(
        """
        INSERT INTO companies (slug, display_name, abn, acn, domain, careers_url, status)
        VALUES (%s, %s, %s, %s, %s, %s, 'pending_review')
        RETURNING id
        """,
        (slug, candidate.display_name, abn, acn, domain, candidate.careers_url),
    ).fetchone()
    if row is None:
        raise EmployerIdentityError("companies insert did not return an id")
    return MatchOutcome("created", cast(uuid.UUID, row[0]), 1.0, "no existing match found")


def _unique_slug(connection: psycopg.Connection[tuple[object, ...]], display_name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", display_name.lower()).strip("-") or "company"
    candidate = base
    suffix = 1
    while (
        connection.execute(
            "SELECT 1 FROM companies WHERE slug = %s", (candidate,)
        ).fetchone()
        is not None
    ):
        suffix += 1
        candidate = f"{base}-{suffix}"
    return candidate
