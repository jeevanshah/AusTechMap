import { describe, expect, it } from "vitest";
import {
  CreateDataCorrectionRequestSchema,
  CreateEmployerClaimRequestSchema,
  EmployerClaimSchema,
  DataCorrectionSchema,
  ReviewClaimActionSchema,
} from "../src";

describe("Phase 9 Contracts: Employer Claims & Data Corrections", () => {
  const validClaimRequest = {
    companyId: "123e4567-e89b-12d3-a456-426614174000",
    claimantName: "Sarah Connor",
    claimantEmail: "sarah@atlassian.com",
    claimantRole: "Head of Talent Acquisition",
    claimType: "profile_verification",
    claimedData: {
      officialCareersUrl: "https://www.atlassian.com/company/careers",
      corporateDescription: "Global software leader born in Sydney.",
    },
    evidenceUrl: "https://abr.business.gov.au/ABN/View?id=53102443906",
  };

  it("successfully parses valid employer claim requests", () => {
    const parsed = CreateEmployerClaimRequestSchema.safeParse(validClaimRequest);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.claimantEmail).toBe("sarah@atlassian.com");
      expect(parsed.data.claimType).toBe("profile_verification");
    }
  });

  it("rejects invalid email or short names in claim requests", () => {
    const invalid = {
      ...validClaimRequest,
      claimantEmail: "not-an-email",
      claimantName: "A",
    };
    const parsed = CreateEmployerClaimRequestSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it("validates full EmployerClaim record", () => {
    const fullRecord = {
      id: "223e4567-e89b-12d3-a456-426614174000",
      companyId: "123e4567-e89b-12d3-a456-426614174000",
      userId: 42,
      claimantName: "Sarah Connor",
      claimantEmail: "sarah@atlassian.com",
      claimantRole: "Head of Talent",
      claimType: "profile_verification",
      claimedData: { officialCareersUrl: "https://atlassian.com/careers" },
      evidenceUrl: "https://abr.business.gov.au",
      status: "approved",
      reviewNotes: "Verified via @atlassian.com MX records and ASIC check.",
      reviewedByUserId: 1,
      reviewedAt: "2026-09-09T00:00:00Z",
      createdAt: "2026-09-08T00:00:00Z",
      updatedAt: "2026-09-09T00:00:00Z",
    };
    const parsed = EmployerClaimSchema.safeParse(fullRecord);
    expect(parsed.success).toBe(true);
  });

  it("successfully parses valid data correction requests", () => {
    const validCorrection = {
      companyId: "123e4567-e89b-12d3-a456-426614174000",
      submitterName: "Dave Tech",
      submitterEmail: "dave@example.com",
      correctionType: "location_incorrect",
      details: "The Newcastle office moved to 24 Hunter St, Newcastle NSW 2300.",
      evidenceUrl: "https://example.com/press-release",
    };
    const parsed = CreateDataCorrectionRequestSchema.safeParse(validCorrection);
    expect(parsed.success).toBe(true);
  });

  it("validates full DataCorrection record", () => {
    const fullCorrection = {
      id: "323e4567-e89b-12d3-a456-426614174000",
      companyId: "123e4567-e89b-12d3-a456-426614174000",
      submitterName: "Dave Tech",
      submitterEmail: "dave@example.com",
      correctionType: "location_incorrect",
      details: "The Newcastle office moved to 24 Hunter St, Newcastle NSW 2300.",
      evidenceUrl: "https://example.com/press-release",
      status: "approved",
      reviewNotes: "Updated location record",
      reviewedByUserId: 1,
      reviewedAt: "2026-09-09T00:00:00Z",
      createdAt: "2026-09-08T00:00:00Z",
    };
    const parsed = DataCorrectionSchema.safeParse(fullCorrection);
    expect(parsed.success).toBe(true);
  });

  it("rejects data correction requests with short details (< 10 chars)", () => {
    const tooShort = {
      submitterEmail: "dave@example.com",
      correctionType: "other",
      details: "Wrong",
    };
    const parsed = CreateDataCorrectionRequestSchema.safeParse(tooShort);
    expect(parsed.success).toBe(false);
  });

  it("validates review action schemas", () => {
    const validAction = {
      claimId: "123e4567-e89b-12d3-a456-426614174000",
      action: "approve",
      reviewNotes: "Domain confirmed.",
    };
    const parsed = ReviewClaimActionSchema.safeParse(validAction);
    expect(parsed.success).toBe(true);
  });
});
