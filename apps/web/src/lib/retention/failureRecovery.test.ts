import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { sendEmailDigests } from "./digestSender";

describe("Notification Failure Handling & Backlog Recovery", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, AUTH_RESEND_KEY: "re_test_mock_api_key" };
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  function createMockPool(candidateRows: Array<{
    user_id: number;
    user_email: string;
    events: Array<{
      eventId: string;
      eventType: string;
      payload: Record<string, unknown>;
      occurredAt: string;
    }>;
  }>) {
    const insertedDeliveries: Array<{ userId: number; eventId: string; windowKey: string }> = [];

    const mockQuery = vi.fn().mockImplementation((queryText: string, params?: unknown[]) => {
      if (queryText.includes("FROM candidate_events") || queryText.includes("SELECT user_id, user_email")) {
        return Promise.resolve({ rows: candidateRows });
      }

      if (queryText.includes("INSERT INTO notification_deliveries")) {
        if (params) {
          insertedDeliveries.push({
            userId: Number(params[0]),
            eventId: String(params[1]),
            windowKey: String(params[2]),
          });
        }
        return Promise.resolve({ rowCount: 1 });
      }

      return Promise.resolve({ rows: [] });
    });

    return {
      pool: { query: mockQuery } as unknown as Pool,
      insertedDeliveries,
      mockQuery,
    };
  }

  it("handles Resend API 500 error gracefully without recording delivery", async () => {
    const candidateRows = [
      {
        user_id: 42,
        user_email: "candidate@example.com",
        events: [
          {
            eventId: "evt-001",
            eventType: "job.first_seen",
            payload: { companyName: "Canva", companySlug: "canva", title: "Senior Frontend Engineer" },
            occurredAt: new Date().toISOString(),
          },
        ],
      },
    ];

    const { pool, insertedDeliveries } = createMockPool(candidateRows);

    // Mock Resend returning 500
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error from mail gateway"),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await sendEmailDigests(pool, { frequency: "daily" });

    expect(result.usersProcessed).toBe(1);
    expect(result.emailsSent).toBe(0);
    expect(result.eventsDelivered).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Internal Server Error from mail gateway");

    // CRITICAL: Event must NOT be recorded in notification_deliveries so backlog can be recovered
    expect(insertedDeliveries.length).toBe(0);
  });

  it("handles network timeout / connection drop gracefully", async () => {
    const candidateRows = [
      {
        user_id: 99,
        user_email: "network_test@example.com",
        events: [
          {
            eventId: "evt-002",
            eventType: "sponsorship.evidence_added",
            payload: { companyName: "Atlassian", companySlug: "atlassian", agreementType: "Labour Agreement" },
            occurredAt: new Date().toISOString(),
          },
        ],
      },
    ];

    const { pool, insertedDeliveries } = createMockPool(candidateRows);

    // Mock network drop
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Connection reset by peer")));

    const result = await sendEmailDigests(pool, { frequency: "weekly" });

    expect(result.usersProcessed).toBe(1);
    expect(result.emailsSent).toBe(0);
    expect(result.eventsDelivered).toBe(0);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Connection reset by peer");
    expect(insertedDeliveries.length).toBe(0);
  });

  it("processes backlog on subsequent run when provider recovers", async () => {
    const candidateRows = [
      {
        user_id: 42,
        user_email: "recovered_candidate@example.com",
        events: [
          {
            eventId: "evt-backlog-001",
            eventType: "job.first_seen",
            payload: { companyName: "SafetyCulture", companySlug: "safetyculture", title: "Mobile Lead" },
            occurredAt: new Date().toISOString(),
          },
          {
            eventId: "evt-backlog-002",
            eventType: "job.first_seen",
            payload: { companyName: "Culture Amp", companySlug: "culture-amp", title: "Staff SRE" },
            occurredAt: new Date().toISOString(),
          },
        ],
      },
    ];

    const { pool, insertedDeliveries } = createMockPool(candidateRows);

    // Provider is now healthy
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: "resend_msg_12345" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await sendEmailDigests(pool, { frequency: "daily" });

    expect(result.usersProcessed).toBe(1);
    expect(result.emailsSent).toBe(1);
    expect(result.eventsDelivered).toBe(2);
    expect(result.errors.length).toBe(0);

    // Deliveries recorded
    expect(insertedDeliveries.length).toBe(2);
    expect(insertedDeliveries[0]!.eventId).toBe("evt-backlog-001");
    expect(insertedDeliveries[1]!.eventId).toBe("evt-backlog-002");
  });

  it("ensures partial batch resilience where failing user does not block successful user", async () => {
    const candidateRows = [
      {
        user_id: 1,
        user_email: "bad_domain@invalid.test",
        events: [
          {
            eventId: "evt-user1",
            eventType: "job.first_seen",
            payload: { companyName: "Airtasker", companySlug: "airtasker", title: "Backend Engineer" },
            occurredAt: new Date().toISOString(),
          },
        ],
      },
      {
        user_id: 2,
        user_email: "good_user@example.com",
        events: [
          {
            eventId: "evt-user2",
            eventType: "job.first_seen",
            payload: { companyName: "Employment Hero", companySlug: "employment-hero", title: "Staff Engineer" },
            occurredAt: new Date().toISOString(),
          },
        ],
      },
    ];

    const { pool, insertedDeliveries } = createMockPool(candidateRows);

    // First call fails (user 1), second call succeeds (user 2)
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 422,
        text: () => Promise.resolve("Unprocessable recipient domain"),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: "resend_msg_67890" }),
      });

    vi.stubGlobal("fetch", mockFetch);

    const result = await sendEmailDigests(pool, { frequency: "daily" });

    expect(result.usersProcessed).toBe(2);
    expect(result.emailsSent).toBe(1);
    expect(result.eventsDelivered).toBe(1);
    expect(result.errors.length).toBe(1);
    expect(result.errors[0]).toContain("Unprocessable recipient domain");

    // Only user 2's event recorded as delivered
    expect(insertedDeliveries.length).toBe(1);
    expect(insertedDeliveries[0]!.userId).toBe(2);
    expect(insertedDeliveries[0]!.eventId).toBe("evt-user2");
  });
});
