import { describe, expect, it } from "vitest";
import { GOLDEN_QUERIES } from "./goldenQueries";

describe("Phase 7 Golden Discovery Queries Definition", () => {
  it("contains all critical golden queries from docs/golden-queries.md", () => {
    const ids = GOLDEN_QUERIES.map((q) => q.id);
    expect(ids).toContain("GQ-01");
    expect(ids).toContain("GQ-02");
    expect(ids).toContain("GQ-04");
    expect(ids).toContain("GQ-05");
    expect(ids).toContain("GQ-08");
    expect(ids).toContain("GQ-09");
    expect(ids).toContain("GQ-19");
    expect(ids).toContain("GQ-21");
    expect(ids).toContain("GQ-22");
    expect(ids).toContain("GQ-24");
    expect(ids).toContain("GQ-25");
  });

  it("GQ-24 asserts an honest empty state for non-existent criteria", () => {
    const gq24 = GOLDEN_QUERIES.find((q) => q.id === "GQ-24");
    expect(gq24).toBeDefined();

    // With 0 results -> should pass with grade 3 and 0 violations
    const passAssertion = gq24!.expectedAssertions({
      id: "GQ-24",
      latencyMs: 15,
      resultsCount: 0,
      topResults: [],
    });
    expect(passAssertion.passed).toBe(true);
    expect(passAssertion.grade).toBe(3);
    expect(passAssertion.violations).toBe(0);

    // If results were hallucinated -> must fail with grade 0
    const failAssertion = gq24!.expectedAssertions({
      id: "GQ-24",
      latencyMs: 15,
      resultsCount: 2,
      topResults: [
        { name: "Fake Astronaut Corp", slug: "fake" },
        { name: "Quantum Spacewalk", slug: "quantum" },
      ],
    });
    expect(failAssertion.passed).toBe(false);
    expect(failAssertion.grade).toBe(0);
    expect(failAssertion.violations).toBe(2);
  });

  it("GQ-19 asserts zero unsupported sponsorship claims", () => {
    const gq19 = GOLDEN_QUERIES.find((q) => q.id === "GQ-19");
    expect(gq19).toBeDefined();

    // Valid case: company with verified sponsorship
    const passAssertion = gq19!.expectedAssertions({
      id: "GQ-19",
      latencyMs: 18,
      resultsCount: 1,
      topResults: [
        {
          name: "Atlassian",
          slug: "atlassian",
          hasSponsorship: true,
          topReasons: ["Approved Labour Agreement"],
        },
      ],
    });
    expect(passAssertion.passed).toBe(true);
    expect(passAssertion.violations).toBe(0);

    // Invalid case: unverified company claiming sponsorship
    const failAssertion = gq19!.expectedAssertions({
      id: "GQ-19",
      latencyMs: 18,
      resultsCount: 1,
      topResults: [
        {
          name: "Unverified Inc",
          slug: "unverified",
          hasSponsorship: false,
          topReasons: ["Approved Labour Agreement: Inferred"],
        },
      ],
    });
    expect(failAssertion.passed).toBe(false);
    expect(failAssertion.violations).toBe(1);
  });
});
