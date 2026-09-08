import { describe, expect, it } from "vitest";
import {
  computeQueryHash,
  type RawCompanyData,
  scoreCompany,
} from "./matcher";
import type { OpportunityMatchPreferences } from "@austechmap/contracts";

describe("Opportunity Matcher Engine", () => {
  const baseCompany: RawCompanyData = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    slug: "canva",
    display_name: "Canva",
    primary_category: "Design Software",
    hq_city: "Sydney",
    is_regional: false,
    has_sponsorship_evidence: true,
    sponsorship_summary: "Approved Labour Agreement (Skilled Refugee Pilot)",
    locations: ["Sydney", "NSW", "101"],
    jobs: [
      {
        id: "223e4567-e89b-12d3-a456-426614174000",
        title: "Senior Backend Engineer",
        normalized_title: "senior backend engineer",
        role_family_id: "rf-1",
        role_family_key: "software-engineering",
        seniority: "senior",
        remote_type: "hybrid",
        location_text: "Sydney, Australia",
        source_url: "https://canva.com/careers/1",
        posted_at: "2026-09-01T00:00:00Z",
        first_seen_at: "2026-09-01T00:00:00Z",
      },
      {
        id: "323e4567-e89b-12d3-a456-426614174000",
        title: "Frontend Engineer (React)",
        normalized_title: "frontend engineer react",
        role_family_id: "rf-1",
        role_family_key: "software-engineering",
        seniority: "mid",
        remote_type: "remote",
        location_text: "Remote, Australia",
        source_url: "https://canva.com/careers/2",
        posted_at: "2026-09-02T00:00:00Z",
        first_seen_at: "2026-09-02T00:00:00Z",
      },
    ],
    observed_skills: ["typescript", "react", "java", "aws"],
  };

  describe("computeQueryHash", () => {
    it("produces deterministic hash regardless of array ordering or letter casing", () => {
      const pref1: OpportunityMatchPreferences = {
        roleFamily: "Software-Engineering",
        skills: ["React", "TypeScript"],
        experienceBand: "senior",
        locations: ["Sydney", "Melbourne"],
        locationRequired: false,
        workStyle: "hybrid",
        workStyleRequired: false,
        requiresSponsorship: true,
        prefersRegional: false,
        limit: 20,
      };

      const pref2: OpportunityMatchPreferences = {
        roleFamily: "software-engineering",
        skills: ["typescript", "react"],
        experienceBand: "senior",
        locations: ["melbourne", "sydney"],
        locationRequired: false,
        workStyle: "hybrid",
        workStyleRequired: false,
        requiresSponsorship: true,
        prefersRegional: false,
        limit: 20,
      };

      expect(computeQueryHash(pref1)).toBe(computeQueryHash(pref2));
    });

    it("changes hash when preference constraint changes", () => {
      const pref1: OpportunityMatchPreferences = {
        roleFamily: "software-engineering",
        skills: ["typescript"],
        experienceBand: "senior",
        locations: [],
        locationRequired: false,
        workStyle: "any",
        workStyleRequired: false,
        requiresSponsorship: false,
        prefersRegional: false,
        limit: 20,
      };

      const pref2 = { ...pref1, requiresSponsorship: true };
      expect(computeQueryHash(pref1)).not.toBe(computeQueryHash(pref2));
    });
  });

  describe("scoreCompany", () => {
    it("calculates accurate score components for a strong match", () => {
      const pref: OpportunityMatchPreferences = {
        roleFamily: "software-engineering",
        skills: ["typescript", "react"],
        experienceBand: "senior",
        locations: ["Sydney"],
        locationRequired: false,
        workStyle: "hybrid",
        workStyleRequired: false,
        requiresSponsorship: true,
        prefersRegional: false,
        limit: 20,
      };

      const result = scoreCompany(baseCompany, pref);
      expect(result).not.toBeNull();
      expect(result!.companyName).toBe("Canva");
      expect(result!.scoreComponents.roleFit).toBe(30); // exact role family + senior
      expect(result!.scoreComponents.currentHiring).toBe(12); // 2 active roles
      expect(result!.scoreComponents.skillFit).toBe(15); // 2 of 2 skills matched (100%)
      expect(result!.scoreComponents.locationWorkStyleFit).toBe(15); // Sydney + Hybrid match
      expect(result!.scoreComponents.hiringMomentum).toBe(7);
      expect(result!.scoreComponents.sponsorshipRegionalFit).toBe(10); // verified agreement
      expect(result!.matchScore).toBe(89);
      expect(result!.matchedSkills).toEqual(["typescript", "react"]);
      expect(result!.missingSkills).toEqual([]);
      expect(result!.topReasons.length).toBeGreaterThan(0);
    });

    it("enforces locationRequired hard constraint", () => {
      const pref: OpportunityMatchPreferences = {
        roleFamily: "software-engineering",
        skills: [],
        experienceBand: "any",
        locations: ["Brisbane"],
        locationRequired: true,
        workStyle: "any",
        workStyleRequired: false,
        requiresSponsorship: false,
        prefersRegional: false,
        limit: 20,
      };

      const result = scoreCompany(baseCompany, pref);
      expect(result).toBeNull(); // Canva has Sydney/NSW, not Brisbane
    });

    it("enforces workStyleRequired hard constraint", () => {
      const onsiteOnlyCompany: RawCompanyData = {
        ...baseCompany,
        jobs: [
          {
            id: "223e4567-e89b-12d3-a456-426614174000",
            title: "Senior Backend Engineer",
            normalized_title: "senior backend engineer",
            role_family_id: "rf-1",
            role_family_key: "software-engineering",
            seniority: "senior",
            remote_type: "onsite",
            location_text: "Sydney, Australia",
            source_url: "https://canva.com/careers/1",
            posted_at: "2026-09-01T00:00:00Z",
            first_seen_at: "2026-09-01T00:00:00Z",
          },
        ],
      };

      const pref: OpportunityMatchPreferences = {
        roleFamily: "software-engineering",
        skills: [],
        experienceBand: "any",
        locations: [],
        locationRequired: false,
        workStyle: "remote",
        workStyleRequired: true,
        requiresSponsorship: false,
        prefersRegional: false,
        limit: 20,
      };

      const result = scoreCompany(onsiteOnlyCompany, pref);
      expect(result).toBeNull(); // Onsite only when remote is strictly required
    });

    it("handles missing skills gracefully without zero-dividing", () => {
      const pref: OpportunityMatchPreferences = {
        roleFamily: "software-engineering",
        skills: ["rust", "solidity", "elixir"],
        experienceBand: "any",
        locations: [],
        locationRequired: false,
        workStyle: "any",
        workStyleRequired: false,
        requiresSponsorship: false,
        prefersRegional: false,
        limit: 20,
      };

      const result = scoreCompany(baseCompany, pref);
      expect(result).not.toBeNull();
      expect(result!.scoreComponents.skillFit).toBe(0);
      expect(result!.matchedSkills).toEqual([]);
      expect(result!.missingSkills).toEqual(["rust", "solidity", "elixir"]);
    });
  });
});
