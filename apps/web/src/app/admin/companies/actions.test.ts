import type { Pool, PoolClient } from "pg";
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
import {
  disableCompanyAction,
  updateEvidenceStatusAction,
  verifyCompanyAction,
} from "./actions";

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

  it("updateEvidenceStatusAction rejects an invalid lifecycle state", async () => {
    vi.mocked(requireStaffSession).mockResolvedValue({
      id: 7,
      email: "reviewer@example.com",
      role: "reviewer",
      mfaVerifiedAt: new Date(),
    });
    const formData = new FormData();
    formData.set("status", "unverified");
    formData.set("reason", "source changed");

    await expect(
      updateEvidenceStatusAction("company-1", "evidence-1", formData),
    ).rejects.toThrow(/Invalid evidence status/);
    expect(getPool).not.toHaveBeenCalled();
  });

  it("updateEvidenceStatusAction records an auditable reviewer decision", async () => {
    vi.mocked(requireStaffSession).mockResolvedValue({
      id: 7,
      email: "reviewer@example.com",
      role: "reviewer",
      mfaVerifiedAt: new Date(),
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            status: "active",
            claim_type: "sponsorship_labour_agreement",
            company_slug: "example-company",
          },
        ],
      })
      .mockResolvedValue({ rows: [] });
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    vi.mocked(getPool).mockReturnValue({
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool);
    const formData = new FormData();
    formData.set("status", "stale");
    formData.set("reason", "source is outside its refresh window");

    await updateEvidenceStatusAction("company-1", "evidence-1", formData);

    expect(query).toHaveBeenCalledWith(
      "UPDATE evidence SET status = $1 WHERE id = $2",
      ["stale", "evidence-1"],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO audit_records"),
      expect.arrayContaining([
        "7",
        "evidence_status_changed",
        "evidence",
        "evidence-1",
        "source is outside its refresh window",
      ]),
    );
    expect(query).toHaveBeenCalledWith("BEGIN");
    expect(query).toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });

  it("rolls back the status change when the audit write fails", async () => {
    vi.mocked(requireStaffSession).mockResolvedValue({
      id: 7,
      email: "reviewer@example.com",
      role: "reviewer",
      mfaVerifiedAt: new Date(),
    });
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            status: "active",
            claim_type: "sponsorship_labour_agreement",
            company_slug: "example-company",
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("audit unavailable"))
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const client = { query, release } as unknown as PoolClient;
    vi.mocked(getPool).mockReturnValue({
      connect: vi.fn().mockResolvedValue(client),
    } as unknown as Pool);
    const formData = new FormData();
    formData.set("status", "stale");
    formData.set("reason", "source is outside its refresh window");

    await expect(
      updateEvidenceStatusAction("company-1", "evidence-1", formData),
    ).rejects.toThrow("audit unavailable");

    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query).not.toHaveBeenCalledWith("COMMIT");
    expect(release).toHaveBeenCalledOnce();
  });
});
