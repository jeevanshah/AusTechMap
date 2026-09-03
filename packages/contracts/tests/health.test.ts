import { describe, expect, it } from "vitest";

import { HealthResponseSchema } from "../src/index.js";

describe("HealthResponseSchema", () => {
  it("accepts a valid versioned response", () => {
    expect(
      HealthResponseSchema.parse({
        service: "ingestion",
        status: "ok",
        version: 1,
        runId: "run-1",
      }),
    ).toEqual({
      service: "ingestion",
      status: "ok",
      version: 1,
      runId: "run-1",
    });
  });

  it("rejects unknown contract versions", () => {
    expect(() =>
      HealthResponseSchema.parse({ service: "web", status: "ok", version: 2 }),
    ).toThrow();
  });
});
