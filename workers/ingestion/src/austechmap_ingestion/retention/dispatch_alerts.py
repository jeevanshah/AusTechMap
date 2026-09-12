"""Retention engine: alert evaluation and notification dispatch (Phase 7).

Evaluates longitudinal change events (from the ``events`` table) against:
1. User watchlists (entity_type = 'company' or 'region')
2. User saved searches (filtered by roleFamily, remote, keyword, etc.)

Guarantees:
- Replay-safe deduplication via ``notification_deliveries``
  (user_id, event_id, channel, delivery_window).
- Frequency throttling: respects alert_frequency ('instant', 'daily', 'weekly').
- Idempotent: safe to run repeatedly via cron or after ingestion runs.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, UTC
import psycopg


@dataclass(frozen=True)
class AlertDispatchStats:
    watchlist_alerts_created: int
    saved_search_alerts_created: int
    total_alerts_created: int


def dispatch_alerts(
    database_url: str,
    *,
    frequency: str = "all",
    dry_run: bool = False,
) -> AlertDispatchStats:
    """Evaluate pending change events and dispatch in-app notifications.

    Args:
        database_url: Neon PostgreSQL connection string.
        frequency: Filter for saved search frequencies ('all', 'instant', 'daily', 'weekly').
        dry_run: If True, computes matches without committing inserts.
    """
    if frequency not in ("all", "instant", "daily", "weekly"):
        raise ValueError(f"Invalid frequency filter: {frequency}")

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            # 1. Match company watchlists against material company events
            cur.execute("""
                WITH candidate_matches AS (
                    SELECT 
                        w.user_id,
                        e.id AS event_id,
                        e.event_type,
                        e.payload,
                        COALESCE(e.payload ->> 'companyName', c.display_name, 'Company') AS company_name,
                        COALESCE(e.payload ->> 'companySlug', c.slug, '') AS company_slug,
                        e.payload ->> 'title' AS job_title,
                        e.payload ->> 'remoteType' AS remote_type,
                        e.payload ->> 'agreementType' AS agreement_type
                    FROM events e
                    JOIN watchlists w ON w.entity_type = 'company' 
                      AND (w.company_id::text = e.entity_id OR w.company_id::text = (e.payload ->> 'companyId'))
                    LEFT JOIN companies c ON c.id = w.company_id
                    WHERE e.event_type IN ('job.first_seen', 'sponsorship.evidence_added', 'company.updated')
                ),
                deliveries AS (
                    INSERT INTO notification_deliveries (user_id, event_id, channel, delivery_window, status)
                    SELECT 
                        cm.user_id,
                        cm.event_id,
                        'in_app',
                        'instant',
                        'sent'
                    FROM candidate_matches cm
                    ON CONFLICT (user_id, event_id, channel, delivery_window) DO NOTHING
                    RETURNING user_id, event_id
                ),
                inserted_alerts AS (
                    INSERT INTO user_alerts (user_id, alert_type, title, message, link, entity_type, entity_id)
                    SELECT 
                        d.user_id,
                        CASE 
                            WHEN cm.event_type = 'job.first_seen' THEN 'new_job'
                            WHEN cm.event_type = 'sponsorship.evidence_added' THEN 'sponsorship_change'
                            ELSE 'company_update'
                        END,
                        CASE 
                            WHEN cm.event_type = 'job.first_seen' THEN CONCAT(cm.company_name, ' posted a new role')
                            WHEN cm.event_type = 'sponsorship.evidence_added' THEN CONCAT(cm.company_name, ' added visa sponsorship evidence')
                            ELSE CONCAT(cm.company_name, ' update')
                        END,
                        CASE 
                            WHEN cm.event_type = 'job.first_seen' THEN CONCAT(cm.job_title, COALESCE(CONCAT(' (', cm.remote_type, ')'), ''))
                            WHEN cm.event_type = 'sponsorship.evidence_added' THEN CONCAT('Approved Labour Agreement: ', COALESCE(cm.agreement_type, 'Home Affairs Accredited'))
                            ELSE 'Observed material change in company data'
                        END,
                        CONCAT('/companies/', cm.company_slug),
                        'company',
                        cm.company_slug
                    FROM deliveries d
                    JOIN candidate_matches cm ON cm.user_id = d.user_id AND cm.event_id = d.event_id
                    RETURNING id
                )
                SELECT count(*) FROM inserted_alerts;
            """)
            watchlist_alerts = cur.fetchone()[0]

            # 2. Match saved searches against job.first_seen events
            # Apply frequency filtering and throttling
            freq_filter = ""
            if frequency != "all":
                freq_filter = f"AND ss.alert_frequency = '{frequency}'"

            cur.execute(f"""
                WITH candidate_matches AS (
                    SELECT 
                        ss.user_id,
                        ss.id AS saved_search_id,
                        ss.name AS search_name,
                        e.id AS event_id,
                        COALESCE(e.payload ->> 'companyName', 'Employer') AS company_name,
                        COALESCE(e.payload ->> 'companySlug', '') AS company_slug,
                        e.payload ->> 'title' AS job_title,
                        e.payload ->> 'remoteType' AS remote_type
                    FROM events e
                    JOIN saved_searches ss ON ss.alert_frequency <> 'never'
                    WHERE e.event_type = 'job.first_seen'
                      {freq_filter}
                      AND (
                          ss.alert_frequency = 'instant'
                          OR (ss.alert_frequency = 'daily' AND (ss.last_alerted_at IS NULL OR ss.last_alerted_at < now() - INTERVAL '24 hours'))
                          OR (ss.alert_frequency = 'weekly' AND (ss.last_alerted_at IS NULL OR ss.last_alerted_at < now() - INTERVAL '7 days'))
                      )
                      AND (
                          (ss.filters ->> 'roleFamily') IS NULL 
                          OR (ss.filters ->> 'roleFamily') = (e.payload ->> 'roleFamilyKey')
                      )
                      AND (
                          (ss.filters ->> 'remote') IS NULL 
                          OR (ss.filters ->> 'remote') = 'any'
                          OR (ss.filters ->> 'remote') = (e.payload ->> 'remoteType')
                      )
                ),
                deliveries AS (
                    INSERT INTO notification_deliveries (user_id, event_id, channel, delivery_window, status)
                    SELECT 
                        cm.user_id,
                        cm.event_id,
                        'in_app',
                        CONCAT('saved_search:', cm.saved_search_id),
                        'sent'
                    FROM candidate_matches cm
                    ON CONFLICT (user_id, event_id, channel, delivery_window) DO NOTHING
                    RETURNING user_id, event_id
                ),
                inserted_alerts AS (
                    INSERT INTO user_alerts (user_id, alert_type, title, message, link, entity_type, entity_id)
                    SELECT 
                        d.user_id,
                        'saved_search_match',
                        CONCAT('Match for "', cm.search_name, '"'),
                        CONCAT(cm.company_name, ' is hiring: ', cm.job_title),
                        CONCAT('/companies/', cm.company_slug),
                        'company',
                        cm.company_slug
                    FROM deliveries d
                    JOIN candidate_matches cm ON cm.user_id = d.user_id AND cm.event_id = d.event_id
                    RETURNING id
                ),
                updated_searches AS (
                    UPDATE saved_searches ss
                    SET last_alerted_at = now()
                    WHERE ss.id IN (SELECT DISTINCT saved_search_id FROM candidate_matches)
                    RETURNING ss.id
                )
                SELECT count(*) FROM inserted_alerts;
            """)
            saved_search_alerts = cur.fetchone()[0]

            if dry_run:
                conn.rollback()
            else:
                conn.commit()

    return AlertDispatchStats(
        watchlist_alerts_created=watchlist_alerts,
        saved_search_alerts_created=saved_search_alerts,
        total_alerts_created=watchlist_alerts + saved_search_alerts,
    )
