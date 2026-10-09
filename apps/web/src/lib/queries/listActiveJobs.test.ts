import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { listActiveJobs } from "./listActiveJobs";

describe("listActiveJobs", () => {
  it("maps bounded public jobs and sends filters as query parameters", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          {
            id: "job-1",
            title: "Platform Engineer",
            company_name: "Registry Tech",
            company_slug: "registry-tech",
            role_family: "Software Engineering",
            role_family_key: "software-engineering",
            seniority: "senior",
            remote_type: "hybrid",
            location_text: "Sydney, NSW",
            source_url: "https://careers.example.test/jobs/1",
            posted_at: new Date("2026-09-10T00:00:00Z"),
            first_seen_at: new Date("2026-09-09T00:00:00Z"),
            total_count: "103",
          },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ key: "software-engineering", label: "Software Engineering" }],
      });

    const result = await listActiveJobs({ query } as unknown as Pool, {
      query: " platform ",
      roleFamily: "software-engineering",
      workStyle: "hybrid",
    });

    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[0]?.[1]).toEqual([
      "platform",
      "software-engineering",
      "hybrid",
      100,
      null,
    ]);
    expect(result).toMatchObject({
      total: 103,
      truncated: true,
      jobs: [
        {
          title: "Platform Engineer",
          postedAt: "2026-09-10T00:00:00.000Z",
          firstSeenAt: "2026-09-09T00:00:00.000Z",
        },
      ],
      roleFamilies: [{ key: "software-engineering" }],
    });
  });

  it("passes a valid posted-within window and ignores out-of-range values", async () => {
    const run = async (postedWithinDays: number | undefined) => {
      const query = vi.fn().mockResolvedValue({ rows: [] });
      await listActiveJobs({ query } as unknown as Pool, { postedWithinDays });
      return query.mock.calls[0]?.[1]?.[4];
    };

    expect(await run(7)).toBe(7);
    expect(await run(undefined)).toBeNull();
    expect(await run(0)).toBeNull();
    expect(await run(91)).toBeNull();
    expect(await run(2.5)).toBeNull();
  });

  it("returns an empty, non-truncated page when no active jobs match", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(listActiveJobs({ query } as unknown as Pool)).resolves.toEqual(
      {
        jobs: [],
        roleFamilies: [],
        total: 0,
        truncated: false,
      },
    );
  });
});
