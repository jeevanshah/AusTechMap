import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "../../../lib/auth/errors";
import { getPool } from "../../../lib/db";

vi.mock("../../../lib/db", () => ({ getPool: vi.fn() }));
// A plain factory, not importOriginal -- require-role.ts imports ../../auth,
// which imports next-auth, which Vitest's plain Node ESM resolution can't
// load (next-auth's package unconditionally imports "next/server", which
// only resolves correctly under Next.js's own bundler). Every admin action
// test mocks this module fully rather than ever loading the real one.
vi.mock("../../../lib/auth/require-role", () => ({
  requireStaffSession: vi.fn(),
  requireFreshMfa: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  requireFreshMfa,
  requireStaffSession,
} from "../../../lib/auth/require-role";
import { disableCompanyAction, verifyCompanyAction } from "./actions";

function fakePool(rows: unknown[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

describe("admin/companies actions -- authorization", () => {
  beforeEach(() => {
    vi.mocked(getPool).mockReset();
    vi.mocked(requireStaffSession).mockReset();
    vi.mocked(requireFreshMfa).mockReset();
  });

  it("verifyCompanyAction rejects an unauthenticated caller with a 401-mapped error", async () => {
    vi.mocked(requireStaffSession).mockRejectedValue(
      new UnauthenticatedError(),
    );
    await expect(verifyCompanyAction("company-1")).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    expect(getPool).not.toHaveBeenCalled();
  });

  it("verifyCompanyAction rejects a plain 'user' role with a 403-mapped error", async () => {
    vi.mocked(requireStaffSession).mockRejectedValue(
      new ForbiddenError("requires role >= reviewer, actor has user"),
    );
    await expect(verifyCompanyAction("company-1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("verifyCompanyAction proceeds for a reviewer with a verified MFA session", async () => {
    vi.mocked(requireStaffSession).mockResolvedValue({
      id: 7,
      email: "reviewer@example.com",
      role: "reviewer",
      mfaVerifiedAt: new Date(),
    });
    const pool = fakePool([{ verified_at: null }]);
    vi.mocked(getPool).mockReturnValue(pool);

    await verifyCompanyAction("company-1");

    expect(pool.query).toHaveBeenCalledWith(
      "UPDATE companies SET verified_at = now() WHERE id = $1",
      ["company-1"],
    );
  });

  it("disableCompanyAction requires fresh MFA (admin), not just a staff session", async () => {
    vi.mocked(requireFreshMfa).mockRejectedValue(
      new Error("MFA verification has expired, re-verify to continue"),
    );
    const formData = new FormData();
    formData.set("reason", "duplicate record");

    await expect(disableCompanyAction("company-1", formData)).rejects.toThrow(
      /MFA verification has expired/,
    );
    expect(requireFreshMfa).toHaveBeenCalledWith("admin");
    expect(getPool).not.toHaveBeenCalled();
  });
});
