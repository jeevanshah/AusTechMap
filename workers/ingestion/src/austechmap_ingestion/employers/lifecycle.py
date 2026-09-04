"""Company lifecycle actions: merge, verify, disable, and review resolution.

Every mutation here writes an audit_records row (Phase 1's existing
append-only audit table — see db/migrations/0002), satisfying
ARCHITECTURE_DECISIONS.md section 4.1's "every role change / staff
mutation writes an immutable audit record" for the company-management
actions Phase 3 adds. None of this enforces the role/MFA requirements
that same section describes, because no auth system exists in the web
app yet to enforce them against — see the admin/geography page's
documented interim-state note in ARCHITECTURE_DECISIONS.md section 4.1
and IMPLEMENTATION_PLAN.md for the same caveat applied here.

Merging never deletes a row or rewrites another table's foreign keys —
a merged company keeps existing with status='merged' and
merged_into_company_id set, so every alias/location/evidence/review row
that already pointed at it keeps working through that redirect, per
Phase 3's "preserve aliases, evidence, and audit history through merges."
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal, cast

import psycopg
from psycopg.types.json import Jsonb

from austechmap_ingestion.employers.matching import (
    CandidateCompany,
    EmployerIdentityError,
    MatchOutcome,
    _accept,
    _create,
    _existing_company_from_row,
)
from austechmap_ingestion.employers.normalisation import normalise_abn, normalise_acn


def _audit(
    connection: psycopg.Connection[tuple[object, ...]],
    *,
    actor_user_id: int,
    action: str,
    target_id: uuid.UUID,
    reason: str | None,
    before_state: dict[str, Any] | None,
    after_state: dict[str, Any] | None,
) -> None:
    connection.execute(
        """
        INSERT INTO audit_records (
          actor_type, actor_id, action, target_type, target_id,
          reason, before_state, after_state, request_id
        )
        VALUES ('user', %s, %s, 'company', %s, %s, %s, %s, %s)
        """,
        (
            str(actor_user_id),
            action,
            str(target_id),
            reason,
            Jsonb(before_state) if before_state is not None else None,
            Jsonb(after_state) if after_state is not None else None,
            uuid.uuid4().hex,
        ),
    )


def _fetch_company(
    connection: psycopg.Connection[tuple[object, ...]], company_id: uuid.UUID
) -> dict[str, Any] | None:
    row = connection.execute(
        """
        SELECT id, slug, display_name, abn, acn, domain, careers_url, status,
               merged_into_company_id, disabled_reason, verified_at
        FROM companies WHERE id = %s
        """,
        (company_id,),
    ).fetchone()
    if row is None:
        return None
    return {
        "id": str(row[0]),
        "slug": row[1],
        "display_name": row[2],
        "abn": row[3],
        "acn": row[4],
        "domain": row[5],
        "careers_url": row[6],
        "status": row[7],
        "merged_into_company_id": str(row[8]) if row[8] else None,
        "disabled_reason": row[9],
        "verified_at": cast(datetime, row[10]).isoformat() if row[10] else None,
    }


def merge_companies(
    database_url: str,
    *,
    source_company_id: uuid.UUID,
    target_company_id: uuid.UUID,
    actor_user_id: int,
    reason: str,
) -> None:
    if source_company_id == target_company_id:
        raise EmployerIdentityError("cannot merge a company into itself")

    with psycopg.connect(database_url) as connection:
        source = _fetch_company(connection, source_company_id)
        target = _fetch_company(connection, target_company_id)
        if source is None:
            raise EmployerIdentityError(f"source company not found: {source_company_id}")
        if target is None:
            raise EmployerIdentityError(f"target company not found: {target_company_id}")
        if source["status"] == "merged":
            raise EmployerIdentityError(f"source company is already merged: {source_company_id}")
        if target["status"] == "merged":
            raise EmployerIdentityError(
                f"target company is itself merged — merge into "
                f"{target['merged_into_company_id']} instead: {target_company_id}"
            )

        connection.execute(
            "UPDATE companies SET status = 'merged', merged_into_company_id = %s WHERE id = %s",
            (target_company_id, source_company_id),
        )
        after = {**source, "status": "merged", "merged_into_company_id": str(target_company_id)}
        _audit(
            connection,
            actor_user_id=actor_user_id,
            action="company_merged",
            target_id=source_company_id,
            reason=reason,
            before_state=source,
            after_state=after,
        )


def verify_company(database_url: str, *, company_id: uuid.UUID, actor_user_id: int) -> None:
    with psycopg.connect(database_url) as connection:
        before = _fetch_company(connection, company_id)
        if before is None:
            raise EmployerIdentityError(f"company not found: {company_id}")
        connection.execute(
            "UPDATE companies SET verified_at = now() WHERE id = %s", (company_id,)
        )
        after = _fetch_company(connection, company_id)
        _audit(
            connection,
            actor_user_id=actor_user_id,
            action="company_verified",
            target_id=company_id,
            reason=None,
            before_state=before,
            after_state=after,
        )


def disable_company(
    database_url: str, *, company_id: uuid.UUID, actor_user_id: int, reason: str
) -> None:
    with psycopg.connect(database_url) as connection:
        before = _fetch_company(connection, company_id)
        if before is None:
            raise EmployerIdentityError(f"company not found: {company_id}")
        if before["status"] == "merged":
            raise EmployerIdentityError(f"cannot disable a merged company: {company_id}")
        connection.execute(
            """
            UPDATE companies
            SET status = 'disabled', disabled_reason = %s, disabled_at = now()
            WHERE id = %s
            """,
            (reason, company_id),
        )
        after = {**before, "status": "disabled", "disabled_reason": reason}
        _audit(
            connection,
            actor_user_id=actor_user_id,
            action="company_disabled",
            target_id=company_id,
            reason=reason,
            before_state=before,
            after_state=after,
        )


@dataclass(frozen=True)
class ReviewResolution:
    outcome: MatchOutcome | None


def resolve_review_item(
    database_url: str,
    *,
    review_item_id: uuid.UUID,
    decision: Literal["approved", "rejected"],
    actor_user_id: int,
    matched_company_id: uuid.UUID | None = None,
) -> ReviewResolution:
    """Resolve one pending review_queue_items row.

    On 'rejected', just closes the item — nothing about the candidate is
    written to `companies`. On 'approved', matched_company_id says what the
    reviewer decided: pointing it at an existing company enriches that
    company from the stored candidate payload (the same enrichment
    matching.match_or_create_company does for an automatic match); leaving
    it None means the reviewer decided this really is a new company, which
    gets created from the same payload.
    """
    with psycopg.connect(database_url) as connection:
        row = connection.execute(
            "SELECT status, payload, source_id FROM review_queue_items WHERE id = %s",
            (review_item_id,),
        ).fetchone()
        if row is None:
            raise EmployerIdentityError(f"review item not found: {review_item_id}")
        status, payload, source_id = row
        if status != "pending":
            raise EmployerIdentityError(f"review item already resolved: {review_item_id}")

        outcome: MatchOutcome | None = None
        if decision == "approved":
            candidate = CandidateCompany(
                display_name=cast(str, payload["candidate_display_name"]),
                source_id=cast(uuid.UUID, source_id),
                abn=cast("str | None", payload.get("candidate_abn")),
                acn=cast("str | None", payload.get("candidate_acn")),
                domain=cast("str | None", payload.get("candidate_domain")),
            )
            if matched_company_id is not None:
                existing_row = connection.execute(
                    "SELECT id, display_name, abn, domain, status FROM companies WHERE id = %s",
                    (matched_company_id,),
                ).fetchone()
                if existing_row is None:
                    raise EmployerIdentityError(f"company not found: {matched_company_id}")
                existing = _existing_company_from_row(existing_row)
                abn = normalise_abn(candidate.abn) if candidate.abn else None
                acn = normalise_acn(candidate.acn) if candidate.acn else None
                domain_value = candidate.domain
                outcome = _accept(
                    connection, existing, 1.0, "review", candidate, abn, acn, domain_value
                )
            else:
                abn = normalise_abn(candidate.abn) if candidate.abn else None
                acn = normalise_acn(candidate.acn) if candidate.acn else None
                outcome = _create(connection, candidate, abn, acn, candidate.domain)

        connection.execute(
            """
            UPDATE review_queue_items
            SET status = %s, reviewed_by_user_id = %s, reviewed_at = now()
            WHERE id = %s
            """,
            (decision, actor_user_id, review_item_id),
        )
        return ReviewResolution(outcome)
