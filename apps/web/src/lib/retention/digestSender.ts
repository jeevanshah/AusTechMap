import type { Pool } from "pg";
import type { DigestItem } from "@austechmap/contracts";

export interface DigestOptions {
  frequency: "daily" | "weekly" | "instant";
  dryRun?: boolean;
  targetUserEmail?: string;
}

export interface DigestSendResult {
  usersProcessed: number;
  emailsSent: number;
  eventsDelivered: number;
  errors: string[];
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
              ? `<span style="display: inline-block; background-color: #ffedd5; color: #9a3412; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 9999px; border: 1px solid #fed7aa; margin-right: 6px;">${item.badge}</span>`
              : ""
          }
          <span style="font-size: 15px; font-weight: 700; color: #0f172a;">
            ${item.title}
          </span>
        </div>
        <p style="margin: 0 0 8px 0; font-size: 13px; color: #475569; line-height: 1.5;">
          ${item.description}
        </p>
        <a href="${item.link.startsWith("http") ? item.link : `${appUrl}${item.link}`}" style="font-size: 12px; font-weight: 600; color: #c2410c; text-decoration: none;">
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
          <a href="${appUrl}/account" style="display: inline-block; background-color: #c2410c; color: #ffffff; font-size: 13px; font-weight: 600; text-decoration: none; padding: 10px 20px; border-radius: 8px;">
            Open Your Account Hub
          </a>
        </div>
      </td>
    </tr>

    <!-- Footer -->
    <tr>
      <td style="background-color: #f1f5f9; padding: 18px 24px; font-size: 11px; color: #64748b; border-top: 1px solid #e2e8f0; line-height: 1.5;">
        You received this email because you saved searches or watched employers on Australia Tech Map.<br>
        <a href="${unsubscribeUrl}" style="color: #64748b; text-decoration: underline;">Manage notification preferences or unsubscribe</a>.
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

/**
 * Delivers batched email digests to subscribers via Resend REST API.
 * Guaranteed idempotent: records (user_id, event_id, 'email', delivery_window) in notification_deliveries.
 */
export async function sendEmailDigests(
  pool: Pool,
  options: DigestOptions,
): Promise<DigestSendResult> {
  const { frequency, dryRun = false, targetUserEmail } = options;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const resendApiKey =
    process.env.AUTH_RESEND_KEY ?? process.env.RESEND_API_KEY;
  const fromEmail =
    process.env.AUTH_RESEND_FROM ??
    process.env.RESEND_FROM ??
    "onboarding@resend.dev";

  // Formulate stable window key, e.g. "daily:2026-09-08" or "weekly:2026-W37"
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const windowKey =
    frequency === "weekly"
      ? `weekly:${dateStr.slice(0, 7)}`
      : `daily:${dateStr}`;

  // Find users with active saved searches or watchlists that have pending undelivered events for this window
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
      WHERE ($2::text IS NULL OR u.email = $2)
        AND NOT EXISTS (
          SELECT 1 FROM notification_deliveries nd
          WHERE nd.user_id = u.id AND nd.event_id = e.id AND nd.channel = 'email' AND nd.delivery_window = $3
        )
      
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
      WHERE ($2::text IS NULL OR u.email = $2)
        AND NOT EXISTS (
          SELECT 1 FROM notification_deliveries nd
          WHERE nd.user_id = u.id AND nd.event_id = e.id AND nd.channel = 'email' AND nd.delivery_window = $3
        )
    )
    SELECT 
      user_id,
      user_email,
      json_agg(
        json_build_object(
          'eventId', event_id,
          'eventType', event_type,
          'payload', payload,
          'occurredAt', occurred_at
        )
      ) AS events
    FROM candidate_events
    GROUP BY user_id, user_email
  `;

  const { rows } = await pool.query<{
    user_id: number;
    user_email: string;
    events: Array<{
      eventId: string;
      eventType: string;
      payload: Record<string, unknown>;
      occurredAt: string;
    }>;
  }>(query, [frequency, targetUserEmail ?? null, windowKey]);

  let usersProcessed = 0;
  let emailsSent = 0;
  let eventsDelivered = 0;
  const errors: string[] = [];

  for (const userRow of rows) {
    usersProcessed++;
    const userEvents = userRow.events;
    if (!userEvents || userEvents.length === 0) continue;

    const items: DigestItem[] = userEvents.map((ue) => {
      const companyName = String(ue.payload.companyName ?? "Company");
      const companySlug = String(ue.payload.companySlug ?? "");
      const title = String(ue.payload.title ?? "New Opportunity");
      const remoteType = ue.payload.remoteType
        ? ` (${String(ue.payload.remoteType)})`
        : "";

      if (ue.eventType === "sponsorship.evidence_added") {
        return {
          title: `${companyName} added visa sponsorship evidence`,
          description: `Approved Home Affairs agreement: ${String(ue.payload.agreementType ?? "Accredited")}`,
          link: `/companies/${companySlug}`,
          badge: "Sponsorship Evidence",
        };
      }

      return {
        title: `${companyName} is hiring: ${title}`,
        description: `New active role posted${remoteType}. Observed on official company career board.`,
        link: `/companies/${companySlug}`,
        badge: "New Role",
      };
    });

    const emailHtml = renderDigestHtml({
      frequency,
      items,
      unsubscribeUrl: `${appUrl}/account?tab=preferences`,
      appUrl,
    });

    if (dryRun || !resendApiKey) {
      // In dry run or missing key, simulate delivery
      for (const ue of userEvents) {
        await pool.query(
          `INSERT INTO notification_deliveries (user_id, event_id, channel, delivery_window, status)
           VALUES ($1, $2, 'email', $3, 'sent')
           ON CONFLICT (user_id, event_id, channel, delivery_window) DO NOTHING`,
          [userRow.user_id, ue.eventId, windowKey],
        );
      }
      emailsSent++;
      eventsDelivered += userEvents.length;
      continue;
    }

    try {
      const response = await fetch("https://api.resend.com/emails", {
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
              ? `Weekly Tech Opportunity Digest: ${items.length} new updates`
              : `Daily Tech Opportunity Digest: ${items.length} new updates`,
          html: emailHtml,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        errors.push(`Resend API error for ${userRow.user_email}: ${errorText}`);
        continue;
      }

      // Record successful delivery
      for (const ue of userEvents) {
        await pool.query(
          `INSERT INTO notification_deliveries (user_id, event_id, channel, delivery_window, status)
           VALUES ($1, $2, 'email', $3, 'sent')
           ON CONFLICT (user_id, event_id, channel, delivery_window) DO NOTHING`,
          [userRow.user_id, ue.eventId, windowKey],
        );
      }

      emailsSent++;
      eventsDelivered += userEvents.length;
    } catch (err) {
      errors.push(
        `Failed to send email to ${userRow.user_email}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return {
    usersProcessed,
    emailsSent,
    eventsDelivered,
    errors,
  };
}
