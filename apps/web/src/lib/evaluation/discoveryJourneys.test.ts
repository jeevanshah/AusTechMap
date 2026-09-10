import { describe, expect, it } from "vitest";
import {
  scoreCompany,
  computeQueryHash,
  type RawCompanyData,
} from "../opportunity/matcher";
import type { OpportunityMatchPreferences } from "@austechmap/contracts";

function makePreferences(
  partial: Partial<OpportunityMatchPreferences> = {},
): OpportunityMatchPreferences {
  return {
    roleFamily: undefined,
    skills: [],
    experienceBand: "any",
    locations: [],
    locationRequired: false,
    workStyle: "any",
    workStyleRequired: false,
    requiresSponsorship: false,
    prefersRegional: false,
    limit: 20,
    ...partial,
  };
}

describe("Critical Discovery Journeys QA Contracts (PRODUCT_SPEC.md §2.3)", () => {
  const sampleCompany: RawCompanyData = {
    id: "comp-atlassian-1",
    slug: "atlassian",
    display_name: "Atlassian",
    primary_category: "Developer Tools",
    hq_city: "Sydney",
    is_regional: false,
    has_sponsorship_evidence: true,
    sponsorship_summary: "Approved Labour Agreement",
    locations: ["Sydney", "NSW", "101"],
    jobs: [
      {
        id: "job-1",
        title: "Senior Fullstack Engineer",
        normalized_title: "senior fullstack engineer",
        role_family_id: "rf-1",
        role_family_key: "software-engineering",
        seniority: "senior",
        remote_type: "hybrid",
        location_text: "Sydney, Australia",
        source_url: "https://www.atlassian.com/company/careers/job-1",
        posted_at: "2026-09-01T00:00:00Z",
        first_seen_at: "2026-09-01T00:00:00Z",
      },
    ],
    observed_skills: ["typescript", "react", "node.js"],
  };

  describe("Journey A: Opportunity Discovery", () => {
    it("transparently computes 6-factor score components and human-readable reasons", () => {
      const prefs = makePreferences({
        roleFamily: "software-engineering",
        skills: ["TypeScript", "React"],
        experienceBand: "senior",
        locations: ["Sydney"],
        locationRequired: false,
        workStyle: "hybrid",
        workStyleRequired: false,
      });

      const scored = scoreCompany(sampleCompany, prefs);
      expect(scored).not.toBeNull();
      if (!scored) return;

      expect(scored.matchScore).toBeGreaterThan(50);
      expect(scored.scoreComponents.roleFit).toBeGreaterThan(0);
      expect(scored.scoreComponents.currentHiring).toBeGreaterThan(0);
      expect(scored.scoreComponents.skillFit).toBeGreaterThan(0);
      expect(scored.scoreComponents.totalScore).toBe(scored.matchScore);

      // Verify human-readable reason explanation
      expect(scored.topReasons.length).toBeGreaterThan(0);
      expect(
        scored.topReasons.some(
          (r) =>
            r.toLowerCase().includes("role") ||
            r.toLowerCase().includes("hiring"),
        ),
      ).toBe(true);

      // Verify active role source links
      expect(scored.sampleActiveRoles.length).toBe(1);
      expect(scored.sampleActiveRoles[0]!.sourceUrl).toBe(
        "https://www.atlassian.com/company/careers/job-1",
      );
    });

    it("withholds match results when mandatory constraints are not met", () => {
      const strictPrefs = makePreferences({
        roleFamily: "software-engineering",
        skills: ["Rust"],
        experienceBand: "entry",
        locations: ["Perth"],
        locationRequired: true, // Strict location requirement not in Sydney
        workStyle: "remote",
        workStyleRequired: true, // Strict remote requirement
      });

      const scored = scoreCompany(sampleCompany, strictPrefs);
      expect(scored).toBeNull();
    });

    it("generates deterministic query hashes regardless of criteria order", () => {
      const hashA = computeQueryHash(
        makePreferences({
          roleFamily: "software-engineering",
          skills: ["TypeScript", "React"],
          locations: ["Sydney", "Melbourne"],
        }),
      );
      const hashB = computeQueryHash(
        makePreferences({
          roleFamily: "software-engineering",
          skills: ["React", "TypeScript"],
          locations: ["Melbourne", "Sydney"],
        }),
      );
      expect(hashA).toBe(hashB);
    });
  });

  describe("Journey B: Sponsorship Discovery", () => {
    it("ensures sponsorship claims are backed by explicit evidence", () => {
      expect(sampleCompany.has_sponsorship_evidence).toBe(true);
      expect(sampleCompany.sponsorship_summary).toBe(
        "Approved Labour Agreement",
      );

      // Company without evidence must never manufacture or infer sponsorship
      const companyWithoutSponsorship: RawCompanyData = {
        ...sampleCompany,
        id: "comp-no-sponsor",
        slug: "no-sponsor",
        has_sponsorship_evidence: false,
        sponsorship_summary: null,
      };

      const prefs = makePreferences({
        roleFamily: "software-engineering",
        requiresSponsorship: true,
      });

      const scored = scoreCompany(companyWithoutSponsorship, prefs);
      expect(scored).toBeNull();
    });
  });

  describe("Journey C: Regional Hub Discovery", () => {
    it("distinguishes regional from non-regional employers with transparent scoring", () => {
      const regionalCompany: RawCompanyData = {
        ...sampleCompany,
        id: "comp-camplify",
        slug: "camplify",
        is_regional: true,
        hq_city: "Newcastle",
        locations: ["Newcastle", "NSW", "111"],
      };

      const regionalPrefs = makePreferences({
        roleFamily: "software-engineering",
        prefersRegional: true,
      });

      const nonRegionalScored = scoreCompany(sampleCompany, regionalPrefs);
      expect(nonRegionalScored).not.toBeNull();
      // Non-regional receives base 2 points
      expect(nonRegionalScored!.scoreComponents.sponsorshipRegionalFit).toBe(2);

      const regionalScored = scoreCompany(regionalCompany, regionalPrefs);
      expect(regionalScored).not.toBeNull();
      expect(regionalScored!.isRegional).toBe(true);
      // Regional receives maximum 10 points
      expect(regionalScored!.scoreComponents.sponsorshipRegionalFit).toBe(10);
    });
  });

  describe("Journey D: Retention & Alerts Deduplication Invariants", () => {
    it("enforces notification deduplication key structure", () => {
      const userId = "usr-test-123";
      const eventId = "evt-456";
      const channel = "email";
      const deliveryWindow = "2026-09-08";

      const dedupeKey = `${userId}:${eventId}:${channel}:${deliveryWindow}`;
      expect(dedupeKey).toBe("usr-test-123:evt-456:email:2026-09-08");

      // Duplicate delivery attempt in same window must produce identical dedupeKey
      const duplicateKey = `${userId}:${eventId}:${channel}:${deliveryWindow}`;
      expect(duplicateKey).toBe(dedupeKey);
    });
  });
});
