import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { writeDeletionLedgerRecord } from "./ledger";
import { processDeletionRequest, registerErasureHook } from "./erasure";

vi.mock("./ledger", () => ({
  writeDeletionLedgerRecord: vi.fn().mockResolvedValue(undefined),
}));

function fakePool(requestRow: unknown): Pool {
  const query = vi.fn().mockImplementation((sql: string) => {
    if (sql.includes("SELECT status, user_id, email_digest")) {
      return Promise.resolve({ rows: [requestRow] });
    }
    return Promise.resolve({ rows: [] });
  });
  return { query } as unknown as Pool;
}

describe("processDeletionRequest", () => {
  beforeEach(() => {
    vi.mocked(writeDeletionLedgerRecord).mockClear();
  });

  it("is a no-op for an unknown request", async () => {
    const pool = fakePool(undefined);
    const result = await processDeletionRequest(pool, "missing-id");
    expect(result.erased).toBe(false);
  });

  it("skips a request that already completed (idempotent re-run)", async () => {
    const pool = fakePool({
      status: "completed",
      user_id: 3,
      email_digest: Buffer.from("digest"),
    });
    const result = await processDeletionRequest(pool, "req-1");
    expect(result.erased).toBe(false);
    expect(writeDeletionLedgerRecord).not.toHaveBeenCalled();
  });

  it("erases the auth identity, runs registered hooks, and writes the ledger", async () => {
    const pool = fakePool({
      status: "queued",
      user_id: 3,
      email_digest: Buffer.from("digest"),
    });
    const hook = vi.fn().mockResolvedValue(undefined);
    registerErasureHook(hook);

    const result = await processDeletionRequest(pool, "req-1");

    expect(result.erased).toBe(true);
    expect(hook).toHaveBeenCalledWith(pool, 3);
    expect(writeDeletionLedgerRecord).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: "req-1", userId: 3 }),
    );
  });
});
