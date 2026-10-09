import type {
  CandidateProfile,
  OpportunityMatchPreferences,
} from "@austechmap/contracts";
import { describe, expect, it } from "vitest";

import {
  applyCandidateProfile,
  mergeSuggestionWithProfile,
} from "./preferences";

const BASE: OpportunityMatchPreferences = {
  roleFamily: "software-engineering",
  skills: ["TypeScript", "React"],
  experienceBand: "any",
  locations: ["Melbourne"],
  locationRequired: true,
  workStyle: "any",
  workStyleRequired: false,
  requiresSponsorship: true,
  prefersRegional: true,
  limit: 25,
};

const PROFILE: CandidateProfile = {
  userId: 42,
  roleFamilyKey: "data",
  roleFamilyLabel: "Data",
  experienceBand: "mid",
  skills: [
    { key: "python", label: "Python" },
    { key: "sql", label: "SQL" },
  ],
  workStyle: "remote",
  workStyleRequired: true,
  locations: ["Sydney"],
  source: "resume_upload",
  createdAt: "2026-10-09T00:00:00.000Z",
  updatedAt: "2026-10-09T00:00:00.000Z",
};

describe("applyCandidateProfile", () => {
  it("replaces the preference fields the profile carries", () => {
    const result = applyCandidateProfile(BASE, PROFILE);

    expect(result).toMatchObject({
      roleFamily: "data",
      skills: ["Python", "SQL"],
      experienceBand: "mid",
      locations: ["Sydney"],
      workStyle: "remote",
      workStyleRequired: true,
    });
  });

  it("keeps the constraint toggles the profile does not carry", () => {
    const result = applyCandidateProfile(BASE, PROFILE);

    expect(result.locationRequired).toBe(true);
    expect(result.requiresSponsorship).toBe(true);
    expect(result.prefersRegional).toBe(true);
    expect(result.limit).toBe(25);
  });

  it("leaves an unset role, skills and locations unset instead of using the demo defaults", () => {
    const result = applyCandidateProfile(BASE, {
      ...PROFILE,
      roleFamilyKey: null,
      roleFamilyLabel: null,
      skills: [],
      locations: [],
    });

    expect(result.roleFamily).toBeUndefined();
    expect(result.skills).toEqual([]);
    expect(result.locations).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const base = structuredClone(BASE);
    applyCandidateProfile(base, PROFILE);
    expect(base).toEqual(BASE);
  });
});

describe("mergeSuggestionWithProfile", () => {
  const NOTHING_DETECTED = {
    roleFamilyKey: null,
    roleFamilyLabel: null,
    experienceBand: "any" as const,
    skills: [{ key: "typescript", label: "TypeScript" }],
    workStyle: "any" as const,
    workStyleRequired: false,
  };

  it("keeps saved values where the new CV gave no signal", () => {
    const merged = mergeSuggestionWithProfile(NOTHING_DETECTED, PROFILE);

    expect(merged).toEqual({
      roleFamilyKey: "data",
      roleFamilyLabel: "Data",
      experienceBand: "mid",
      skills: [{ key: "typescript", label: "TypeScript" }],
      workStyle: "remote",
      workStyleRequired: true,
    });
  });

  it("prefers what the new CV detected, and always takes its skills", () => {
    const merged = mergeSuggestionWithProfile(
      {
        roleFamilyKey: "software-engineering",
        roleFamilyLabel: "Software Engineering",
        experienceBand: "senior",
        skills: [{ key: "go", label: "Go" }],
        workStyle: "hybrid",
        workStyleRequired: false,
      },
      PROFILE,
    );

    expect(merged).toEqual({
      roleFamilyKey: "software-engineering",
      roleFamilyLabel: "Software Engineering",
      experienceBand: "senior",
      skills: [{ key: "go", label: "Go" }],
      workStyle: "hybrid",
      workStyleRequired: false,
    });
  });
});
