import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("../../../auth", () => ({
  signIn: vi.fn(),
}));

vi.mock("../../../lib/db", () => ({
  getPool: vi.fn(() => ({})),
}));

vi.mock("../../../lib/request-ip", () => ({
  currentClientIp: vi.fn().mockResolvedValue("203.0.113.50"),
}));

vi.mock("../../../lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

import { redirect } from "next/navigation";
import { signIn } from "../../../auth";
import { checkRateLimit } from "../../../lib/rate-limit";
import { sanitizeCallbackUrl } from "../../../lib/auth/callback-url";
import {
  signInWithProvider,
  requestMagicLink,
} from "./actions";

describe("sanitizeCallbackUrl", () => {
  it("allows standard valid relative paths", () => {
    expect(sanitizeCallbackUrl("/account")).toBe("/account");
    expect(sanitizeCallbackUrl("/jobs?q=sydney")).toBe("/jobs?q=sydney");
    expect(sanitizeCallbackUrl("/companies/canva")).toBe("/companies/canva");
  });

  it("rejects non-string values and defaults to /account", () => {
    expect(sanitizeCallbackUrl(null)).toBe("/account");
    expect(sanitizeCallbackUrl(undefined)).toBe("/account");
    expect(sanitizeCallbackUrl(123)).toBe("/account");
  });

  it("rejects open-redirect attack vectors and defaults to /account", () => {
    expect(sanitizeCallbackUrl("https://evil.com")).toBe("/account");
    expect(sanitizeCallbackUrl("http://evil.com")).toBe("/account");
    expect(sanitizeCallbackUrl("//evil.com")).toBe("/account");
    expect(sanitizeCallbackUrl("/\\evil.com")).toBe("/account");
    expect(sanitizeCallbackUrl("javascript:alert(1)")).toBe("/account");
  });
});

describe("signInWithProvider", () => {
  beforeEach(() => {
    vi.mocked(signIn).mockReset();
  });

  it("calls signIn with google and sanitized callbackUrl", async () => {
    await signInWithProvider("google", "/jobs");
    expect(signIn).toHaveBeenCalledWith("google", { redirectTo: "/jobs" });
  });

  it("calls signIn with github and defaults to /account when callbackUrl is unsafe", async () => {
    await signInWithProvider("github", "https://malicious.com");
    expect(signIn).toHaveBeenCalledWith("github", { redirectTo: "/account" });
  });

  it("handles FormData input correctly", async () => {
    const formData = new FormData();
    formData.append("provider", "google");
    formData.append("callbackUrl", "/account/watchlist");

    await signInWithProvider(formData);
    expect(signIn).toHaveBeenCalledWith("google", {
      redirectTo: "/account/watchlist",
    });
  });

  it("throws error for unsupported provider in FormData", async () => {
    const formData = new FormData();
    formData.append("provider", "facebook");

    await expect(signInWithProvider(formData)).rejects.toThrow("Invalid provider");
  });
});

describe("requestMagicLink", () => {
  beforeEach(() => {
    vi.mocked(signIn).mockReset();
    vi.mocked(redirect).mockReset();
    vi.mocked(checkRateLimit).mockReset();
  });

  it("invokes signIn('resend') and redirects to /verify-request when rate limit permits", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: true,
      attemptCount: 1,
      lockedUntil: null,
    });

    const formData = new FormData();
    formData.append("email", "Founder@Canva.com ");
    formData.append("callbackUrl", "/jobs");

    await requestMagicLink(formData);

    expect(signIn).toHaveBeenCalledWith("resend", {
      email: "founder@canva.com",
      redirectTo: "/jobs",
      redirect: false,
    });
    expect(redirect).toHaveBeenCalledWith("/verify-request");
  });

  it("does not call signIn if rate limit denies, but still redirects to /verify-request without leaking state", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({
      allowed: false,
      attemptCount: 10,
      lockedUntil: new Date(),
    });

    const formData = new FormData();
    formData.append("email", "candidate@test.com");

    await requestMagicLink(formData);

    expect(signIn).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/verify-request");
  });

  it("throws an error if email is empty", async () => {
    const formData = new FormData();
    formData.append("email", "   ");

    await expect(requestMagicLink(formData)).rejects.toThrow("Email is required");
  });
});
