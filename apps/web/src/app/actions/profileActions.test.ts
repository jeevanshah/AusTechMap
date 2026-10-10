import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("../../lib/auth/require-role", () => ({ requireUser: vi.fn() }));
vi.mock("../../lib/db", () => ({ getPool: vi.fn(() => ({})) }));
vi.mock("../../lib/queries/candidateProfiles", () => ({
  upsertCandidateProfile: vi.fn(),
  deleteCandidateProfile: vi.fn(),
}));
vi.mock("../../lib/queries/taxonomy", () => ({
  listRoleFamilies: vi.fn(),
  listActiveSkills: vi.fn(),
}));

import { UnauthenticatedError } from "../../lib/auth/errors";
import { requireUser } from "../../lib/auth/require-role";
import {
  deleteCandidateProfile,
  upsertCandidateProfile,
} from "../../lib/queries/candidateProfiles";
import { listActiveSkills, listRoleFamilies } from "../../lib/queries/taxonomy";
import {
  deleteCandidateProfileAction,
  saveCandidateProfileAction,
} from "./profileActions";

const ACTOR = {
  id: 42,
  email: "candidate@example.com",
  role: "user",
  mfaVerifiedAt: null,
};

const ROLE_FAMILIES = [
  { id: "f1", key: "software-engineering", label: "Software Engineering" },
  { id: "f2", key: "data", label: "Data & Analytics" },
];

const SKILLS = [
  {
    id: "s1",
    key: "typescript",
    label: "TypeScript",
    category: "language",
    aliases: ["TS"],
  },
  {
    id: "s2",
    key: "python",
    label: "Python",
    category: "language",
    aliases: [],
  },
];

const SAVED_PROFILE = {
  userId: 42,
  roleFamilyKey: null,
  roleFamilyLabel: null,
  experienceBand: "senior" as const,
  skills: [],
  workStyle: "any" as const,
  workStyleRequired: false,
  locations: [],
  source: "resume_upload" as const,
  alertFrequency: "never" as const,
  createdAt: "2026-10-09T00:00:00Z",
  updatedAt: "2026-10-09T00:00:00Z",
};

function validInput(overrides: Record<string, unknown> = {}) {
  return {
    roleFamilyKey: "software-engineering",
    experienceBand: "senior",
    skillKeys: ["typescript"],
    workStyle: "any",
    workStyleRequired: false,
    locations: [],
    source: "resume_upload",
    ...overrides,
  };
}

describe("saveCandidateProfileAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(requireUser).mockResolvedValue(ACTOR);
    vi.mocked(listRoleFamilies).mockResolvedValue(ROLE_FAMILIES);
    vi.mocked(listActiveSkills).mockResolvedValue(SKILLS);
    vi.mocked(upsertCandidateProfile).mockResolvedValue(SAVED_PROFILE);
  });

  it("requires authentication before doing anything", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthenticatedError());

    const result = await saveCandidateProfileAction(validInput());

    expect(result).toEqual({
      success: false,
      error: "Please sign in to continue.",
    });
    expect(upsertCandidateProfile).not.toHaveBeenCalled();
  });

  it("saves under the session user, never a client-supplied id", async () => {
    await saveCandidateProfileAction(validInput({ userId: 7 }));

    expect(upsertCandidateProfile).toHaveBeenCalledWith(
      {},
      42,
      expect.not.objectContaining({ userId: expect.anything() }),
    );
  });

  it.each([
    [
      "a location far longer than a place name",
      { locations: ["x".repeat(81)] },
    ],
    ["a blank location", { locations: ["   "] }],
    [
      "more locations than allowed",
      { locations: Array.from({ length: 21 }, (_, i) => `Place ${i}`) },
    ],
    [
      "more skills than allowed",
      { skillKeys: Array.from({ length: 51 }, (_, i) => `skill-${i}`) },
    ],
    ["an over-long skill key", { skillKeys: ["k".repeat(65)] }],
    ["an unknown experience band", { experienceBand: "wizard" }],
    ["a non-string role family", { roleFamilyKey: 42 }],
  ])("rejects %s before touching the database", async (_label, overrides) => {
    const result = await saveCandidateProfileAction(validInput(overrides));

    expect(result.success).toBe(false);
    expect(listRoleFamilies).not.toHaveBeenCalled();
    expect(upsertCandidateProfile).not.toHaveBeenCalled();
  });

  it("rejects a payload that isn't an object at all", async () => {
    expect((await saveCandidateProfileAction(null)).success).toBe(false);
    expect((await saveCandidateProfileAction("profile")).success).toBe(false);
    expect(upsertCandidateProfile).not.toHaveBeenCalled();
  });

  it("drops keys that are not real taxonomy entries and de-duplicates", async () => {
    await saveCandidateProfileAction(
      validInput({
        roleFamilyKey: "not-a-real-family",
        skillKeys: ["typescript", "typescript", "not-a-real-skill", "python"],
        locations: ["Sydney", " sydney ", "Melbourne"],
      }),
    );

    expect(upsertCandidateProfile).toHaveBeenCalledWith(
      {},
      42,
      expect.objectContaining({
        roleFamilyKey: null,
        skillKeys: ["typescript", "python"],
        locations: ["Sydney", "Melbourne"],
      }),
    );
  });

  it("never leaks internal error text to the client", async () => {
    vi.mocked(upsertCandidateProfile).mockRejectedValue(
      new Error("secret internal detail: relation candidate_profiles missing"),
    );

    const result = await saveCandidateProfileAction(validInput());

    expect(result).toEqual({
      success: false,
      error: "Failed to save your profile.",
    });
    // Only the error's name is logged, never its message.
    expect(console.error).toHaveBeenCalledWith(
      "saveCandidateProfileAction failed:",
      "Error",
    );
  });
});

describe("deleteCandidateProfileAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(requireUser).mockResolvedValue(ACTOR);
  });

  it("deletes the authenticated user's own profile", async () => {
    vi.mocked(deleteCandidateProfile).mockResolvedValue(true);

    const result = await deleteCandidateProfileAction();

    expect(result.success).toBe(true);
    expect(deleteCandidateProfile).toHaveBeenCalledWith({}, 42);
  });

  it("requires authentication", async () => {
    vi.mocked(requireUser).mockRejectedValue(new UnauthenticatedError());

    const result = await deleteCandidateProfileAction();

    expect(result.success).toBe(false);
    expect(deleteCandidateProfile).not.toHaveBeenCalled();
  });
});
