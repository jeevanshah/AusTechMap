import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../lib/auth/require-role", () => ({ requireUser: vi.fn() }));
vi.mock("../../lib/db", () => ({ getPool: vi.fn(() => ({})) }));
vi.mock("../../lib/queries/jobApplications", () => ({
  deleteJobApplication: vi.fn(),
  saveJobApplication: vi.fn(),
  updateJobApplicationNotes: vi.fn(),
  updateJobApplicationStatus: vi.fn(),
}));

import { requireUser } from "../../lib/auth/require-role";
import {
  deleteJobApplication,
  saveJobApplication,
  updateJobApplicationNotes,
  updateJobApplicationStatus,
} from "../../lib/queries/jobApplications";
import {
  deleteJobApplicationAction,
  saveJobApplicationAction,
  updateJobApplicationNotesAction,
  updateJobApplicationStatusAction,
} from "./applicationActions";

const APPLICATION_ID = "123e4567-e89b-42d3-a456-426614174000";
const JOB_ID = "123e4567-e89b-42d3-a456-426614174001";

function application() {
  return {
    id: APPLICATION_ID,
    userId: 42,
    jobId: JOB_ID,
    status: "saved" as const,
    snapshot: {
      version: 1 as const,
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
      skills: [],
    },
    notes: null,
    savedAt: "2026-09-28T02:00:00Z",
    statusChangedAt: "2026-09-28T02:00:00Z",
    appliedAt: null,
    interviewingAt: null,
    offerAt: null,
    closedAt: null,
    updatedAt: "2026-09-28T02:00:00Z",
  };
}

describe("application tracker server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireUser).mockResolvedValue({
      id: 42,
      email: "candidate@example.com",
      role: "user",
      mfaVerifiedAt: null,
    });
  });

  it("authenticates before saving a server-derived job snapshot", async () => {
    vi.mocked(saveJobApplication).mockResolvedValue(application());
    const result = await saveJobApplicationAction(JOB_ID);

    expect(result.success).toBe(true);
    expect(requireUser).toHaveBeenCalledOnce();
    expect(saveJobApplication).toHaveBeenCalledWith({}, 42, JOB_ID);
  });

  it("rejects malformed identifiers before touching the database", async () => {
    const result = await saveJobApplicationAction("not-a-uuid");
    expect(result.success).toBe(false);
    expect(saveJobApplication).not.toHaveBeenCalled();
  });

  it("updates only a validated application status", async () => {
    vi.mocked(updateJobApplicationStatus).mockResolvedValue({
      ...application(),
      status: "interviewing",
    });
    const result = await updateJobApplicationStatusAction(
      APPLICATION_ID,
      "interviewing",
    );
    expect(result.success).toBe(true);
    expect(updateJobApplicationStatus).toHaveBeenCalledWith(
      {},
      42,
      APPLICATION_ID,
      "interviewing",
    );
  });

  it("updates private notes through the owning user scope", async () => {
    vi.mocked(updateJobApplicationNotes).mockResolvedValue({
      ...application(),
      notes: "Prepare system design examples.",
    });
    const result = await updateJobApplicationNotesAction(
      APPLICATION_ID,
      "Prepare system design examples.",
    );
    expect(result.success).toBe(true);
    expect(updateJobApplicationNotes).toHaveBeenCalledWith(
      {},
      42,
      APPLICATION_ID,
      "Prepare system design examples.",
    );
  });

  it("deletes an owned vault entry", async () => {
    vi.mocked(deleteJobApplication).mockResolvedValue(true);
    const result = await deleteJobApplicationAction(APPLICATION_ID);
    expect(result.success).toBe(true);
    expect(deleteJobApplication).toHaveBeenCalledWith({}, 42, APPLICATION_ID);
  });
});
