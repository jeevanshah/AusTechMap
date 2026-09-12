from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import cast

import psycopg
import pytest

from austechmap_ingestion.db.migrations import apply_migrations
from austechmap_ingestion.retention.dispatch_alerts import (
    AlertDispatchStats,
    dispatch_alerts,
)
from austechmap_ingestion.__main__ import build_parser

REPOSITORY_ROOT = Path(__file__).parents[3]
MIGRATIONS_DIRECTORY = REPOSITORY_ROOT / "db" / "migrations"


def _database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is not configured")
    apply_migrations(database_url, MIGRATIONS_DIRECTORY)
    return database_url


def test_dispatch_alerts_invalid_frequency() -> None:
    with pytest.raises(ValueError, match="Invalid frequency filter"):
        dispatch_alerts("dummy-url", frequency="invalid_freq")


def test_build_parser_dispatch_alerts() -> None:
    parser = build_parser()
    args = parser.parse_args(["dispatch-alerts", "--frequency", "daily", "--dry-run"])
    assert args.command == "dispatch-alerts"
    assert args.frequency == "daily"
    assert args.dry_run is True


@pytest.mark.integration
def test_dispatch_alerts_end_to_end() -> None:
    database_url = _database_url()
    suffix = uuid.uuid4().hex

    with psycopg.connect(database_url, autocommit=True) as conn:
        # Create test user
        user_row = conn.execute(
            "INSERT INTO users (name, email, role, status) VALUES (%s, %s, 'user', 'active') RETURNING id",
            (f"Alert User {suffix}", f"user-{suffix}@example.com"),
        ).fetchone()
        assert user_row is not None
        user_id = user_row[0]

        # Create test company
        comp_row = conn.execute(
            "INSERT INTO companies (slug, display_name, domain) VALUES (%s, %s, %s) RETURNING id",
            (f"alert-co-{suffix}", f"Alert Co {suffix}", f"alert-{suffix}.example.com"),
        ).fetchone()
        assert comp_row is not None
        company_id = comp_row[0]

        # Create test user watchlist for this company
        conn.execute(
            """
            INSERT INTO watchlists (user_id, entity_type, company_id)
            VALUES (%s, 'company', %s)
            """,
            (user_id, company_id),
        )

        # Create test user saved search
        search_row = conn.execute(
            """
            INSERT INTO saved_searches (user_id, name, filters, alert_frequency)
            VALUES (%s, 'Frontend Devs', '{"roleFamily": "software-engineering", "remote": "any"}', 'instant')
            RETURNING id
            """,
            (user_id,),
        ).fetchone()
        assert search_row is not None
        saved_search_id = search_row[0]

        # Create two events:
        # 1. job.first_seen matching company watchlist and saved search
        event1_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO events (id, dedupe_key, event_type, entity_type, entity_id, payload)
            VALUES (%s, %s, 'job.first_seen', 'job', %s, %s)
            """,
            (
                event1_id,
                f"job-seen-{suffix}",
                str(uuid.uuid4()),
                psycopg.types.json.Json({
                    "companyId": str(company_id),
                    "companySlug": f"alert-co-{suffix}",
                    "companyName": f"Alert Co {suffix}",
                    "title": "Senior Frontend Engineer",
                    "roleFamilyKey": "software-engineering",
                    "remoteType": "hybrid",
                }),
            ),
        )

        # 2. sponsorship.evidence_added matching company watchlist
        event2_id = str(uuid.uuid4())
        conn.execute(
            """
            INSERT INTO events (id, dedupe_key, event_type, entity_type, entity_id, payload)
            VALUES (%s, %s, 'sponsorship.evidence_added', 'company', %s, %s)
            """,
            (
                event2_id,
                f"sponsorship-{suffix}",
                str(company_id),
                psycopg.types.json.Json({
                    "companyId": str(company_id),
                    "companySlug": f"alert-co-{suffix}",
                    "companyName": f"Alert Co {suffix}",
                    "agreementType": "Company-Specific Labour Agreement",
                }),
            ),
        )

    # 1. Test Dry Run: should report matches but not persist alerts
    stats_dry = dispatch_alerts(database_url, dry_run=True)
    assert stats_dry.watchlist_alerts_created >= 2
    assert stats_dry.saved_search_alerts_created >= 1

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM user_alerts WHERE user_id = %s", (user_id,))
            assert cur.fetchone()[0] == 0

    # 2. Test Live Run: should persist alerts and record notification deliveries
    stats_live = dispatch_alerts(database_url, dry_run=False)
    assert stats_live.watchlist_alerts_created >= 2
    assert stats_live.saved_search_alerts_created >= 1

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT alert_type, title, link FROM user_alerts WHERE user_id = %s ORDER BY created_at",
                (user_id,),
            )
            alerts = cur.fetchall()
            assert len(alerts) >= 3
            alert_types = {a[0] for a in alerts}
            assert "new_job" in alert_types
            assert "sponsorship_change" in alert_types
            assert "saved_search_match" in alert_types

    # 3. Test Deduplication: running again must generate 0 alerts for the same events
    stats_dedup = dispatch_alerts(database_url, dry_run=False)
    assert stats_dedup.watchlist_alerts_created == 0
    assert stats_dedup.saved_search_alerts_created == 0
    assert stats_dedup.total_alerts_created == 0
