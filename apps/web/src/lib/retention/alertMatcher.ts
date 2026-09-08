import type { Pool } from "pg";

export interface MatcherStats {
  watchlistAlertsCreated: number;
  savedSearchAlertsCreated: number;
  totalAlertsCreated: number;
}

/**
 * Matches derived change events against user watchlists and saved searches.
 * Enforces PRODUCT_SPEC.md Appendix D.3:
 * - Replay-safe: deduplicated via notification_deliveries (user_id, event_id, channel, delivery_window).
 * - Never delivers duplicate alerts for the same event and delivery window.
 */
export async function matchEventsToSubscribers(
  pool: Pool,
): Promise<MatcherStats> {
  // 1. Match company-watched events (jobs, sponsorship)
  const watchlistCompanyQuery = `
    WITH candidate_matches AS (
      SELECT 
        w.user_id,
        e.id AS event_id,
        e.event_type,
        e.payload,
        e.payload ->> 'companyName' AS company_name,
        e.payload ->> 'companySlug' AS company_slug,
        e.payload ->> 'title' AS job_title,
        e.payload ->> 'remoteType' AS remote_type,
        e.payload ->> 'agreementType' AS agreement_type
      FROM events e
      JOIN watchlists w ON w.entity_type = 'company' 
        AND w.company_id::text = (e.payload ->> 'companyId')
      WHERE e.event_type IN ('job.first_seen', 'sponsorship.evidence_added')
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
        cm.payload ->> 'companyId'
      FROM deliveries d
      JOIN candidate_matches cm ON cm.user_id = d.user_id AND cm.event_id = d.event_id
      RETURNING id
    )
    SELECT count(*)::text as count FROM inserted_alerts;
  `;

  const compResult = await pool.query<{ count: string }>(watchlistCompanyQuery);
  const watchlistAlertsCreated = Number(compResult.rows[0]?.count ?? 0);

  // 2. Match saved searches for job.first_seen events
  const savedSearchQuery = `
    WITH candidate_matches AS (
      SELECT 
        ss.user_id,
        ss.id AS saved_search_id,
        ss.name AS search_name,
        e.id AS event_id,
        e.payload ->> 'companyName' AS company_name,
        e.payload ->> 'companySlug' AS company_slug,
        e.payload ->> 'title' AS job_title,
        e.payload ->> 'remoteType' AS remote_type
      FROM events e
      JOIN saved_searches ss ON true
      WHERE e.event_type = 'job.first_seen'
        AND (
          (ss.filters ->> 'roleFamily') IS NULL 
          OR (ss.filters ->> 'roleFamily') = (e.payload ->> 'roleFamilyKey')
        )
        AND (
          (ss.filters ->> 'remote') IS NULL 
          OR (ss.filters ->> 'remote') = (e.payload ->> 'remoteType')
          OR (ss.filters ->> 'remote' = 'any')
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
    )
    SELECT count(*)::text as count FROM inserted_alerts;
  `;

  const searchResult = await pool.query<{ count: string }>(savedSearchQuery);
  const savedSearchAlertsCreated = Number(searchResult.rows[0]?.count ?? 0);

  return {
    watchlistAlertsCreated,
    savedSearchAlertsCreated,
    totalAlertsCreated: watchlistAlertsCreated + savedSearchAlertsCreated,
  };
}
