import { describe, expect, it } from "vitest";

import { CompanySearchResponseSchema } from "../src/index.js";

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
