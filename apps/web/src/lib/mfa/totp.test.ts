import { Secret } from "otpauth";
import { describe, expect, it } from "vitest";

import { validateTotpToken } from "./totp";

// RFC 6238 Appendix B's own published SHA-1 test vectors (8-digit tokens,
// seed "12345678901234567890", 30s period) -- real, known-good data, not
// an invented fixture. Our config is 6 digits; a TOTP's N-digit truncation
// is `binary_code mod 10^N`, so the 6-digit token is mathematically just
// the last 6 digits of the published 8-digit one (10^6 divides 10^8).
const RFC_SEED = Secret.fromUTF8("12345678901234567890");

const RFC_VECTORS: Array<[number, string]> = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
];

describe("validateTotpToken", () => {
  it.each(RFC_VECTORS)(
    "accepts the real RFC 6238 vector at t=%i",
    (timestampSeconds, token) => {
      const result = validateTotpToken({
        token,
        secret: RFC_SEED,
        lastAcceptedStep: null,
        now: new Date(timestampSeconds * 1000),
      });
      expect(result.valid).toBe(true);
      expect(result.acceptedStep).not.toBeNull();
    },
  );

  it("rejects a wrong token", () => {
    const result = validateTotpToken({
      token: "000000",
      secret: RFC_SEED,
      lastAcceptedStep: null,
      now: new Date(59 * 1000),
    });
    expect(result.valid).toBe(false);
    expect(result.acceptedStep).toBeNull();
  });

  it("rejects a replayed (already-accepted) step", () => {
    const first = validateTotpToken({
      token: "287082",
      secret: RFC_SEED,
      lastAcceptedStep: null,
      now: new Date(59 * 1000),
    });
    expect(first.valid).toBe(true);

    const replay = validateTotpToken({
      token: "287082",
      secret: RFC_SEED,
      lastAcceptedStep: first.acceptedStep,
      now: new Date(59 * 1000),
    });
    expect(replay.valid).toBe(false);
  });

  it("accepts one adjacent time step (window=1)", () => {
    // 1111111109 is one 30s step before 1111111111's own vector's window
    const result = validateTotpToken({
      token: "081804", // vector for t=1111111109
      secret: RFC_SEED,
      lastAcceptedStep: null,
      now: new Date(1111111109 * 1000 + 25_000), // 25s later, same 30s step boundary padding
    });
    expect(result.valid).toBe(true);
  });
});
