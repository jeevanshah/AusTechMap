import type { PGlite } from "@electric-sql/pglite";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { deriveChangeEvents } from "./eventDeriver";
import { matchEventsToSubscribers } from "./alertMatcher";
import {
  escapeHtml,
  groupDigestEvents,
  isoWeekKey,
  renderDigestHtml,
  sendEmailDigests,
} from "./digestSender";
import {
  createRetentionTestDb,
  seedCompany,
  seedJob,
  seedJobEvent,
  seedUser,
  type RetentionTestDb,
} from "./retentionTestDb";

// Real Postgres semantics (PGlite) with the real retention migrations 0017/0018.

let ctx: RetentionTestDb;
let db: PGlite;

beforeAll(async () => {
  ctx = await createRetentionTestDb();
  db = ctx.db;
});

afterAll(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(
    `TRUNCATE notification_deliveries, user_alerts, events, saved_searches,
              watchlists, jobs, role_families, companies, users RESTART IDENTITY CASCADE`,
  );
});

async function count(table: string, where = "true"): Promise<number> {
  const r = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM ${table} WHERE ${where}`,
  );
  return Number(r.rows[0]?.n);
}

describe("event derivation", () => {
  it("skips a source's baseline crawl but derives later roles", async () => {
    const company = await seedCompany(db, "acme");
    // Onboarding crawl: three roles seen together 3h ago.
    for (const title of ["A", "B", "C"]) {
      await seedJob(db, { companyId: company, title, firstSeenHoursAgo: 3 });
    }
    // A genuinely new role appears 1h ago (2h after the baseline).
    await seedJob(db, {
      companyId: company,
      title: "New",
      firstSeenHoursAgo: 1,
    });

    const stats = await deriveChangeEvents(ctx.q);
    expect(stats.jobsDerived).toBe(1);
    const titles = await db.query<{ t: string }>(
      "SELECT payload ->> 'title' AS t FROM events WHERE event_type = 'job.first_seen'",
    );
    expect(titles.rows.map((r) => r.t)).toEqual(["New"]);
  });

  it("treats each employer/source separately", async () => {
    const a = await seedCompany(db, "a");
    const b = await seedCompany(db, "b");
    await seedJob(db, { companyId: a, title: "a-base", firstSeenHoursAgo: 5 });
    // b onboarded just now: all its roles are baseline even though a is old.
    await seedJob(db, { companyId: b, title: "b-1", firstSeenHoursAgo: 0.1 });
    await seedJob(db, { companyId: b, title: "b-2", firstSeenHoursAgo: 0.1 });

    expect((await deriveChangeEvents(ctx.q)).jobsDerived).toBe(0);
  });

  it("ignores roles first seen more than 48h ago", async () => {
    const company = await seedCompany(db, "acme");
    await seedJob(db, {
      companyId: company,
      title: "base",
      firstSeenHoursAgo: 200,
    });
    await seedJob(db, {
      companyId: company,
      title: "stale",
      firstSeenHoursAgo: 60,
    });
    expect((await deriveChangeEvents(ctx.q)).jobsDerived).toBe(0);
  });

  it("ignores reposts whose ATS posted date is old", async () => {
    const company = await seedCompany(db, "acme");
    await seedJob(db, {
      companyId: company,
      title: "base",
      firstSeenHoursAgo: 30,
    });
    await seedJob(db, {
      companyId: company,
      title: "repost",
      firstSeenHoursAgo: 1,
      postedDaysAgo: 40,
    });
    await seedJob(db, {
      companyId: company,
      title: "fresh",
      firstSeenHoursAgo: 1,
      postedDaysAgo: 1,
    });
    await deriveChangeEvents(ctx.q);
    const titles = await db.query<{ t: string }>(
      "SELECT payload ->> 'title' AS t FROM events",
    );
    expect(titles.rows.map((r) => r.t)).toEqual(["fresh"]);
  });

  it("is idempotent", async () => {
    const company = await seedCompany(db, "acme");
    await seedJob(db, {
      companyId: company,
      title: "base",
      firstSeenHoursAgo: 10,
    });
    await seedJob(db, {
      companyId: company,
      title: "new",
      firstSeenHoursAgo: 1,
    });
    expect((await deriveChangeEvents(ctx.q)).jobsDerived).toBe(1);
    expect((await deriveChangeEvents(ctx.q)).jobsDerived).toBe(0);
  });
});

describe("in-app alert matching", () => {
  it("alerts a watcher for fresh events only, and respects mute", async () => {
    const company = await seedCompany(db, "acme", "Acme");
    const watcher = await seedUser(db, "w@example.test");
    const muted = await seedUser(db, "m@example.test");
    await db.query(
      "INSERT INTO watchlists (user_id, entity_type, company_id) VALUES ($1, 'company', $2)",
      [watcher, company],
    );
    await db.query(
      "INSERT INTO watchlists (user_id, entity_type, company_id, notes) VALUES ($1, 'company', $2, $3)",
      [muted, company, JSON.stringify({ muted: true, memo: "x" })],
    );
    await seedJobEvent(db, {
      companyId: company,
      companySlug: "acme",
      title: "Fresh",
      hoursAgo: 2,
    });
    await seedJobEvent(db, {
      companyId: company,
      companySlug: "acme",
      title: "Historic",
      hoursAgo: 24 * 10,
    });

    const stats = await matchEventsToSubscribers(ctx.q);
    expect(stats.watchlistAlertsCreated).toBe(1);
    expect(await count("user_alerts", `user_id = ${watcher}`)).toBe(1);
    expect(await count("user_alerts", `user_id = ${muted}`)).toBe(0);

    // Replay-safe.
    expect((await matchEventsToSubscribers(ctx.q)).totalAlertsCreated).toBe(0);
  });

  it("skips saved searches set to never and creates one alert per matching search", async () => {
    const company = await seedCompany(db, "acme", "Acme");
    const user = await seedUser(db, "u@example.test");
    for (const [name, frequency, filters] of [
      ["never", "never", {}],
      ["daily-any", "daily", {}],
      ["daily-role", "daily", { roleFamily: "software-engineering" }],
      ["wrong-role", "daily", { roleFamily: "data" }],
    ] as const) {
      await db.query(
        "INSERT INTO saved_searches (user_id, name, filters, alert_frequency) VALUES ($1, $2, $3::jsonb, $4)",
        [user, name, JSON.stringify(filters), frequency],
      );
    }
    await seedJobEvent(db, {
      companyId: company,
      companySlug: "acme",
      title: "Platform Engineer",
      hoursAgo: 1,
      roleFamilyKey: "software-engineering",
    });

    const stats = await matchEventsToSubscribers(ctx.q);
    expect(stats.savedSearchAlertsCreated).toBe(2);
    const titles = await db.query<{ title: string }>(
      "SELECT title FROM user_alerts ORDER BY title",
    );
    expect(titles.rows.map((r) => r.title)).toEqual([
      'Match for "daily-any"',
      'Match for "daily-role"',
    ]);
  });

  it("caps alerts per user per run and delivers the rest on the next run", async () => {
    const company = await seedCompany(db, "acme", "Acme");
    const user = await seedUser(db, "u@example.test");
    await db.query(
      "INSERT INTO watchlists (user_id, entity_type, company_id) VALUES ($1, 'company', $2)",
      [user, company],
    );
    for (let i = 0; i < 25; i++) {
      await seedJobEvent(db, {
        companyId: company,
        companySlug: "acme",
        title: `Role ${i}`,
        hoursAgo: 1 + i / 100,
        key: `r${i}`,
      });
    }
    expect((await matchEventsToSubscribers(ctx.q)).totalAlertsCreated).toBe(20);
    expect((await matchEventsToSubscribers(ctx.q)).totalAlertsCreated).toBe(5);
    expect((await matchEventsToSubscribers(ctx.q)).totalAlertsCreated).toBe(0);
  });
});

describe("email digests", () => {
  async function dailySubscriber() {
    const company = await seedCompany(db, "acme", "Acme");
    const user = await seedUser(db, "u@example.test");
    await db.query(
      "INSERT INTO saved_searches (user_id, name, alert_frequency) VALUES ($1, 's', 'daily')",
      [user],
    );
    return { company, user };
  }

  const okFetch = () =>
    vi.fn(
      async () => new Response("{}", { status: 200 }),
    ) as unknown as typeof fetch;

  beforeEach(() => {
    vi.stubEnv("AUTH_RESEND_KEY", "re_test_key");
  });

  it("records nothing and reports an error when no API key is configured", async () => {
    vi.stubEnv("AUTH_RESEND_KEY", "");
    vi.stubEnv("RESEND_API_KEY", "");
    const { company } = await dailySubscriber();
    await seedJobEvent(db, {
      companyId: company,
      companySlug: "acme",
      title: "T",
      hoursAgo: 1,
    });

    const result = await sendEmailDigests(ctx.q, { frequency: "daily" });
    expect(result.emailsSent).toBe(0);
    expect(result.errors[0]).toMatch(/not configured/);
    expect(await count("notification_deliveries")).toBe(0);
  });

  it("dry run counts what would be sent and records nothing", async () => {
    const { company } = await dailySubscriber();
    await seedJobEvent(db, {
      companyId: company,
      companySlug: "acme",
      title: "T",
      hoursAgo: 1,
    });
    const fetchImpl = okFetch();

    const result = await sendEmailDigests(ctx.q, {
      frequency: "daily",
      dryRun: true,
      fetchImpl,
    });
    expect(result).toMatchObject({
      emailsSent: 0,
      emailsWouldSend: 1,
      eventsDelivered: 0,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await count("notification_deliveries")).toBe(0);
  });

  it("sends once, records only after acceptance, and never re-sends an event", async () => {
    const { company } = await dailySubscriber();
    await seedJobEvent(db, {
      companyId: company,
      companySlug: "acme",
      title: "T",
      hoursAgo: 1,
    });
    const fetchImpl = okFetch();
    const now = new Date();

    const first = await sendEmailDigests(ctx.q, {
      frequency: "daily",
      fetchImpl,
      now,
    });
    expect(first).toMatchObject({
      emailsSent: 1,
      eventsDelivered: 1,
      errors: [],
    });
    expect(await count("notification_deliveries", "channel = 'email'")).toBe(1);

    // Same window again, and the next day: the event is not emailed twice.
    const again = await sendEmailDigests(ctx.q, {
      frequency: "daily",
      fetchImpl,
      now,
    });
    const tomorrow = await sendEmailDigests(ctx.q, {
      frequency: "daily",
      fetchImpl,
      now: new Date(now.getTime() + 24 * 3_600_000),
    });
    expect(again.emailsSent).toBe(0);
    expect(tomorrow.emailsSent).toBe(0);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("gives a user at most one digest per daily window", async () => {
    const { company } = await dailySubscriber();
    await seedJobEvent(db, {
      companyId: company,
      companySlug: "acme",
      title: "One",
      hoursAgo: 2,
      key: "1",
    });
    const fetchImpl = okFetch();
    const now = new Date();
    await sendEmailDigests(ctx.q, { frequency: "daily", fetchImpl, now });

    await seedJobEvent(db, {
      companyId: company,
      companySlug: "acme",
      title: "Two",
      hoursAgo: 1,
      key: "2",
    });
    const second = await sendEmailDigests(ctx.q, {
      frequency: "daily",
      fetchImpl,
      now,
    });
    expect(second.emailsSent).toBe(0);
    // ...and it goes out in the next day's digest.
    const next = await sendEmailDigests(ctx.q, {
      frequency: "daily",
      fetchImpl,
      now: new Date(now.getTime() + 24 * 3_600_000),
    });
    expect(next.emailsSent).toBe(1);
  });

  it("records nothing when the provider rejects or the request fails, without leaking the body", async () => {
    const { company } = await dailySubscriber();
    await seedJobEvent(db, {
      companyId: company,
      companySlug: "acme",
      title: "T",
      hoursAgo: 1,
    });

    const rejecting = vi.fn(
      async () => new Response("rejected u@example.test", { status: 422 }),
    ) as unknown as typeof fetch;
    const a = await sendEmailDigests(ctx.q, {
      frequency: "daily",
      fetchImpl: rejecting,
    });
    expect(a.emailsSent).toBe(0);
    expect(a.errors.join()).not.toContain("u@example.test");

    const throwing = vi.fn(async () => {
      throw new TypeError("network down");
    }) as unknown as typeof fetch;
    const b = await sendEmailDigests(ctx.q, {
      frequency: "daily",
      fetchImpl: throwing,
    });
    expect(b.emailsSent).toBe(0);

    expect(await count("notification_deliveries")).toBe(0);
    // A later healthy run still delivers it.
    const c = await sendEmailDigests(ctx.q, {
      frequency: "daily",
      fetchImpl: okFetch(),
    });
    expect(c.emailsSent).toBe(1);
  });

  it("ignores events outside the lookback (history never floods a subscriber)", async () => {
    const { company } = await dailySubscriber();
    await seedJobEvent(db, {
      companyId: company,
      companySlug: "acme",
      title: "Old",
      hoursAgo: 24 * 5,
    });
    const result = await sendEmailDigests(ctx.q, {
      frequency: "daily",
      fetchImpl: okFetch(),
    });
    expect(result.usersProcessed).toBe(0);
  });

  it("uses a longer lookback for weekly digests", async () => {
    const company = await seedCompany(db, "acme", "Acme");
    const user = await seedUser(db, "u@example.test");
    await db.query(
      "INSERT INTO saved_searches (user_id, name, alert_frequency) VALUES ($1, 's', 'weekly')",
      [user],
    );
    await seedJobEvent(db, {
      companyId: company,
      companySlug: "acme",
      title: "Mid",
      hoursAgo: 24 * 5,
      key: "m",
    });
    await seedJobEvent(db, {
      companyId: company,
      companySlug: "acme",
      title: "Old",
      hoursAgo: 24 * 12,
      key: "o",
    });
    const fetchImpl = okFetch();
    const result = await sendEmailDigests(ctx.q, {
      frequency: "weekly",
      fetchImpl,
    });
    expect(result).toMatchObject({ emailsSent: 1, eventsDelivered: 1 });
  });

  it("skips muted watchlist entries and groups roles per employer", async () => {
    const company = await seedCompany(db, "acme", "Acme");
    const muted = await seedCompany(db, "quiet", "Quiet");
    const user = await seedUser(db, "u@example.test");
    await db.query(
      "INSERT INTO watchlists (user_id, entity_type, company_id) VALUES ($1, 'company', $2)",
      [user, company],
    );
    await db.query(
      "INSERT INTO watchlists (user_id, entity_type, company_id, notes) VALUES ($1, 'company', $2, $3)",
      [user, muted, JSON.stringify({ muted: true })],
    );
    for (const key of ["1", "2", "3"]) {
      await seedJobEvent(db, {
        companyId: company,
        companySlug: "acme",
        companyName: "Acme",
        title: `Role ${key}`,
        hoursAgo: 1,
        key,
      });
    }
    await seedJobEvent(db, {
      companyId: muted,
      companySlug: "quiet",
      title: "Hidden",
      hoursAgo: 1,
      key: "h",
    });

    const fetchImpl = okFetch();
    const result = await sendEmailDigests(ctx.q, {
      frequency: "daily",
      fetchImpl,
    });
    expect(result).toMatchObject({ emailsSent: 1, eventsDelivered: 3 });
    const body = JSON.parse(
      String(
        (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
          ?.body,
      ),
    );
    expect(body.html).toContain("Acme posted 3 new roles");
    expect(body.html).not.toContain("Hidden");
  });

  it("caps instant emails per rolling day", async () => {
    const company = await seedCompany(db, "acme", "Acme");
    const user = await seedUser(db, "u@example.test");
    await db.query(
      "INSERT INTO saved_searches (user_id, name, alert_frequency) VALUES ($1, 's', 'instant')",
      [user],
    );
    const fetchImpl = okFetch();
    const base = new Date();
    const sent: number[] = [];
    for (let i = 0; i < 4; i++) {
      await seedJobEvent(db, {
        companyId: company,
        companySlug: "acme",
        title: `T${i}`,
        hoursAgo: 1,
        key: `i${i}`,
      });
      const res = await sendEmailDigests(ctx.q, {
        frequency: "instant",
        fetchImpl,
        now: new Date(base.getTime() + i * 60_000),
      });
      sent.push(res.emailsSent);
    }
    expect(sent).toEqual([1, 1, 1, 0]);
  });
});

describe("digest rendering", () => {
  it("escapes third-party text so a job title cannot inject HTML", () => {
    const html = renderDigestHtml({
      frequency: "daily",
      items: [
        {
          title: 'Acme: <img src=x onerror=alert(1)> "Lead"',
          description: "<script>steal()</script>",
          link: "javascript:alert(1)",
          badge: "<b>x</b>",
        },
      ],
      unsubscribeUrl: "https://app.example.test/account?tab=searches",
      appUrl: "https://app.example.test",
    });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;img");
    expect(html).toContain("&quot;Lead&quot;");
  });

  it("escapeHtml handles all five special characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("computes ISO week keys across year boundaries", () => {
    expect(isoWeekKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-W01");
    expect(isoWeekKey(new Date("2026-10-09T00:00:00Z"))).toBe("2026-W41");
    expect(isoWeekKey(new Date("2027-01-01T00:00:00Z"))).toBe("2026-W53");
    expect(isoWeekKey(new Date("2026-12-28T00:00:00Z"))).toBe("2026-W53");
  });

  it("groups new roles by employer and keeps sponsorship events separate", () => {
    const groups = groupDigestEvents([
      {
        eventId: "1",
        eventType: "job.first_seen",
        occurredAt: "",
        payload: { companyName: "A", companySlug: "a", title: "X" },
      },
      {
        eventId: "2",
        eventType: "sponsorship.evidence_added",
        occurredAt: "",
        payload: { companyName: "A", companySlug: "a" },
      },
      {
        eventId: "3",
        eventType: "job.first_seen",
        occurredAt: "",
        payload: { companyName: "A", companySlug: "a", title: "Y" },
      },
      {
        eventId: "4",
        eventType: "job.first_seen",
        occurredAt: "",
        payload: { companyName: "B", companySlug: "b", title: "Z" },
      },
    ]);
    expect(groups.map((g) => g.item.title)).toEqual([
      "A posted 2 new roles",
      "A added visa sponsorship evidence",
      "B is hiring: Z",
    ]);
    expect(groups[0]?.eventIds).toEqual(["1", "3"]);
  });
});
