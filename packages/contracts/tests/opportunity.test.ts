import { describe, expect, it } from "vitest";
import {
  OpportunityMatchPreferencesSchema,
  OpportunityScoreComponentsSchema,
  OpportunityMatchResponseSchema,
} from "../src/index.js";

describe("Phase 7 Opportunity Match Contracts", () => {
  it("validates OpportunityMatchPreferences with defaults", () => {
    const preferences = {
      roleFamily: "software-engineering",
      skills: ["typescript", "react"],
    };
    const parsed = OpportunityMatchPreferencesSchema.parse(preferences);
    expect(parsed.roleFamily).toBe("software-engineering");
    expect(parsed.skills).toEqual(["typescript", "react"]);
    expect(parsed.experienceBand).toBe("any");
    expect(parsed.workStyle).toBe("any");
    expect(parsed.locationRequired).toBe(false);
    expect(parsed.requiresSponsorship).toBe(false);
    expect(parsed.limit).toBe(20);
  });

  it("validates OpportunityScoreComponents range and constraints", () => {
    const validScores = {
      roleFit: 28.5,
      currentHiring: 18.0,
      skillFit: 14.0,
      locationWorkStyleFit: 15.0,
      hiringMomentum: 8.5,
      sponsorshipRegionalFit: 10.0,
      totalScore: 94.0,
    };
    const parsed = OpportunityScoreComponentsSchema.parse(validScores);
    expect(parsed.totalScore).toBe(94.0);
    expect(parsed.roleFit).toBeLessThanOrEqual(30);
    expect(parsed.currentHiring).toBeLessThanOrEqual(20);
    expect(parsed.skillFit).toBeLessThanOrEqual(15);
    expect(parsed.locationWorkStyleFit).toBeLessThanOrEqual(15);
    expect(parsed.hiringMomentum).toBeLessThanOrEqual(10);
    expect(parsed.sponsorshipRegionalFit).toBeLessThanOrEqual(10);
  });

  it("rejects OpportunityScoreComponents that exceed maximums", () => {
    expect(() =>
      OpportunityScoreComponentsSchema.parse({
        roleFit: 35, // max 30
        currentHiring: 20,
        skillFit: 15,
        locationWorkStyleFit: 15,
        hiringMomentum: 10,
        sponsorshipRegionalFit: 10,
        totalScore: 105,
      }),
    ).toThrow();
  });

  it("validates full OpportunityMatchResponseSchema", () => {
    const matchResult = {
      companyId: "123e4567-e89b-12d3-a456-426614174000",
      companyName: "Atlassian",
      companySlug: "atlassian",
      primaryCategory: "Enterprise Software",
      hqCity: "Sydney",
      matchScore: 92,
      scoreComponents: {
        roleFit: 30,
        currentHiring: 20,
        skillFit: 14,
        locationWorkStyleFit: 14,
        hiringMomentum: 8,
        sponsorshipRegionalFit: 6,
        totalScore: 92,
      },
      topReasons: [
        "Active Software Engineering hiring in Sydney",
        "Observed TypeScript and React skill demand",
        "Verified accredited sponsor with Department of Home Affairs",
      ],
      matchedSkills: ["typescript", "react"],
      missingSkills: ["rust"],
      activeRolesCount: 12,
      sampleActiveRoles: [
        {
          id: "223e4567-e89b-12d3-a456-426614174000",
          title: "Senior Fullstack Engineer",
          locationText: "Sydney, NSW",
          remoteType: "hybrid",
          sourceUrl: "https://atlassian.com/careers/1",
        },
      ],
      hasSponsorshipEvidence: true,
      sponsorshipSummary: "Current Labour Agreement (Home Affairs accredited)",
      isRegional: false,
      dataQuality: "high" as const,
      methodologyVersion: "v1.0",
      generatedAt: new Date().toISOString(),
    };

    const response = {
      version: 1 as const,
      queryHash:
        "a1b2c3d4e5f67890abcdef1234567890abcdef1234567890abcdef1234567890",
      totalMatches: 1,
      matches: [matchResult],
    };

    const parsed = OpportunityMatchResponseSchema.parse(response);
    expect(parsed.totalMatches).toBe(1);
    expect(parsed.matches[0].companyName).toBe("Atlassian");
    expect(parsed.matches[0].scoreComponents.roleFit).toBe(30);
  });
});
