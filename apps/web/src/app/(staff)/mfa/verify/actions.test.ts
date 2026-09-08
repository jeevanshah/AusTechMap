import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("../../../../lib/db", () => ({
  getPool: vi.fn(() => ({
    query: vi.fn().mockResolvedValue({
      rows: [
        {
          encrypted_secret: Buffer.from("ciphertext"),
          encryption_key_version: 1,
          last_accepted_step: null,
        },
      ],
    }),
  })),
}));
vi.mock("../../../../lib/request-ip", () => ({
  currentClientIp: vi.fn().mockResolvedValue("203.0.113.1"),
}));
vi.mock("../../../../lib/rate-limit", () => ({ checkRateLimit: vi.fn() }));
vi.mock("../../../../lib/mfa/crypto", () => ({
  decryptTotpSecret: vi.fn(() => Buffer.from("SECRETBASE32")),
}));
vi.mock("../../../../lib/mfa/recovery-codes", () => ({
  verifyAndConsumeRecoveryCode: vi.fn(),
}));
vi.mock("../../../../lib/mfa/totp", () => ({
  validateTotpToken: vi.fn(() => ({ valid: true, acceptedStep: 1 })),
}));
// A plain factory, not importOriginal -- require-role.ts imports ../../auth,
// which imports next-auth, which Vitest's plain Node ESM resolution can't
// load (see HANDOFF.md's documented gotcha).
vi.mock("../../../../lib/auth/require-role", () => ({
  requireRole: vi.fn(),
  currentSessionToken: vi.fn().mockResolvedValue(null),
}));

import { checkRateLimit } from "../../../../lib/rate-limit";
import { decryptTotpSecret } from "../../../../lib/mfa/crypto";
import { requireRole } from "../../../../lib/auth/require-role";
import { verifyMfaCode } from "./actions";

function fakeActor() {
  return {
    id: 7,
    email: "reviewer@example.com",
    role: "reviewer",
    mfaVerifiedAt: null,
  };
}

function allowedResult() {
  return { allowed: true, attemptCount: 1, lockedUntil: null };
}

function deniedResult() {
  return { allowed: false, attemptCount: 6, lockedUntil: new Date() };
}

function form(token: string) {
  const formData = new FormData();
  formData.set("token", token);
  return formData;
}

describe("verifyMfaCode -- rate limiting", () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockReset().mockResolvedValue(fakeActor());
    vi.mocked(checkRateLimit).mockReset();
    vi.mocked(decryptTotpSecret).mockClear();
  });

  it("checks both an account-keyed and an IP-keyed bucket, each at limit 5", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(allowedResult());

    await verifyMfaCode(form("123456"));

    expect(checkRateLimit).toHaveBeenCalledTimes(2);
    const calls = vi.mocked(checkRateLimit).mock.calls;
    const accountCall = calls.find(
      ([, opts]) => opts.scope === "mfa_attempt_account",
    );
    const ipCall = calls.find(([, opts]) => opts.scope === "mfa_attempt_ip");
    expect(accountCall?.[1]).toMatchObject({ key: "7", limit: 5 });
    expect(ipCall?.[1]).toMatchObject({ key: "203.0.113.1", limit: 5 });
  });

  it("rejects and never touches credential validation when the account bucket is denied", async () => {
    vi.mocked(checkRateLimit).mockImplementation(async (_pool, opts) =>
      opts.scope === "mfa_attempt_account" ? deniedResult() : allowedResult(),
    );

    await expect(verifyMfaCode(form("123456"))).rejects.toThrow(
      /Too many attempts/,
    );
    expect(decryptTotpSecret).not.toHaveBeenCalled();
  });

  it("rejects and never touches credential validation when the IP bucket is denied", async () => {
    vi.mocked(checkRateLimit).mockImplementation(async (_pool, opts) =>
      opts.scope === "mfa_attempt_ip" ? deniedResult() : allowedResult(),
    );

    await expect(verifyMfaCode(form("123456"))).rejects.toThrow(
      /Too many attempts/,
    );
    expect(decryptTotpSecret).not.toHaveBeenCalled();
  });

  it("proceeds to credential validation when both buckets allow", async () => {
    vi.mocked(checkRateLimit).mockResolvedValue(allowedResult());

    await verifyMfaCode(form("123456"));

    expect(decryptTotpSecret).toHaveBeenCalled();
  });
});
