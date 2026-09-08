import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../../../../auth", () => ({ signIn: vi.fn() }));
vi.mock("../../../../lib/db", () => ({ getPool: vi.fn(() => ({})) }));
vi.mock("../../../../lib/request-ip", () => ({
  currentClientIp: vi.fn().mockResolvedValue("203.0.113.1"),
}));
vi.mock("../../../../lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("../../../../lib/deletion/erasure", () => ({
  emailDigest: vi.fn(() => Buffer.from("digest")),
}));
vi.mock("../../../../lib/deletion/pipeline", () => ({
  startAccountDeletionRequest: vi.fn().mockResolvedValue("request-id-1"),
}));
vi.mock("../../../../lib/auth/require-role", () => ({
  requireUser: vi.fn(),
}));

import { redirect } from "next/navigation";
import { signIn } from "../../../../auth";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { requireUser } from "../../../../lib/auth/require-role";
import { requestAccountDeletion } from "./actions";

function fakeActor() {
  return {
    id: 3,
    email: "jeevanrajshah@gmail.com",
    role: "user",
    mfaVerifiedAt: null,
  };
}

function allowedResult() {
  return { allowed: true, attemptCount: 1, lockedUntil: null };
}

function deniedResult() {
  return { allowed: false, attemptCount: 6, lockedUntil: new Date() };
}

describe("requestAccountDeletion -- rate limiting", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset().mockResolvedValue(fakeActor());
    vi.mocked(checkRateLimit).mockReset();
    vi.mocked(signIn).mockReset();
    vi.mocked(redirect).mockReset();
  });

  it("sends the confirmation email and redirects when both buckets allow", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(allowedResult());

    await requestAccountDeletion();

    expect(signIn).toHaveBeenCalledTimes(1);
    expect(redirect).toHaveBeenCalledWith("/verify-request");
  });

  it("does not send the confirmation email when the email bucket is denied, but still redirects the same way", async () => {
    vi.mocked(checkRateLimit).mockImplementation(async (_pool, opts) =>
      opts.scope === "magic_link_email" ? deniedResult() : allowedResult(),
    );

    await requestAccountDeletion();

    expect(signIn).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/verify-request");
  });

  it("does not send the confirmation email when the IP bucket is denied, but still redirects the same way", async () => {
    vi.mocked(checkRateLimit).mockImplementation(async (_pool, opts) =>
      opts.scope === "magic_link_ip" ? deniedResult() : allowedResult(),
    );

    await requestAccountDeletion();

    expect(signIn).not.toHaveBeenCalled();
    expect(redirect).toHaveBeenCalledWith("/verify-request");
  });

  it("gives the outward caller the same redirect regardless of the real rate-limit outcome (no signal leak)", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(allowedResult());
    await requestAccountDeletion();
    const allowedRedirectCalls = vi.mocked(redirect).mock.calls.length;

    vi.mocked(redirect).mockClear();
    vi.mocked(signIn).mockClear();
    vi.mocked(checkRateLimit).mockResolvedValue(deniedResult());
    await requestAccountDeletion();
    const deniedRedirectCalls = vi.mocked(redirect).mock.calls.length;

    expect(deniedRedirectCalls).toBe(allowedRedirectCalls);
    expect(vi.mocked(redirect).mock.calls[0]).toEqual(["/verify-request"]);
  });
});
