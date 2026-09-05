import { describe, expect, it } from "vitest";

import { MapCompaniesResponseSchema } from "../src/index.js";

const validPoint = {
  slug: "acme",
  name: "Acme",
  lat: -33.8688,
  lng: 151.2093,
  locationType: "head_office" as const,
  careersUrl: "https://acme.example.com/careers",
  city: "Sydney",
  primaryCategory: "Fintech",
  hasSponsorshipEvidence: false,
};

describe("MapCompaniesResponseSchema", () => {
  it("accepts a valid versioned response", () => {
    expect(
      MapCompaniesResponseSchema.parse({
        version: 1,
        bbox: { west: 150, south: -34, east: 152, north: -33 },
        points: [validPoint],
        truncated: false,
      }),
    ).toEqual({
      version: 1,
      bbox: { west: 150, south: -34, east: 152, north: -33 },
      points: [validPoint],
      truncated: false,
    });
  });

  it("rejects a point outside Australia's latitude/longitude bounds", () => {
    expect(() =>
      MapCompaniesResponseSchema.parse({
        version: 1,
        bbox: { west: 150, south: -34, east: 152, north: -33 },
        points: [{ ...validPoint, lat: 40, lng: -74 }],
        truncated: false,
      }),
    ).toThrow();
  });

  it("rejects more than 500 points", () => {
    const points = Array.from({ length: 501 }, (_, i) => ({
      ...validPoint,
      slug: `acme-${i}`,
    }));
    expect(() =>
      MapCompaniesResponseSchema.parse({
        version: 1,
        bbox: { west: 150, south: -34, east: 152, north: -33 },
        points,
        truncated: true,
      }),
    ).toThrow();
  });

  it("rejects a missing version", () => {
    expect(() =>
      MapCompaniesResponseSchema.parse({
        bbox: { west: 150, south: -34, east: 152, north: -33 },
        points: [],
        truncated: false,
      }),
    ).toThrow();
  });
});
