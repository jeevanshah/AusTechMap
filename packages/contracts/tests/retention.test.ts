import { describe, expect, it } from "vitest";
import {
  CreateSavedSearchRequestSchema,
  SavedSearchSchema,
  ToggleWatchlistRequestSchema,
  UserAlertSchema,
  WatchlistEntrySchema,
} from "../src/index.js";

describe("Phase 7 Retention Contracts", () => {
  it("validates CreateSavedSearchRequest", () => {
    const valid = {
      name: "Adelaide AI Companies",
      filters: {
        category: "artificial-intelligence",
        sa4Code: "401",
        sponsorship: "current",
      },
      alertFrequency: "weekly",
    };
    const parsed = CreateSavedSearchRequestSchema.parse(valid);
    expect(parsed.name).toBe("Adelaide AI Companies");
    expect(parsed.alertFrequency).toBe("weekly");
  });

  it("validates SavedSearch with defaults", () => {
    const valid = {
      id: "123e4567-e89b-12d3-a456-426614174000",
      userId: 42,
      name: "All Visa Sponsors",
      filters: {
        sponsorship: "current",
      },
      alertFrequency: "daily",
      lastAlertedAt: null,
      createdAt: "2026-09-08T12:00:00Z",
      updatedAt: "2026-09-08T12:00:00Z",
    };
    const parsed = SavedSearchSchema.parse(valid);
    expect(parsed.id).toBe("123e4567-e89b-12d3-a456-426614174000");
    expect(parsed.filters.sponsorship).toBe("current");
  });

  it("validates WatchlistEntry for company", () => {
    const companyEntry = {
      id: "123e4567-e89b-12d3-a456-426614174001",
      userId: 42,
      entityType: "company",
      companyId: "123e4567-e89b-12d3-a456-426614174002",
      regionId: null,
      sa4Code: null,
      createdAt: "2026-09-08T12:00:00Z",
      company: {
        id: "123e4567-e89b-12d3-a456-426614174002",
        slug: "atlassian",
        name: "Atlassian",
      },
    };
    const parsed = WatchlistEntrySchema.parse(companyEntry);
    expect(parsed.entityType).toBe("company");
    expect(parsed.company?.slug).toBe("atlassian");
  });

  it("validates WatchlistEntry for region", () => {
    const regionEntry = {
      id: "123e4567-e89b-12d3-a456-426614174003",
      userId: 42,
      entityType: "region",
      companyId: null,
      regionId: null,
      sa4Code: "401",
      createdAt: "2026-09-08T12:00:00Z",
      region: {
        code: "401",
        name: "Adelaide - Central and Hills",
        opportunityScore: 78.5,
      },
    };
    const parsed = WatchlistEntrySchema.parse(regionEntry);
    expect(parsed.entityType).toBe("region");
    expect(parsed.region?.name).toBe("Adelaide - Central and Hills");
  });

  it("validates ToggleWatchlistRequest", () => {
    const parsed = ToggleWatchlistRequestSchema.parse({
      entityType: "company",
      companyId: "123e4567-e89b-12d3-a456-426614174002",
    });
    expect(parsed.companyId).toBe("123e4567-e89b-12d3-a456-426614174002");
  });

  it("validates UserAlert", () => {
    const alert = {
      id: "123e4567-e89b-12d3-a456-426614174004",
      userId: 42,
      alertType: "sponsorship_change",
      title: "New Visa Sponsorship Evidence",
      message: "Atlassian published verified subclass 482 sponsorship data.",
      link: "/companies/atlassian",
      readAt: null,
      createdAt: "2026-09-08T12:00:00Z",
    };
    const parsed = UserAlertSchema.parse(alert);
    expect(parsed.alertType).toBe("sponsorship_change");
    expect(parsed.readAt).toBeNull();
  });
});
