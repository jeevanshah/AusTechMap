import { describe, expect, it, vi } from "vitest";
import {
  submitEmployerClaimAction,
  submitDataCorrectionAction,
} from "./actions";
import * as dbModule from "../../lib/db";
import * as rateLimitModule from "../../lib/rate-limit";
import * as ipModule from "../../lib/request-ip";
import * as ssrfModule from "../../lib/security/ssrf";
import * as claimQueries from "../../lib/queries/claims";

vi.mock("../../lib/db");
vi.mock("../../lib/rate-limit");
vi.mock("../../lib/request-ip");
vi.mock("../../lib/security/ssrf");
vi.mock("../../lib/queries/claims");
vi.mock("../../auth", () => ({
  auth: vi.fn().mockResolvedValue(null),
}));

describe("Phase 9 Corrections Server Actions", () => {
  it("rejects employer claim when rate limit is exceeded", async () => {
    vi.spyOn(rateLimitModule, "checkRateLimit").mockResolvedValue({
      allowed: false,
      attemptCount: 6,
      lockedUntil: null,
    });

    const res = await submitEmployerClaimAction({
      companyId: "123e4567-e89b-12d3-a456-426614174000",
      claimantName: "Sarah Connor",
      claimantEmail: "sarah@atlassian.com",
      claimantRole: "Head of Talent",
    });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("Too many submission attempts");
  });

  it("rejects employer claim when evidence URL is flagged as unsafe (SSRF)", async () => {
    vi.spyOn(ipModule, "currentClientIp").mockResolvedValue("1.2.3.4");
    vi.spyOn(rateLimitModule, "checkRateLimit").mockResolvedValue({
      allowed: true,
      attemptCount: 1,
      lockedUntil: null,
    });
    vi.spyOn(ssrfModule, "validateSafeUrl").mockResolvedValue({
      valid: false,
      reason: "IP resolves to AWS metadata service 169.254.169.254",
    });

    const res = await submitEmployerClaimAction({
      companyId: "123e4567-e89b-12d3-a456-426614174000",
      claimantName: "Sarah Connor",
      claimantEmail: "sarah@atlassian.com",
      claimantRole: "Head of Talent",
      evidenceUrl: "http://169.254.169.254/latest/meta-data/",
    });

    expect(res.ok).toBe(false);
    expect(res.error).toContain("Evidence URL rejected");
    expect(res.error).toContain("AWS metadata service");
  });

  it("evaluates domainMatched = true when claimant email matches company domain", async () => {
    vi.spyOn(ipModule, "currentClientIp").mockResolvedValue("1.2.3.4");
    vi.spyOn(rateLimitModule, "checkRateLimit").mockResolvedValue({
      allowed: true,
      attemptCount: 1,
      lockedUntil: null,
    });
    vi.spyOn(ssrfModule, "validateSafeUrl").mockResolvedValue({ valid: true });

    const mockPool = {
      query: vi.fn().mockResolvedValue({
        rows: [
          {
            id: "123e4567-e89b-12d3-a456-426614174000",
            domain: "atlassian.com",
            display_name: "Atlassian",
          },
        ],
      }),
    };
    vi.spyOn(dbModule, "getPool").mockReturnValue(
      mockPool as unknown as ReturnType<typeof dbModule.getPool>,
    );

    vi.spyOn(claimQueries, "createEmployerClaim").mockResolvedValue({
      claim: {
        id: "claim-1",
      } as unknown as claimQueries.CreateClaimResult["claim"],
      reviewQueueItemId: "queue-1",
    });

    const res = await submitEmployerClaimAction({
      companyId: "123e4567-e89b-12d3-a456-426614174000",
      claimantName: "Sarah Connor",
      claimantEmail: "sarah@atlassian.com",
      claimantRole: "Head of Talent",
    });

    expect(res.ok).toBe(true);
    expect(res.claimId).toBe("claim-1");
    expect(res.domainMatched).toBe(true);
  });

  it("submits community data correction with validation", async () => {
    vi.spyOn(ipModule, "currentClientIp").mockResolvedValue("1.2.3.4");
    vi.spyOn(rateLimitModule, "checkRateLimit").mockResolvedValue({
      allowed: true,
      attemptCount: 1,
      lockedUntil: null,
    });

    vi.spyOn(claimQueries, "createDataCorrection").mockResolvedValue({
      correction: {
        id: "corr-1",
      } as unknown as claimQueries.CreateCorrectionResult["correction"],
      reviewQueueItemId: "queue-2",
    });

    const res = await submitDataCorrectionAction({
      submitterEmail: "reporter@example.com",
      correctionType: "careers_url_broken",
      details: "Careers page returns 404 since rebranding.",
    });

    expect(res.ok).toBe(true);
    expect(res.correctionId).toBe("corr-1");
  });
});
