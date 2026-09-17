import { describe, expect, it } from "vitest";
import { sanitizeCallbackUrl } from "./callback-url";

describe("sanitizeCallbackUrl", () => {
  it("allows standard relative URLs", () => {
    expect(sanitizeCallbackUrl("/account")).toBe("/account");
    expect(sanitizeCallbackUrl("/account/watchlist")).toBe("/account/watchlist");
    expect(sanitizeCallbackUrl("/jobs?q=engineer")).toBe("/jobs?q=engineer");
  });

  it("defaults to /account for empty or invalid types", () => {
    expect(sanitizeCallbackUrl(null)).toBe("/account");
    expect(sanitizeCallbackUrl(undefined)).toBe("/account");
    expect(sanitizeCallbackUrl("")).toBe("/account");
    expect(sanitizeCallbackUrl("   ")).toBe("/account");
  });

  it("blocks protocol-relative or external URL redirects", () => {
    expect(sanitizeCallbackUrl("https://phishing.com")).toBe("/account");
    expect(sanitizeCallbackUrl("http://phishing.com")).toBe("/account");
    expect(sanitizeCallbackUrl("//phishing.com")).toBe("/account");
    expect(sanitizeCallbackUrl("/\\phishing.com")).toBe("/account");
  });
});
