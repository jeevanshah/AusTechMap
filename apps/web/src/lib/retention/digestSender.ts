import type { Queryable } from "./policy.ts";
import {
  createUnsubscribeToken,
  unsubscribeSecret,
} from "./unsubscribeToken.ts";
import type { DigestItem } from "@austechmap/contracts";
import {
  DIGEST_LOOKBACK_HOURS,
  DIGEST_MAX_ITEMS,
  INSTANT_EMAILS_PER_DAY,
} from "./policy.ts";

export interface DigestOptions {
  frequency: "daily" | "weekly" | "instant";
  dryRun?: boolean;
  targetUserEmail?: string;
  /** Injected for tests. */
  now?: Date;
  fetchImpl?: typeof fetch;
}

export interface DigestSendResult {
  usersProcessed: number;
  emailsSent: number;
  /** Dry run only: emails that would have been sent. Nothing is recorded. */
  emailsWouldSend: number;
  eventsDelivered: number;
  errors: string[];
}

/** Job titles and employer names come from third-party ATS data: never trust them as HTML. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeLink(link: string, appUrl: string): string {
  if (link.startsWith("/")) return `${appUrl}${link}`;
  return link.startsWith("https://") ? link : appUrl;
}

export function renderDigestHtml(params: {
  userName?: string;
  frequency: "daily" | "weekly" | "instant";
  items: DigestItem[];
  unsubscribeUrl: string;
  appUrl: string;
}): string {
  const { frequency, items, unsubscribeUrl, appUrl } = params;
  const headline =
    frequency === "weekly"
      ? "Weekly Australian Tech Opportunity Digest"
      : frequency === "daily"
        ? "Daily Australian Tech Opportunity Digest"
        : "New Tech Opportunity Match Alert";

  const itemsHtml = items
    .map(
      (item) => `
    <tr style="border-bottom: 1px solid #e2e8f0;">
      <td style="padding: 16px 0;">
        <div style="margin-bottom: 4px;">
          ${
            item.badge
              ? `<span style="display: inline-block; background-color: #ffedd5; color: #9a3412; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 9999px; border: 1px solid #fed7aa; margin-right: 6px;">${escapeHtml(item.badge)}</span>`
              : ""
          }
          <span style="font-size: 15px; font-weight: 700; color: #0f172a;">
            ${escapeHtml(item.title)}
          </span>
        </div>
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #475569; line-height: 1.5;">
          ${escapeHtml(item.description)}
        </p>
        <a href="${escapeHtml(safeLink(item.link, appUrl))}" style="font-size: 12px; font-weight: 600; color: #c2410c; text-decoration: none;">
          View details on Australia Tech Map &rarr;
        </a>
      </td>
    </tr>
  `,
    )
    .join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${headline}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #0f172a; margin: 0; padding: 24px;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
    <!-- Header -->
    <tr>
      <td style="background-color: #0f172a; padding: 24px; text-align: left;">
        <table role="presentation" border="0" cellspacing="0" cellpadding="0">
          <tr>
            <td style="background-color: #c2410c; color: #ffffff; font-weight: 800; font-size: 14px; width: 32px; height: 32px; text-align: center; border-radius: 6px;">AU</td>
            <td style="padding-left: 12px; color: #ffffff; font-size: 16px; font-weight: 700;">Australia Tech Map</td>
          </tr>
        </table>
        <h1 style="color: #ffffff; font-size: 20px; font-weight: 700; margin: 16px 0 4px 0;">${headline}</h1>
        <p style="color: #94a3b8; font-size: 13px; margin: 0;">Verified hiring, role, and sponsorship evidence updates</p>
      </td>
    </tr>

    <!-- Body -->
    <tr>
      <td style="padding: 24px;">
        <p style="font-size: 14px; color: #334155; line-height: 1.5; margin-top: 0;">
          Here are the latest material updates matching your watched employers and saved search criteria:
        </p>
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0">
          ${itemsHtml}
        </table>
        <div style="margin-top: 24px; text-align: center;">
          <a href="${escapeHtml(appUrl)}/account" style="display: inline-block; background-color: #c2410c; color: #ffffff; font-size: 13px; font-weight: 600; text-decoration: none; padding: 10px 20px; border-radius: 8px;">
            Open Your Account Hub
          </a>
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #f1f5f9; padding: 18px 24px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; line-height: 1.5;">
        You received this email because you saved searches or watched employers on Australia Tech Map.<br>
        <a href="${escapeHtml(unsubscribeUrl)}" style="color: #64748b; text-decoration: underline;">Manage notification preferences or unsubscribe</a>.
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/** ISO-8601 week key, e.g. "2026-W41". */
export function isoWeekKey(date: Date): string {
  const d = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const dayNumber = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNumber); // Thursday of this ISO week
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

