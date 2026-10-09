import { describe, expect, it } from "vitest";
import { jobFreshness } from "./freshness";

// 2026-10-09 14:00 in Sydney (AEDT, UTC+11) = 03:00 UTC.
const NOW = new Date("2026-10-09T03:00:00Z");

describe("jobFreshness", () => {
  it("labels a job posted earlier the same Sydney day as today", () => {
    const f = jobFreshness({ postedAt: "2026-10-08T21:30:00Z" }, NOW); // 08:30 Sydney
    expect(f).toEqual({ kind: "new", days: 0, label: "Posted today" });
  });

  it("uses Sydney calendar days, not rolling 24h windows", () => {
    // 23:30 Sydney the previous evening is only ~14h before NOW but is yesterday.
    const f = jobFreshness({ postedAt: "2026-10-08T12:30:00Z" }, NOW);
    expect(f?.days).toBe(1);
    expect(f?.label).toBe("Posted yesterday");
  });

  it("labels recent days and flips from new to recent after 3 days", () => {
    expect(
      jobFreshness({ postedAt: "2026-10-06T03:00:00Z" }, NOW),
    ).toMatchObject({
      kind: "new",
      days: 3,
      label: "Posted 3 days ago",
    });
    expect(
      jobFreshness({ postedAt: "2026-10-05T03:00:00Z" }, NOW),
    ).toMatchObject({
      kind: "recent",
      days: 4,
    });
  });

  it("stops producing relative labels after 30 days", () => {
    expect(jobFreshness({ postedAt: "2026-09-09T03:00:00Z" }, NOW)?.days).toBe(
      30,
    );
    expect(jobFreshness({ postedAt: "2026-09-08T03:00:00Z" }, NOW)).toBeNull();
  });

  it("returns null without a usable posted date and never falls back to first seen", () => {
    expect(
      jobFreshness(
        { postedAt: null, firstSeenAt: "2026-10-09T01:00:00Z" },
        NOW,
      ),
    ).toBeNull();
    expect(jobFreshness({ postedAt: undefined }, NOW)).toBeNull();
    expect(jobFreshness({ postedAt: "" }, NOW)).toBeNull();
    expect(jobFreshness({ postedAt: "not a date" }, NOW)).toBeNull();
  });

  it("tolerates date-only sources parsed as midnight UTC slightly ahead of now", () => {
    // Workable-style "2026-10-10" read as 2026-10-10T00:00Z is 21h ahead of NOW.
    expect(
      jobFreshness({ postedAt: "2026-10-10T00:00:00Z" }, NOW),
    ).toMatchObject({
      days: 0,
      label: "Posted today",
    });
  });

  it("rejects dates more than a day in the future", () => {
    expect(jobFreshness({ postedAt: "2026-10-11T00:00:00Z" }, NOW)).toBeNull();
  });

  it("rejects a posted date that follows first sight by more than a day", () => {
    expect(
      jobFreshness(
        {
          postedAt: "2026-10-09T00:00:00Z",
          firstSeenAt: "2026-10-05T00:00:00Z",
        },
        NOW,
      ),
    ).toBeNull();
  });

  it("accepts a posted date that precedes first sight (normal crawl delay)", () => {
    expect(
      jobFreshness(
        {
          postedAt: "2026-10-07T00:00:00Z",
          firstSeenAt: "2026-10-09T00:00:00Z",
        },
        NOW,
      ),
    ).toMatchObject({ days: 2, kind: "new" });
  });

  it("treats a daylight-saving day boundary correctly", () => {
    // AEDT starts 2026-10-04 02:00. Posted 2026-10-03 13:30 Sydney (AEST), NOW 2026-10-05 10:00.
    const now = new Date("2026-10-04T23:00:00Z"); // 10:00 Sydney 5 Oct
    const f = jobFreshness({ postedAt: "2026-10-03T03:30:00Z" }, now);
    expect(f?.days).toBe(2);
  });
});
