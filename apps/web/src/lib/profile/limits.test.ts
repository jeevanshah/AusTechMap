import { CANDIDATE_PROFILE_LIMITS } from "@austechmap/contracts";
import { describe, expect, it } from "vitest";

import { MAX_PROFILE_LOCATION_CHARS, MAX_PROFILE_LOCATIONS } from "./limits";

describe("profile limits", () => {
  it("match the bounds the contract enforces on save", () => {
    expect(MAX_PROFILE_LOCATIONS).toBe(CANDIDATE_PROFILE_LIMITS.maxLocations);
    expect(MAX_PROFILE_LOCATION_CHARS).toBe(
      CANDIDATE_PROFILE_LIMITS.maxLocationChars,
    );
  });
});
