import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { recordAudit } from "./audit";

function fakePool(): Pool {
  return { query: vi.fn().mockResolvedValue({ rows: [] }) } as unknown as Pool;
}

describe("recordAudit", () => {
  it("always writes reason/before_state/after_state, even when omitted (closing review/actions.ts's prior gap)", async () => {
    const pool = fakePool();
    await recordAudit(pool, {
      actorUserId: 7,
      action: "review_item_approved",
      targetType: "company",
      targetId: "abc-123",
    });

    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO audit_records"),
      [
        "7",
        "review_item_approved",
        "company",
        "abc-123",
        null,
        null,
        null,
        "{}",
        expect.any(String),
      ],
    );
  });

  it("serialises before/after state as JSON", async () => {
    const pool = fakePool();
    await recordAudit(pool, {
      actorUserId: 1,
      action: "company_edited",
      targetType: "company",
      targetId: "xyz",
      reason: "typo fix",
      beforeState: { display_name: "Acme" },
      afterState: { display_name: "Acme Pty Ltd" },
    });

    expect(pool.query).toHaveBeenCalledWith(expect.any(String), [
      "1",
      "company_edited",
      "company",
      "xyz",
      "typo fix",
      JSON.stringify({ display_name: "Acme" }),
      JSON.stringify({ display_name: "Acme Pty Ltd" }),
      "{}",
      expect.any(String),
    ]);
  });
});
