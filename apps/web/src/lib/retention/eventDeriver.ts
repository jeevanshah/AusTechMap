import type { Queryable } from "./policy";
import {
  ALERT_EVENT_MAX_AGE_HOURS,
  BASELINE_GRACE_MINUTES,
  DERIVE_POSTED_MAX_AGE_DAYS,
} from "./policy";

export interface EventDerivationStats {
  jobsDerived: number;
  sponsorshipDerived: number;
  locationsDerived: number;
  totalDerived: number;
}

/**
 * Derives longitudinal, versioned change events from primary tables.
 * Guaranteed idempotent via stable dedupe_key unique constraints.
 * Adheres to PRODUCT_SPEC.md Appendix D.2.
 */
export async function deriveChangeEvents(
  pool: Queryable,
): Promise<EventDerivationStats> {
  // 1. Derive job.first_seen events.
  // Only genuinely new roles: recent, not a repost of an old posting, and not
  // part of the source's baseline crawl (first_seen_at is OUR crawl time, so a
  // newly onboarded employer's whole backlog would otherwise look new).
  const jobResult = await pool.query<{ count: string }>(
    `
    WITH inserted AS (
      INSERT INTO events (event_type, entity_type, entity_id, dedupe_key, payload, occurred_at, event_version)
      SELECT 
        'job.first_seen',
        'job',
        j.id::text,
        'job:first_seen:' || j.id::text,
        jsonb_build_object(
          'jobId', j.id,
          'companyId', c.id,
          'companyName', c.display_name,
          'companySlug', c.slug,
          'title', j.title,
          'roleFamilyKey', rf.key,
          'roleFamilyLabel', rf.label,
          'remoteType', j.remote_type::text,
          'locationText', j.location_text,
          'sourceUrl', j.source_url
        ),
        j.first_seen_at,
        1
      FROM jobs j
      JOIN companies c ON c.id = j.company_id
      LEFT JOIN role_families rf ON rf.id = j.role_family_id
      WHERE j.expired_at IS NULL
        AND j.first_seen_at >= now() - ($1::int * interval '1 hour')
        AND (
          j.posted_at IS NULL
          OR j.posted_at >= now() - ($2::int * interval '1 day')
        )
        AND j.first_seen_at > (
          SELECT MIN(base.first_seen_at)
          FROM jobs base
          WHERE base.company_id = j.company_id
            AND base.source_system = j.source_system
        ) + ($3::int * interval '1 minute')
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING id
    )
    SELECT count(*)::text as count FROM inserted;
  `,
    [
      ALERT_EVENT_MAX_AGE_HOURS,
      DERIVE_POSTED_MAX_AGE_DAYS,
      BASELINE_GRACE_MINUTES,
    ],
  );
  const jobsDerived = Number(jobResult.rows[0]?.count ?? 0);

  // 2. Derive sponsorship.evidence_added events
  const sponResult = await pool.query<{ count: string }>(`
    WITH inserted AS (
      INSERT INTO events (event_type, entity_type, entity_id, dedupe_key, payload, occurred_at, event_version)
      SELECT 
        'sponsorship.evidence_added',
        'company',
        e.entity_id,
        'sponsorship:added:' || e.id::text,
        jsonb_build_object(
          'evidenceId', e.id,
          'companyId', c.id,
          'companyName', c.display_name,
          'companySlug', c.slug,
          'claimType', e.claim_type,
          'agreementType', e.claim_value ->> 'agreement_type',
          'holderName', e.claim_value ->> 'holder_name'
        ),
        e.observed_at,
        1
      FROM evidence e
      JOIN companies c ON c.id::text = e.entity_id
      WHERE e.entity_type = 'company'
        AND e.claim_type = 'sponsorship_labour_agreement'
        AND e.status = 'active'
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING id
    )
    SELECT count(*)::text as count FROM inserted;
  `);
  const sponsorshipDerived = Number(sponResult.rows[0]?.count ?? 0);

  // 3. Derive company.location_added events
  const locResult = await pool.query<{ count: string }>(`
    WITH inserted AS (
      INSERT INTO events (event_type, entity_type, entity_id, dedupe_key, payload, occurred_at, event_version)
      SELECT 
        'company.location_added',
        'company',
        c.id::text,
        'company:location:' || cl.id::text,
        jsonb_build_object(
          'companyId', c.id,
          'companyName', c.display_name,
          'companySlug', c.slug,
          'address', rl.input_text,
          'sa4Code', sa4.code,
          'sa4Name', sa4.name,
          'isRegional', (rl.migration_category IS NOT NULL)
        ),
        cl.created_at,
        1
      FROM company_locations cl
      JOIN companies c ON c.id = cl.company_id
      JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
      LEFT JOIN regions sa4 ON sa4.id = rl.sa4_region_id
      ON CONFLICT (dedupe_key) DO NOTHING
      RETURNING id
    )
    SELECT count(*)::text as count FROM inserted;
  `);
  const locationsDerived = Number(locResult.rows[0]?.count ?? 0);

  return {
    jobsDerived,
    sponsorshipDerived,
    locationsDerived,
    totalDerived: jobsDerived + sponsorshipDerived + locationsDerived,
  };
}
