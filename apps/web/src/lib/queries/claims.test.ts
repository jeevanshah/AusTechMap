import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import {
  createEmployerClaim,
  createDataCorrection,
  approveEmployerClaim,
  rejectEmployerClaim,
  resolveDataCorrection,
} from "./claims";

function fakeClient(
  queryHandler: (sql: string, params?: unknown[]) => Promise<unknown>,
) {
  return {
    query: vi.fn(queryHandler),
    release: vi.fn(),
  };
}

function fakePool(client: ReturnType<typeof fakeClient>): Pool {
  return {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn(),
  } as unknown as Pool;
}

describe("Phase 9 Claims & Corrections Query Layer", () => {
  it("creates an employer claim and enqueues it for staff review", async () => {
    const executedSql: string[] = [];
    const client = fakeClient(async (sql, params) => {
      executedSql.push(sql);
      if (sql.includes("INSERT INTO employer_claims")) {
        return {
          rows: [
            {
              id: "claim-uuid-1",
              company_id: params![0],
              user_id: params![1],
              claimant_name: params![2],
              claimant_email: params![3],
              claimant_role: params![4],
              claim_type: params![5],
              claimed_data: JSON.parse(params![6] as string),
              evidence_url: params![7],
              status: "pending",
              review_notes: null,
              reviewed_by_user_id: null,
              reviewed_at: null,
              created_at: new Date("2026-09-09T00:00:00Z"),
              updated_at: new Date("2026-09-09T00:00:00Z"),
            },
          ],
        };
      }
      if (sql.includes("SELECT display_name, slug FROM companies")) {
        return { rows: [{ display_name: "Atlassian", slug: "atlassian" }] };
      }
      if (sql.includes("INSERT INTO review_queue_items")) {
        return { rows: [{ id: "queue-uuid-1" }] };
      }
      return { rows: [] };
    });

    const pool = fakePool(client);

    const result = await createEmployerClaim(
      pool,
      {
        companyId: "123e4567-e89b-12d3-a456-426614174000",
        claimantName: "Sarah Connor",
        claimantEmail: "sarah@atlassian.com",
        claimantRole: "Head of Talent",
        claimType: "profile_verification",
        claimedData: { officialCareersUrl: "https://atlassian.com/careers" },
      },
      42,
    );

    expect(result.claim.id).toBe("claim-uuid-1");
    expect(result.claim.status).toBe("pending");
    expect(result.reviewQueueItemId).toBe("queue-uuid-1");

    expect(
      executedSql.some((s) => s.includes("INSERT INTO employer_claims")),
    ).toBe(true);
    expect(
      executedSql.some((s) => s.includes("INSERT INTO review_queue_items")),
    ).toBe(true);
  });

  it("creates a community data correction and enqueues review queue item", async () => {
    const client = fakeClient(async (sql, params) => {
      if (sql.includes("INSERT INTO data_corrections")) {
        return {
          rows: [
            {
              id: "corr-uuid-1",
              company_id: params![0],
              user_id: params![1],
              submitter_name: params![2],
              submitter_email: params![3],
              correction_type: params![4],
              details: params![5],
              evidence_url: params![6],
              status: "pending",
              review_notes: null,
              reviewed_by_user_id: null,
              reviewed_at: null,
              created_at: new Date("2026-09-09T00:00:00Z"),
            },
          ],
        };
      }
      if (sql.includes("SELECT display_name, slug FROM companies")) {
        return { rows: [{ display_name: "Canva", slug: "canva" }] };
      }
      if (sql.includes("INSERT INTO review_queue_items")) {
        return { rows: [{ id: "queue-uuid-2" }] };
      }
      return { rows: [] };
    });

    const pool = fakePool(client);

    const result = await createDataCorrection(
      pool,
      {
        companyId: "123e4567-e89b-12d3-a456-426614174000",
        submitterEmail: "user@example.com",
        correctionType: "location_incorrect",
        details: "Office relocated to Level 3, 200 George St.",
      },
      null,
    );

    expect(result.correction.id).toBe("corr-uuid-1");
    expect(result.correction.correctionType).toBe("location_incorrect");
    expect(result.reviewQueueItemId).toBe("queue-uuid-2");
  });

  it("approving claim sets is_claimed = true on company without altering observations", async () => {
    const executedSql: string[] = [];
    const client = fakeClient(async (sql) => {
      executedSql.push(sql);
      if (sql.includes("UPDATE employer_claims")) {
        return {
          rows: [
            {
              company_id: "comp-1",
              user_id: "42",
              claimant_email: "talent@atlassian.com",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const pool = fakePool(client);

    await approveEmployerClaim(pool, "claim-1", 1, "Domain verified");

    // Must update company to is_claimed = true
    const companyUpdate = executedSql.find((s) =>
      s.includes("UPDATE companies"),
    );
    expect(companyUpdate).toBeDefined();
    expect(companyUpdate).toContain("is_claimed = true");

    // Must resolve review queue item
    const queueUpdate = executedSql.find((s) =>
      s.includes("UPDATE review_queue_items"),
    );
    expect(queueUpdate).toBeDefined();
    expect(queueUpdate).toContain("status = 'approved'");

    // Must record audit event
    const auditInsert = executedSql.find((s) =>
      s.includes("INSERT INTO audit_records"),
    );
    expect(auditInsert).toBeDefined();
  });

  it("rejecting claim leaves company is_claimed untouched and records rejection", async () => {
    const executedSql: string[] = [];
    const client = fakeClient(async (sql) => {
      executedSql.push(sql);
      if (sql.includes("UPDATE employer_claims")) {
        return {
          rows: [
            {
              company_id: "comp-1",
              claimant_email: "fake@gmail.com",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const pool = fakePool(client);

    await rejectEmployerClaim(
      pool,
      "claim-1",
      1,
      "Corporate domain mismatch and no ASIC proof",
    );

    // Company table must NOT be updated
    const companyUpdate = executedSql.find((s) =>
      s.includes("UPDATE companies"),
    );
    expect(companyUpdate).toBeUndefined();

    // Review queue item marked rejected
    const queueUpdate = executedSql.find((s) =>
      s.includes("UPDATE review_queue_items"),
    );
    expect(queueUpdate).toBeDefined();
    expect(queueUpdate).toContain("status = 'rejected'");
  });

  it("resolves community data correction with audit trail", async () => {
    const executedSql: string[] = [];
    const client = fakeClient(async (sql) => {
      executedSql.push(sql);
      if (sql.includes("UPDATE data_corrections")) {
        return {
          rows: [
            {
              company_id: "comp-1",
              submitter_email: "user@example.com",
              correction_type: "careers_url_broken",
            },
          ],
        };
      }
      return { rows: [] };
    });

    const pool = fakePool(client);

    await resolveDataCorrection(pool, "corr-1", "approved", 1, "Accepted");

    const corrUpdate = executedSql.find((s) =>
      s.includes("UPDATE data_corrections"),
    );
    expect(corrUpdate).toBeDefined();
    expect(corrUpdate).toContain("status = $1");

    const auditInsert = executedSql.find((s) =>
      s.includes("INSERT INTO audit_records"),
    );
    expect(auditInsert).toBeDefined();
  });
});
