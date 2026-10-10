import {
  jobMatchesProfile,
  type JobForMatch,
  type ProfileForMatch,
} from "../profile/jobMatch";
import {
  ALERT_EVENT_MAX_AGE_HOURS,
  IN_APP_ALERTS_PER_USER_PER_RUN,
  type Queryable,
} from "./policy";

/** Delivery window that marks "this event matched this user's profile". */
export const PROFILE_DELIVERY_WINDOW = "profile";

interface ProfileRow {
  user_id: string | number;
  role_family_key: string | null;
  experience_band: string;
  skill_keys: string[];
  work_style: string;
  work_style_required: boolean;
  locations: string[];
}

interface EventRow {
  id: string;
  payload: {
    roleFamilyKey?: string | null;
    seniority?: string | null;
    remoteType?: string | null;
    locationText?: string | null;
    skillKeys?: string[] | null;
  };
}

export interface ProfileAlertStats {
  profilesConsidered: number;
  alertsCreated: number;
}

/**
 * Creates in-app alerts for users who opted in (candidate_profiles.alert_frequency
 * <> 'never') when a newly found role matches their confirmed profile. The
 * delivery row (window 'profile') doubles as the record the email digest reads,
 * so matching happens once, here, and email only decides *when* to send.
 *
 * Same safety rules as the other alerts: recent events only, replay-safe via
 * notification_deliveries, capped per user per run.
 */
export async function matchEventsToProfiles(
  db: Queryable,
): Promise<ProfileAlertStats> {
  const profiles = await db.query<ProfileRow>(
    `SELECT cp.user_id,
            rf.key AS role_family_key,
            cp.experience_band,
            cp.skill_keys,
            cp.work_style,
            cp.work_style_required,
            cp.locations
     FROM candidate_profiles cp
     LEFT JOIN role_families rf ON rf.id = cp.role_family_id
     WHERE cp.alert_frequency <> 'never'`,
  );
  if (profiles.rows.length === 0) {
    return { profilesConsidered: 0, alertsCreated: 0 };
  }

  const events = await db.query<EventRow>(
    `SELECT id, payload
     FROM events
     WHERE event_type = 'job.first_seen'
       AND occurred_at >= now() - ($1::int * interval '1 hour')
     ORDER BY occurred_at DESC, id`,
    [ALERT_EVENT_MAX_AGE_HOURS],
  );
  if (events.rows.length === 0) {
    return { profilesConsidered: profiles.rows.length, alertsCreated: 0 };
  }

  const delivered = await db.query<{
    user_id: string | number;
    event_id: string;
  }>(
    `SELECT user_id, event_id
     FROM notification_deliveries
     WHERE channel = 'in_app' AND delivery_window = $1
       AND event_id = ANY($2::uuid[])`,
    [PROFILE_DELIVERY_WINDOW, events.rows.map((e) => e.id)],
  );
  const alreadyDelivered = new Set(
    delivered.rows.map((row) => `${Number(row.user_id)}:${row.event_id}`),
  );

  let alertsCreated = 0;
  for (const row of profiles.rows) {
    const userId = Number(row.user_id);
    const profile: ProfileForMatch = {
      roleFamilyKey: row.role_family_key,
      experienceBand: row.experience_band,
      skillKeys: row.skill_keys ?? [],
      workStyle: row.work_style,
      workStyleRequired: row.work_style_required,
      locations: row.locations ?? [],
    };

    const matched: string[] = [];
    for (const event of events.rows) {
      if (matched.length >= IN_APP_ALERTS_PER_USER_PER_RUN) break;
      if (alreadyDelivered.has(`${userId}:${event.id}`)) continue;
      const job: JobForMatch = {
        roleFamilyKey: event.payload.roleFamilyKey ?? null,
        seniority: event.payload.seniority ?? null,
        remoteType: event.payload.remoteType ?? null,
        locationText: event.payload.locationText ?? null,
        skillKeys: event.payload.skillKeys ?? [],
      };
      if (jobMatchesProfile(job, profile)) matched.push(event.id);
    }
    if (matched.length === 0) continue;

    const created = await db.query<{ id: string }>(
      `WITH delivered AS (
         INSERT INTO notification_deliveries (user_id, event_id, channel, delivery_window, status)
         SELECT $1, e, 'in_app', $2, 'sent' FROM unnest($3::uuid[]) AS e
         ON CONFLICT (user_id, event_id, channel, delivery_window) DO NOTHING
         RETURNING event_id
       )
       INSERT INTO user_alerts (user_id, alert_type, title, message, link, entity_type, entity_id)
       SELECT $1,
              'new_job',
              CONCAT(ev.payload ->> 'companyName', ' has a role matching your profile'),
              CONCAT(
                ev.payload ->> 'title',
                COALESCE(CONCAT(' (', ev.payload ->> 'remoteType', ')'), '')
              ),
              CONCAT('/companies/', ev.payload ->> 'companySlug'),
              'company',
              ev.payload ->> 'companyId'
       FROM delivered d
       JOIN events ev ON ev.id = d.event_id
       RETURNING id`,
      [userId, PROFILE_DELIVERY_WINDOW, matched],
    );
    alertsCreated += created.rows.length;
  }

  return { profilesConsidered: profiles.rows.length, alertsCreated };
}
