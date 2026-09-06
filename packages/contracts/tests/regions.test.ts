import { describe, expect, it } from "vitest";

import { RegionalHubsResponseSchema } from "../src/index.js";

const validHub = {
  city: "Wollongong",
  count: 3,
};

describe("RegionalHubsResponseSchema", () => {
  it("accepts a valid versioned response", () => {
    expect(
      RegionalHubsResponseSchema.parse({
        version: 1,
        hubs: [validHub],
      }),
    ).toEqual({
      version: 1,
      hubs: [validHub],
    });
  });

  it("accepts an empty hub list", () => {
    expect(RegionalHubsResponseSchema.parse({ version: 1, hubs: [] })).toEqual({
      version: 1,
      hubs: [],
    });
  });

  it("rejects a hub with a non-positive count", () => {
    expect(() =>
      RegionalHubsResponseSchema.parse({
        version: 1,
        hubs: [{ ...validHub, count: 0 }],
      }),
    ).toThrow();
  });

  it("rejects a missing version", () => {
    expect(() =>
      RegionalHubsResponseSchema.parse({ hubs: [validHub] }),
    ).toThrow();
  });
});