interface DigestEvent {
  eventId: string;
  eventType: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

interface DigestGroup {
  item: DigestItem;
  eventIds: string[];
}

/** One item per sponsorship event; one item per employer for new roles. */
export function groupDigestEvents(events: DigestEvent[]): DigestGroup[] {
  const groups: Array<DigestGroup | null> = [];
  const jobGroups = new Map<string, { events: DigestEvent[]; index: number }>();

  for (const event of events) {
    const companyName = String(event.payload.companyName ?? "Company");
    const companySlug = String(event.payload.companySlug ?? "");

    if (event.eventType === "sponsorship.evidence_added") {
      groups.push({
        item: {
          title: `${companyName} added visa sponsorship evidence`,
          description: `Approved Home Affairs agreement: ${String(event.payload.agreementType ?? "Accredited")}`,
          link: `/companies/${companySlug}`,
          badge: "Sponsorship Evidence",
        },
        eventIds: [event.eventId],
      });
      continue;
    }

    const existing = jobGroups.get(companySlug);
    if (existing) {
      existing.events.push(event);
    } else {
      jobGroups.set(companySlug, { events: [event], index: groups.length });
      groups.push(null); // filled below once the employer's roles are known
    }
  }

  for (const [companySlug, { events: jobEvents, index }] of jobGroups) {
    const first = jobEvents[0];
    const companyName = String(first?.payload.companyName ?? "Company");
    const titles = jobEvents.map((e) => String(e.payload.title ?? "New role"));
    const remote = first?.payload.remoteType
      ? ` (${String(first.payload.remoteType)})`
      : "";

    groups[index] = {
      item:
        jobEvents.length === 1
          ? {
              title: `${companyName} is hiring: ${titles[0]}`,
              description: `New role${remote} seen on the official company careers board.`,
              link: `/companies/${companySlug}`,
              badge: "New Role",
            }
          : {
              title: `${companyName} posted ${jobEvents.length} new roles`,
              description:
                titles.slice(0, 5).join("; ") +
                (titles.length > 5 ? `; and ${titles.length - 5} more` : ""),
              link: `/companies/${companySlug}`,
              badge: "New Roles",
            },
      eventIds: jobEvents.map((e) => e.eventId),
    };
  }

  return groups.filter((g): g is DigestGroup => g !== null);
}

/**
 * Delivers batched email digests to subscribers via Resend REST API.
 *
 * Safety (PRODUCT_SPEC §18.5 / Appendix D.3):
 * - An event is emailed to a user at most once, whichever window it falls in.
 * - Only events inside the frequency's lookback are considered, so history
 *   never floods a new subscriber.
 * - Daily/weekly: one digest per user per window; instant: capped per day.
 * - Delivery rows are written only after Resend accepted the email. A dry run
 *   or a missing API key records nothing.
 * - Users in email_suppressions (unsubscribed/bounced/complaint) are never
 *   emailed, and every email carries a signed one-click unsubscribe link plus
 *   List-Unsubscribe headers; without AUTH_SECRET nothing is sent.
 * - Muted watchlist entries are skipped. Watchlist events travel in the daily
 *   digest (watchlists have no frequency of their own).
 */
export async function sendEmailDigests(
  pool: Queryable,
  options: DigestOptions,
): Promise<DigestSendResult> {
  const { frequency, dryRun = false, targetUserEmail } = options;
  const now = options.now ?? new Date();
  const doFetch = options.fetchImpl ?? fetch;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const resendApiKey =
    process.env.AUTH_RESEND_KEY ?? process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.AUTH_RESEND_FROM ??
    process.env.RESEND_FROM ??
    "onboarding@resend.dev";

  const result: DigestSendResult = {
    usersProcessed: 0,
    emailsSent: 0,
    emailsWouldSend: 0,
    eventsDelivered: 0,
    errors: [],
  };

  if (!dryRun && !resendApiKey) {
    result.errors.push(
      "AUTH_RESEND_KEY is not configured; no emails were sent and nothing was recorded as delivered.",
    );
    return result;
  }

  const secret = unsubscribeSecret();
  if (!dryRun && !secret) {
    result.errors.push(
      "AUTH_SECRET is not configured; refusing to send emails without a working unsubscribe link.",
    );
    return result;
  }

  const dateStr = now.toISOString().slice(0, 10);
  const windowKey =
    frequency === "weekly"
      ? `weekly:${isoWeekKey(now)}`
      : frequency === "instant"
        ? `instant:${now.toISOString().slice(0, 16)}`
        : `daily:${dateStr}`;

  const query = `
    WITH candidate_events AS (
      SELECT
        u.id AS user_id,
        u.email AS user_email,
        e.id AS event_id,
        e.event_type,
        e.payload,
        e.occurred_at
      FROM users u
      JOIN saved_searches ss ON ss.user_id = u.id AND ss.alert_frequency = $1
      JOIN events e ON e.event_type = 'job.first_seen'
        AND (
          (ss.filters ->> 'roleFamily') IS NULL
          OR (ss.filters ->> 'roleFamily') = (e.payload ->> 'roleFamilyKey')
        )
        AND (
          (ss.filters ->> 'remote') IS NULL
          OR (ss.filters ->> 'remote') = 'any'
          OR (ss.filters ->> 'remote') = (e.payload ->> 'remoteType')
        )
      WHERE ($2::text IS NULL OR u.email = $2)
        AND e.occurred_at >= $4::timestamptz - ($5::int * interval '1 hour')

      UNION

      SELECT
        u.id AS user_id,
        u.email AS user_email,
        e.id AS event_id,
        e.event_type,
        e.payload,
        e.occurred_at
      FROM users u
      JOIN watchlists w ON w.user_id = u.id AND w.entity_type = 'company'
      JOIN events e ON (e.payload ->> 'companyId') = w.company_id::text
        AND e.event_type IN ('job.first_seen', 'sponsorship.evidence_added')
      WHERE $1::text = 'daily'
        AND ($2::text IS NULL OR u.email = $2)
        AND e.occurred_at >= $4::timestamptz - ($5::int * interval '1 hour')
        AND (w.notes IS NULL OR w.notes !~ '"muted"\\s*:\\s*true')

      UNION

      -- Roles that matched the user's opted-in candidate profile (matched once by
      -- profileAlertMatcher, which records window 'profile'); the profile's own
      -- frequency (daily/instant) decides which run emails them.
      SELECT
        u.id AS user_id,
        u.email AS user_email,
        e.id AS event_id,
        e.event_type,
        e.payload,
        e.occurred_at
      FROM users u
      JOIN candidate_profiles cp ON cp.user_id = u.id AND cp.alert_frequency = $1
      JOIN notification_deliveries pd ON pd.user_id = u.id
        AND pd.channel = 'in_app'
        AND pd.delivery_window = 'profile'
      JOIN events e ON e.id = pd.event_id
      WHERE ($2::text IS NULL OR u.email = $2)
        AND e.occurred_at >= $4::timestamptz - ($5::int * interval '1 hour')
    )
    SELECT
      ce.user_id,
      ce.user_email,
      json_agg(
        json_build_object(
          'eventId', ce.event_id,
          'eventType', ce.event_type,
          'payload', ce.payload,
          'occurredAt', ce.occurred_at
        )
        ORDER BY ce.occurred_at DESC
      ) AS events
    FROM candidate_events ce
    WHERE NOT EXISTS (
        SELECT 1 FROM email_suppressions es WHERE es.user_id = ce.user_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM notification_deliveries nd
        WHERE nd.user_id = ce.user_id
          AND nd.event_id = ce.event_id
          AND nd.channel = 'email'
          AND nd.status = 'sent'
      )
      AND (
        $1::text = 'instant'
        OR NOT EXISTS (
          SELECT 1 FROM notification_deliveries nd
          WHERE nd.user_id = ce.user_id
            AND nd.channel = 'email'
            AND nd.delivery_window = $3
        )
      )
      AND (
        $1::text <> 'instant'
        OR (
          SELECT COUNT(DISTINCT nd.delivery_window)
          FROM notification_deliveries nd
          WHERE nd.user_id = ce.user_id
            AND nd.channel = 'email'
            AND nd.delivery_window LIKE 'instant:%'
            AND nd.delivered_at >= $4::timestamptz - interval '24 hours'
        ) < $6::int
      )
    GROUP BY ce.user_id, ce.user_email
  `;

  const { rows } = await pool.query<{
    user_id: number;
    user_email: string;
    events: DigestEvent[];
  }>(query, [
    frequency,
    targetUserEmail ?? null,
    windowKey,
    now.toISOString(),
    DIGEST_LOOKBACK_HOURS[frequency],
    INSTANT_EMAILS_PER_DAY,
  ]);

  for (const userRow of rows) {
    result.usersProcessed++;
    if (!userRow.events || userRow.events.length === 0) continue;

    // Cap the email; events in dropped groups stay undelivered for next time.
    const groups = groupDigestEvents(userRow.events).slice(0, DIGEST_MAX_ITEMS);
    const items = groups.map((g) => g.item);
    const eventIds = groups.flatMap((g) => g.eventIds);

    if (dryRun) {
      result.emailsWouldSend++;
      continue;
    }

    const unsubscribeUrl = `${appUrl}/unsubscribe?t=${createUnsubscribeToken(Number(userRow.user_id), secret ?? "")}`;
    const html = renderDigestHtml({ frequency, items, unsubscribeUrl, appUrl });
    const plural = items.length === 1 ? "" : "s";

    try {
      const response = await doFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [userRow.user_email],
          subject:
            frequency === "weekly"
              ? `Weekly Tech Opportunity Digest: ${items.length} update${plural}`
              : frequency === "instant"
                ? `New tech role match: ${items.length} update${plural}`
                : `Daily Tech Opportunity Digest: ${items.length} update${plural}`,
          html,
          headers: {
            "List-Unsubscribe": `<${unsubscribeUrl.replace("/unsubscribe?", "/api/unsubscribe?")}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        }),
      });

      if (!response.ok) {
        // Never echo the provider body: it can contain the recipient address.
        result.errors.push(
          `Resend rejected a digest (HTTP ${response.status}).`,
        );
        continue;
      }

      // Record only after the provider accepted the message.
      await pool.query(
        `INSERT INTO notification_deliveries (user_id, event_id, channel, delivery_window, status)
         SELECT $1, e, 'email', $2, 'sent' FROM unnest($3::uuid[]) AS e
         ON CONFLICT (user_id, event_id, channel, delivery_window) DO NOTHING`,
        [userRow.user_id, windowKey, eventIds],
      );

      result.emailsSent++;
      result.eventsDelivered += eventIds.length;
    } catch (err) {
      result.errors.push(
        `Failed to send a digest: ${err instanceof Error ? err.name : "error"}`,
      );
    }
  }

  return result;
}
