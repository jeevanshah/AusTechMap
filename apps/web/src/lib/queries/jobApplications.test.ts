import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import {
  deleteJobApplication,
  listJobApplications,
  listSavedJobIds,
  saveJobApplication,
  updateJobApplicationNotes,
  updateJobApplicationStatus,
} from "./jobApplications";

const APPLICATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const JOB_ID = "123e4567-e89b-42d3-a456-426614174001";

function applicationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: APPLICATION_ID,
    user_id: "42",
    job_id: JOB_ID,
    status: "saved",
    snapshot: {
      version: 1,
      jobTitle: "Senior Platform Engineer",
      companyName: "Example Tech",
      companySlug: "example-tech",
      roleFamily: "Software Engineering",
      seniority: "senior",
      employmentType: "Full-time",
      workStyle: "hybrid",
      locationText: "Sydney NSW",
      salaryMin: 150000,
      salaryMax: 180000,
      salaryPeriod: "year",
      graduateRole: false,
      internshipRole: false,
      sponsorshipExplicit: null,
      sourceUrl: "https://careers.example.com/jobs/123",
      descriptionText: "Build reliable platform services.",
      postedAt: "2026-09-20T00:00:00Z",
      firstSeenAt: "2026-09-20T01:00:00Z",
      lastSeenAt: "2026-09-28T01:00:00Z",
      capturedAt: "2026-09-28T02:00:00Z",
      skills: [{ key: "postgresql", label: "PostgreSQL" }],
    },
    notes: null,
    saved_at: new Date("2026-09-28T02:00:00Z"),
    status_changed_at: new Date("2026-09-28T02:00:00Z"),
    applied_at: null,
    interviewing_at: null,
    offer_at: null,
    closed_at: null,
    updated_at: new Date("2026-09-28T02:00:00Z"),
    ...overrides,
  };
}

describe("job application vault queries", () => {
  it("lists only the authenticated user's application snapshots", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [applicationRow()] });
    const applications = await listJobApplications(
      { query } as unknown as Pool,
      42,
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("user_id = $1"),
      [42],
    );
    expect(applications[0]?.snapshot.jobTitle).toBe("Senior Platform Engineer");
    expect(applications[0]?.userId).toBe(42);
  });

  it("returns saved job identifiers for personalized job cards", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ job_id: JOB_ID }] });
    const ids = await listSavedJobIds({ query } as unknown as Pool, 42);
    expect(ids.has(JOB_ID)).toBe(true);
  });

  it("builds the snapshot server-side from the verified jobs registry", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [applicationRow()] });
    const application = await saveJobApplication(
      { query } as unknown as Pool,
      42,
      JOB_ID,
    );

    expect(query).toHaveBeenCalledWith(expect.stringContaining("FROM jobs j"), [
      42,
      JOB_ID,
    ]);
    expect(application.snapshot.skills[0]?.label).toBe("PostgreSQL");
  });

  it("returns the existing immutable snapshot when save is repeated", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [applicationRow()] });
    const application = await saveJobApplication(
      { query } as unknown as Pool,
      42,
      JOB_ID,
    );

    expect(query).toHaveBeenCalledTimes(2);
    expect(application.id).toBe(APPLICATION_ID);
  });

  it("scopes status and note changes to the owning user", async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [
          applicationRow({
            status: "interviewing",
            applied_at: new Date("2026-09-29T00:00:00Z"),
            interviewing_at: new Date("2026-09-30T00:00:00Z"),
          }),
        ],
      })
      .mockResolvedValueOnce({
        rows: [applicationRow({ notes: "Prepare architecture examples." })],
      });
    const pool = { query } as unknown as Pool;

    const updated = await updateJobApplicationStatus(
      pool,
      42,
      APPLICATION_ID,
      "interviewing",
    );
    const noted = await updateJobApplicationNotes(
      pool,
      42,
      APPLICATION_ID,
      "  Prepare architecture examples.  ",
    );

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("id = $2 AND user_id = $1"),
      [42, APPLICATION_ID, "interviewing"],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("id = $2 AND user_id = $1"),
      [42, APPLICATION_ID, "Prepare architecture examples."],
    );
    expect(updated?.status).toBe("interviewing");
    expect(noted?.notes).toBe("Prepare architecture examples.");
  });

  it("rejects oversized private notes before querying", async () => {
    const query = vi.fn();
    await expect(
      updateJobApplicationNotes(
        { query } as unknown as Pool,
        42,
        APPLICATION_ID,
        "x".repeat(5001),
      ),
    ).rejects.toThrow("5,000 characters");
    expect(query).not.toHaveBeenCalled();
  });

  it("deletes only an entry owned by the authenticated user", async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const deleted = await deleteJobApplication(
      { query } as unknown as Pool,
      42,
      APPLICATION_ID,
    );
    expect(deleted).toBe(true);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("id = $2 AND user_id = $1"),
      [42, APPLICATION_ID],
    );
  });
});
