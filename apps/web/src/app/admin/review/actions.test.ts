import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ForbiddenError, UnauthenticatedError } from "../../../lib/auth/errors";
import { getPool } from "../../../lib/db";

vi.mock("../../../lib/db", () => ({ getPool: vi.fn() }));
vi.mock("../../../lib/auth/require-role", () => ({
  requireStaffSession: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { requireStaffSession } from "../../../lib/auth/require-role";
import { rejectReviewItem } from "./actions";

function fakePool(rows: unknown[]): Pool {
  return { query: vi.fn().mockResolvedValue({ rows }) } as unknown as Pool;
}

describe("admin/review actions -- authorization", () => {
  beforeEach(() => {
    vi.mocked(getPool).mockReset();
    vi.mocked(requireStaffSession).mockReset();
  });

  it("rejectReviewItem rejects an unauthenticated caller", async () => {
    vi.mocked(requireStaffSession).mockRejectedValue(
      new UnauthenticatedError(),
    );
    await expect(rejectReviewItem("item-1")).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    expect(getPool).not.toHaveBeenCalled();
  });

  it("rejectReviewItem rejects a plain 'user' role", async () => {
    vi.mocked(requireStaffSession).mockRejectedValue(
      new ForbiddenError("requires role >= reviewer, actor has user"),
    );
    await expect(rejectReviewItem("item-1")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("rejectReviewItem proceeds for a reviewer with a verified MFA session, attributing the real actor", async () => {
    vi.mocked(requireStaffSession).mockResolvedValue({
      id: 9,
      email: "reviewer@example.com",
      role: "reviewer",
      mfaVerifiedAt: new Date(),
    });
    const pool = fakePool([{ status: "pending" }]);
    vi.mocked(getPool).mockReturnValue(pool);

    await rejectReviewItem("item-1");

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "SET status = 'rejected', reviewed_by_user_id = $1",
      ),
      [9, "item-1"],
    );
  });
});
