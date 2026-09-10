import { describe, expect, it } from "vitest";
import {
  EntitlementTypeSchema,
  UserEntitlementSchema,
  BillingTierSchema,
  BillingCustomerSchema,
  SponsoredPlacementSchema,
} from "../src";

describe("Phase 9.2 Commercial Contracts: Entitlements, Billing & Sponsored Placements", () => {
  it("validates valid entitlement types", () => {
    expect(EntitlementTypeSchema.safeParse("employer_analytics").success).toBe(
      true,
    );
    expect(
      EntitlementTypeSchema.safeParse("institutional_export").success,
    ).toBe(true);
    expect(EntitlementTypeSchema.safeParse("invalid_entitlement").success).toBe(
      false,
    );
  });

  it("validates full UserEntitlement record", () => {
    const entitlement = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      userId: 42,
      entitlement: "institutional_export",
      grantedByUserId: 1,
      grantedAt: "2026-09-09T00:00:00Z",
      expiresAt: null,
      metadata: {
        institutionName: "University of Sydney",
        department: "Computer Science",
      },
    };
    const parsed = UserEntitlementSchema.safeParse(entitlement);
    expect(parsed.success).toBe(true);
  });

  it("validates billing tiers and customer records", () => {
    expect(BillingTierSchema.safeParse("employer_pro").success).toBe(true);
    expect(BillingTierSchema.safeParse("super_vip").success).toBe(false);

    const customer = {
      id: "223e4567-e89b-12d3-a456-426614174000",
      userId: 42,
      stripeCustomerId: "cus_mock123",
      billingTier: "employer_pro",
      status: "active",
      currentPeriodEnd: "2027-09-09T00:00:00Z",
      metadata: { billingContact: "finance@atlassian.com" },
      createdAt: "2026-09-09T00:00:00Z",
      updatedAt: "2026-09-09T00:00:00Z",
    };
    const parsed = BillingCustomerSchema.safeParse(customer);
    expect(parsed.success).toBe(true);
  });

  it("validates sponsored placement record and defaults", () => {
    const campaign = {
      id: "323e4567-e89b-12d3-a456-426614174000",
      companyId: "123e4567-e89b-12d3-a456-426614174000",
      companyName: "Canva",
      companySlug: "canva",
      campaignName: "Graduates 2027 Regional Hiring",
      headline:
        "Join Australia's fastest growing visual communication team in Sydney and regional hubs.",
      targetRoleFamilies: ["software-engineering", "data"],
      targetRegions: ["102", "111"],
      ctaLabel: "Apply to Graduate Cohort",
      ctaUrl: "https://canva.com/careers/grads",
      status: "active",
      startDate: "2026-09-01T00:00:00Z",
      endDate: "2026-12-31T23:59:59Z",
      createdAt: "2026-09-01T00:00:00Z",
    };
    const parsed = SponsoredPlacementSchema.safeParse(campaign);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.campaignName).toBe("Graduates 2027 Regional Hiring");
      expect(parsed.data.targetRoleFamilies).toContain("software-engineering");
    }
  });

  it("rejects sponsored placements with empty headline or invalid URL", () => {
    const invalid = {
      id: "323e4567-e89b-12d3-a456-426614174000",
      companyId: "123e4567-e89b-12d3-a456-426614174000",
      campaignName: "Test",
      headline: "   ",
      ctaUrl: "not-a-url",
      status: "active",
      startDate: "2026-09-01T00:00:00Z",
      endDate: "2026-12-31T23:59:59Z",
      createdAt: "2026-09-01T00:00:00Z",
    };
    const parsed = SponsoredPlacementSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });
});
