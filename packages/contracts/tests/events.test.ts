import { describe, expect, it } from "vitest";
import {
  ChangeEventSchema,
  NotificationDeliverySchema,
  DigestEmailPayloadSchema,
} from "../src/index.js";

describe("Phase 7 Change Event & Delivery Contracts", () => {
  it("validates ChangeEventSchema with exact fields", () => {
    const valid = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      eventType: "job.first_seen",
      entityType: "job",
      entityId: "223e4567-e89b-12d3-a456-426614174000",
      dedupeKey: "job:first_seen:223e4567-e89b-12d3-a456-426614174000",
      payload: {
        companyName: "Atlassian",
        companySlug: "atlassian",
        title: "Senior Fullstack Engineer",
        remoteType: "hybrid",
        locationText: "Sydney, NSW",
      },
      occurredAt: "2026-09-08T12:00:00Z",
      eventVersion: 1,
      createdAt: "2026-09-08T12:00:00Z",
    };

    const parsed = ChangeEventSchema.parse(valid);
    expect(parsed.eventType).toBe("job.first_seen");
    expect(parsed.dedupeKey).toBe("job:first_seen:223e4567-e89b-12d3-a456-426614174000");
  });

  it("validates NotificationDeliverySchema", () => {
    const delivery = {
      id: "323e4567-e89b-12d3-a456-426614174000",
      userId: 42,
      eventId: "123e4567-e89b-12d3-a456-426614174000",
      channel: "email",
      deliveryWindow: "daily:2026-09-08",
      status: "sent",
      deliveredAt: "2026-09-08T12:30:00Z",
    };

    const parsed = NotificationDeliverySchema.parse(delivery);
    expect(parsed.channel).toBe("email");
    expect(parsed.deliveryWindow).toBe("daily:2026-09-08");
    expect(parsed.status).toBe("sent");
  });

  it("validates DigestEmailPayloadSchema", () => {
    const payload = {
      userEmail: "engineer@example.com",
      frequency: "weekly",
      windowKey: "weekly:2026-W37",
      items: [
        {
          title: "Atlassian posted 3 new roles",
          description: "Senior Fullstack Engineer, Data Engineer, Platform Lead in Sydney",
          link: "https://austechmap.com.au/companies/atlassian",
          badge: "Watched Company",
        },
      ],
      unsubscribeUrl: "https://austechmap.com.au/account?tab=preferences",
    };

    const parsed = DigestEmailPayloadSchema.parse(payload);
    expect(parsed.userEmail).toBe("engineer@example.com");
    expect(parsed.items.length).toBe(1);
  });
});
