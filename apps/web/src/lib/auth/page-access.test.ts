import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`NEXT_REDIRECT:${destination}`);
  }),
}));
vi.mock("./require-role", () => ({ requireRole: vi.fn() }));

import { redirect } from "next/navigation";

import { UnauthenticatedError } from "./errors";
import { requirePageRole } from "./page-access";
import { requireRole } from "./require-role";

const actor = {
  id: 7,
  email: "reviewer@example.com",
  role: "reviewer",
  mfaVerifiedAt: null,
};

describe("requirePageRole", () => {
  beforeEach(() => {
    vi.mocked(requireRole).mockReset();
    vi.mocked(redirect).mockClear();
  });

  it("returns an authenticated actor", async () => {
    vi.mocked(requireRole).mockResolvedValue(actor);

    await expect(requirePageRole("reviewer")).resolves.toEqual(actor);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("redirects an anonymous browser request to sign in", async () => {
    vi.mocked(requireRole).mockRejectedValue(new UnauthenticatedError());

    await expect(requirePageRole("reviewer")).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in",
    );
    expect(redirect).toHaveBeenCalledWith("/sign-in");
  });

  it("does not disguise other authorisation or runtime errors", async () => {
    const error = new Error("insufficient role");
    vi.mocked(requireRole).mockRejectedValue(error);

    await expect(requirePageRole("reviewer")).rejects.toBe(error);
    expect(redirect).not.toHaveBeenCalled();
  });
});
