"""Audited promotion of evidence-backed ambiguous location records."""

from __future__ import annotations

import uuid
from pathlib import Path

import psycopg
from psycopg.types.json import Jsonb

from austechmap_ingestion.employers.geocoding import geocode_address_nominatim
from austechmap_ingestion.employers.locations_seed import _query_text, load_address_fixture


def promote_evidenced_locations(database_url: str, fixture_path: Path, actor_id: str) -> int:
    """Promote only fixture-linked ambiguous rows that already have a point.

    This intentionally refuses to invent a point: fresh geocoding belongs in
    the caller before this state transition.
    """
    candidates = load_address_fixture(fixture_path)
    promoted = 0
    with psycopg.connect(database_url) as connection:
        for candidate in candidates:
            query = _query_text(candidate)
            row = connection.execute(
                """SELECT rl.id
                FROM companies c JOIN company_locations cl ON cl.company_id=c.id
                JOIN resolved_locations rl ON rl.id=cl.resolved_location_id
                WHERE c.domain=%s AND cl.raw_address=%s AND rl.status='ambiguous'
                LIMIT 1""",
                (candidate.domain, query),
            ).fetchone()
            if row is None:
                continue
            geocoded = geocode_address_nominatim("", query)
            updated = connection.execute(
                """UPDATE resolved_locations
                SET status='accepted', method='external_geocoder',
                    point=ST_SetSRID(ST_MakePoint(%s,%s),4326)
                WHERE id=%s AND status='ambiguous' RETURNING id""",
                (geocoded.longitude, geocoded.latitude, row[0]),
            ).fetchone()
            if updated is None:
                continue
            connection.execute(
                """INSERT INTO audit_records (actor_type,actor_id,action,target_type,target_id,reason,before_state,after_state,metadata,request_id)
                VALUES ('system',%s,'location_promoted_evidence_backed','resolved_location',%s,%s,%s,%s,%s,%s)""",
                (actor_id, str(row[0]), 'first-party fixture evidence revalidated',
                 Jsonb({'status':'ambiguous'}),
                 Jsonb({'status':'accepted','longitude':geocoded.longitude,'latitude':geocoded.latitude}),
                 Jsonb({'fixture':fixture_path.name,'domain':candidate.domain,'source_url':candidate.source_url}), uuid.uuid4().hex),
            )
            promoted += 1
    return promoted
