import { describe, expect, it } from "vitest";
import {
  createUnsubscribeToken,
  verifyUnsubscribeToken,
} from "./unsubscribeToken";

const SECRET = "test-secret-value-that-is-long-enough";

describe("unsubscribe tokens", () => {
  it("round-trips a user id", () => {
    const token = createUnsubscribeToken(42, SECRET);
    expect(verifyUnsubscribeToken(token, SECRET)).toBe(42);
  });

  it("rejects a token signed with another secret", () => {
    const token = createUnsubscribeToken(42, SECRET);
    expect(verifyUnsubscribeToken(token, "different-secret")).toBeNull();
  });

  it("rejects a token whose user id was changed", () => {
    const token = createUnsubscribeToken(42, SECRET);
    const forged = token.replace(/^42\./, "43.");
    expect(verifyUnsubscribeToken(forged, SECRET)).toBeNull();
  });

  it("rejects malformed, empty and oversized input", () => {
    for (const bad of [
      "",
      null,
      undefined,
      "42",
      "42.",
      ".abc",
      "42.abc.def",
      "0.abc",
      "-1.abc",
      "042.abc",
      "1e3.abc",
      `42.${"a".repeat(500)}`,
    ]) {
      expect(verifyUnsubscribeToken(bad as string, SECRET)).toBeNull();
    }
  });

  it("refuses to sign without a secret or with an invalid id", () => {
    expect(() => createUnsubscribeToken(42, "")).toThrow();
    expect(() => createUnsubscribeToken(0, SECRET)).toThrow();
    expect(() => createUnsubscribeToken(1.5, SECRET)).toThrow();
    expect(
      verifyUnsubscribeToken(createUnsubscribeToken(7, SECRET), ""),
    ).toBeNull();
  });
});
