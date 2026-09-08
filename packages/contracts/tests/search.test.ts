import { describe, expect, it } from "vitest";

import {
  CompanySearchResponseSchema,
  RegionOpportunityResponseSchema,
} from "../src/index.js";

const validResult = {
  slug: "acme",
  name: "Acme",
  domain: "acme.example.com",
  matchType: "name" as const,
  matchedText: null,
  score: 0.9,
  city: "Sydney",
  primaryCategory: "Fintech",
  hasSponsorshipEvidence: false,
  isRegional: false,
};

describe("CompanySearchResponseSchema", () => {
  it("accepts a valid versioned response", () => {
    expect(
      CompanySearchResponseSchema.parse({
        version: 1,
        query: "acme",
        results: [validResult],
      }),
    ).toEqual({
      version: 1,
      query: "acme",
      results: [validResult],
    });
  });

  it("rejects more than 20 results", () => {
    const results = Array.from({ length: 21 }, (_, i) => ({
      ...validResult,
      slug: `acme-${i}`,
    }));
    expect(() =>
      CompanySearchResponseSchema.parse({ version: 1, query: "acme", results }),
    ).toThrow();
  });

  it("rejects a matchType outside the known enum", () => {
    expect(() =>
      CompanySearchResponseSchema.parse({
        version: 1,
        query: "acme",
        results: [{ ...validResult, matchType: "fuzzy" }],
      }),
    ).toThrow();
  });
});

describe("RegionOpportunityResponseSchema", () => {
  const suppressedResponse = {
    version: 1 as const,
    region: { code: "101", name: "Capital Region", type: "sa4" as const },
    summary: {
      employerCount: 2,
      monitoredEmployerCount: 0,
      activeJobCount: 0,
      industryCount: 1,
    },
    migrationContext: { categories: ["category_2" as const], damaNames: [] },
    employers: [],
    jobs: [],
    laborSignals: [],
    score: {
      value: null,
      methodologyVersion: "regional-opportunity-v1",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
      generatedAt: "2026-09-08T12:00:00+10:00",
      components: {},
      sufficiency: {
        sufficient: false,
        reasons: ["missing_nero", "missing_ivi"],
      },
    },
  };

  it("accepts an honest suppressed regional score", () => {
    const parsed = RegionOpportunityResponseSchema.parse(suppressedResponse);

    expect(parsed.score.value).toBeNull();
    expect(parsed.score.sufficiency.reasons).toEqual([
      "missing_nero",
      "missing_ivi",
    ]);
  });

  it("rejects a score outside the published 0-100 range", () => {
    expect(() =>
      RegionOpportunityResponseSchema.parse({
        ...suppressedResponse,
        score: {
          ...suppressedResponse.score,
          value: 101,
          sufficiency: { sufficient: true, reasons: [] },
        },
      }),
    ).toThrow();
  });

  it("rejects a score value that contradicts its sufficiency state", () => {
    expect(() =>
      RegionOpportunityResponseSchema.parse({
        ...suppressedResponse,
        score: {
          ...suppressedResponse.score,
          value: 58.19,
        },
      }),
    ).toThrow();

    expect(() =>
      RegionOpportunityResponseSchema.parse({
        ...suppressedResponse,
        score: {
          ...suppressedResponse.score,
          sufficiency: { sufficient: true, reasons: [] },
        },
      }),
    ).toThrow();
  });
});
