import { describe, expect, it } from "vitest";
import {
  CreateSavedSearchRequestSchema,
  JobApplicationSchema,
  JobApplicationStatusSchema,
  JobVaultSnapshotSchema,
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

  it("validates an immutable job vault snapshot and application state", () => {
    const snapshot = JobVaultSnapshotSchema.parse({
      version: 1,
      jobTitle: "Senior Platform Engineer",
      companyName: "Example Tech",
      companySlug: "example-tech",
      roleFamily: "Software Engineering",
      seniority: "senior",
      employmentType: "Full-time",
      workStyle: "hybrid",
      locationText: "Sydney NSW",
      salaryMin: 150000,
      salaryMax: 180000,
      salaryPeriod: "year",
      graduateRole: false,
      internshipRole: false,
      sponsorshipExplicit: null,
      sourceUrl: "https://careers.example.com/jobs/123",
      descriptionText: "Build reliable platform services.",
      postedAt: "2026-09-20T00:00:00Z",
      firstSeenAt: "2026-09-20T01:00:00Z",
      lastSeenAt: "2026-09-28T01:00:00Z",
      capturedAt: "2026-09-28T02:00:00Z",
      skills: [{ key: "postgresql", label: "PostgreSQL" }],
    });

    const application = JobApplicationSchema.parse({
      id: "123e4567-e89b-12d3-a456-426614174010",
      userId: 42,
      jobId: "123e4567-e89b-12d3-a456-426614174011",
      status: "saved",
      snapshot,
      notes: null,
      savedAt: "2026-09-28T02:00:00Z",
      statusChangedAt: "2026-09-28T02:00:00Z",
      appliedAt: null,
      interviewingAt: null,
      offerAt: null,
      closedAt: null,
      updatedAt: "2026-09-28T02:00:00Z",
    });

    expect(application.snapshot.skills[0]?.key).toBe("postgresql");
    expect(JobApplicationStatusSchema.safeParse("drafting").success).toBe(
      false,
    );
  });
});
