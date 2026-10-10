import { describe, expect, it } from "vitest";
import {
  jobMatchesProfile,
  type JobForMatch,
  type ProfileForMatch,
} from "./jobMatch";

const profile = (over: Partial<ProfileForMatch> = {}): ProfileForMatch => ({
  roleFamilyKey: "software-engineering",
  experienceBand: "senior",
  skillKeys: ["typescript", "react"],
  workStyle: "any",
  workStyleRequired: false,
  locations: [],
  ...over,
});

const job = (over: Partial<JobForMatch> = {}): JobForMatch => ({
  roleFamilyKey: "software-engineering",
  seniority: "senior",
  remoteType: "hybrid",
  locationText: "Sydney, NSW",
  skillKeys: ["typescript"],
  ...over,
});

describe("jobMatchesProfile", () => {
  it("matches the happy path", () => {
    expect(jobMatchesProfile(job(), profile())).toBe(true);
  });

  it("requires a signal: an empty profile matches nothing", () => {
    expect(
      jobMatchesProfile(job(), profile({ roleFamilyKey: null, skillKeys: [] })),
    ).toBe(false);
  });

  it("requires the same role family when the profile has one", () => {
    expect(jobMatchesProfile(job({ roleFamilyKey: "data" }), profile())).toBe(
      false,
    );
    expect(jobMatchesProfile(job({ roleFamilyKey: null }), profile())).toBe(
      false,
    );
  });

  it("requires a shared skill only when both sides state skills", () => {
    expect(jobMatchesProfile(job({ skillKeys: ["cobol"] }), profile())).toBe(
      false,
    );
    expect(jobMatchesProfile(job({ skillKeys: [] }), profile())).toBe(true);
    expect(jobMatchesProfile(job(), profile({ skillKeys: [] }))).toBe(true);
  });

  it("matches on skills alone when the profile has no role family", () => {
    const skillsOnly = profile({ roleFamilyKey: null });
    expect(jobMatchesProfile(job({ roleFamilyKey: "data" }), skillsOnly)).toBe(
      true,
    );
    expect(
      jobMatchesProfile(
        job({ roleFamilyKey: "data", skillKeys: ["cobol"] }),
        skillsOnly,
      ),
    ).toBe(false);
    expect(jobMatchesProfile(job({ skillKeys: [] }), skillsOnly)).toBe(false);
  });

  it("maps job seniority to bands and alerts for own band and one above only", () => {
    const senior = profile({ experienceBand: "senior" });
    expect(jobMatchesProfile(job({ seniority: "senior" }), senior)).toBe(true);
    expect(
      jobMatchesProfile(job({ seniority: "staff_principal" }), senior),
    ).toBe(true);
    expect(jobMatchesProfile(job({ seniority: "management" }), senior)).toBe(
      true,
    );
    expect(jobMatchesProfile(job({ seniority: "mid" }), senior)).toBe(false);
    expect(jobMatchesProfile(job({ seniority: "junior" }), senior)).toBe(false);

    const entry = profile({ experienceBand: "entry" });
    expect(jobMatchesProfile(job({ seniority: "junior" }), entry)).toBe(true);
    expect(jobMatchesProfile(job({ seniority: "mid" }), entry)).toBe(true);
    expect(jobMatchesProfile(job({ seniority: "senior" }), entry)).toBe(false);
  });

  it("never excludes on unknown seniority or an 'any' experience band", () => {
    expect(jobMatchesProfile(job({ seniority: "unknown" }), profile())).toBe(
      true,
    );
    expect(jobMatchesProfile(job({ seniority: null }), profile())).toBe(true);
    expect(
      jobMatchesProfile(
        job({ seniority: "junior" }),
        profile({ experienceBand: "any" }),
      ),
    ).toBe(true);
  });

  it("applies work style only when the profile marks it required", () => {
    const loose = profile({ workStyle: "remote", workStyleRequired: false });
    expect(jobMatchesProfile(job({ remoteType: "onsite" }), loose)).toBe(true);

    const strict = profile({ workStyle: "remote", workStyleRequired: true });
    expect(jobMatchesProfile(job({ remoteType: "onsite" }), strict)).toBe(
      false,
    );
    expect(jobMatchesProfile(job({ remoteType: "unknown" }), strict)).toBe(
      false,
    );
    expect(jobMatchesProfile(job({ remoteType: "remote" }), strict)).toBe(true);
    expect(
      jobMatchesProfile(job({ remoteType: "flexible_mixed" }), strict),
    ).toBe(true);
  });

  it("checks locations against the job's stated location, case-insensitively", () => {
    const sydney = profile({ locations: ["sydney"] });
    expect(
      jobMatchesProfile(job({ locationText: "Sydney, NSW" }), sydney),
    ).toBe(true);
    expect(
      jobMatchesProfile(job({ locationText: "Melbourne, VIC" }), sydney),
    ).toBe(false);
  });

  it("lets remote roles and roles with no stated location through the location check", () => {
    const sydney = profile({ locations: ["Sydney"] });
    expect(
      jobMatchesProfile(
        job({ remoteType: "remote", locationText: "Perth" }),
        sydney,
      ),
    ).toBe(true);
    expect(jobMatchesProfile(job({ locationText: null }), sydney)).toBe(true);
  });
});
