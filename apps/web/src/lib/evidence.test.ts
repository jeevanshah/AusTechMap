import { describe, expect, it } from "vitest";

import { EVIDENCE_STATUSES, isEvidenceStatus } from "./evidence";

describe("evidence lifecycle statuses", () => {
  it("accepts exactly the product-spec lifecycle states", () => {
    expect(EVIDENCE_STATUSES).toEqual([
      "active",
      "stale",
      "superseded",
      "rejected",
      "needs_review",
    ]);
    for (const status of EVIDENCE_STATUSES) {
      expect(isEvidenceStatus(status)).toBe(true);
    }
    expect(isEvidenceStatus("unverified")).toBe(false);
    expect(isEvidenceStatus("")).toBe(false);
  });
});
