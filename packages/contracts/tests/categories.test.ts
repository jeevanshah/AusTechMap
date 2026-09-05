import { describe, expect, it } from "vitest";

import { CategoriesResponseSchema } from "../src/index.js";

const validCategory = {
  key: "fintech",
  label: "Fintech",
  groupKey: "financial",
  groupLabel: "Financial",
};

describe("CategoriesResponseSchema", () => {
  it("accepts a valid versioned response", () => {
    expect(
      CategoriesResponseSchema.parse({
        version: 1,
        categories: [validCategory],
      }),
    ).toEqual({
      version: 1,
      categories: [validCategory],
    });
  });

  it("accepts an empty category list", () => {
    expect(
      CategoriesResponseSchema.parse({ version: 1, categories: [] }),
    ).toEqual({ version: 1, categories: [] });
  });

  it("rejects a category missing a label", () => {
    expect(() =>
      CategoriesResponseSchema.parse({
        version: 1,
        categories: [{ ...validCategory, label: "" }],
      }),
    ).toThrow();
  });

  it("rejects a missing version", () => {
    expect(() =>
      CategoriesResponseSchema.parse({ categories: [validCategory] }),
    ).toThrow();
  });
});
