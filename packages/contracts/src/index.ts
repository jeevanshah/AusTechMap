import { z } from "zod";

export const HealthResponseSchema = z.object({
  service: z.enum(["web", "ingestion"]),
  status: z.enum(["ok", "degraded"]),
  version: z.literal(1),
  runId: z.string().min(1).optional(),
  diagnostics: z
    .object({
      database: z.string(),
      latencyMs: z.number().optional(),
      latestMigration: z.string().nullable().optional(),
    })
    .optional(),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;

export const MapCompanyPointSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  lat: z.number().min(-45).max(-9),
  lng: z.number().min(96).max(168),
  locationType: z.enum(["head_office", "branch", "remote_only"]),
  careersUrl: z.string().nullable(),
  city: z.string().nullable(),
  primaryCategory: z.string().nullable(),
  hasSponsorshipEvidence: z.boolean(),
  isRegional: z.boolean(),
});

export type MapCompanyPoint = z.infer<typeof MapCompanyPointSchema>;

export const MapCompaniesResponseSchema = z.object({
  version: z.literal(1),
  bbox: z.object({
    west: z.number(),
    south: z.number(),
    east: z.number(),
    north: z.number(),
  }),
  points: z.array(MapCompanyPointSchema).max(500),
  truncated: z.boolean(),
});

export type MapCompaniesResponse = z.infer<typeof MapCompaniesResponseSchema>;

export const CompanySearchResultSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().nullable(),
  matchType: z.enum(["name", "alias", "location", "research_summary"]),
  matchedText: z.string().nullable(),
  score: z.number().min(0).max(1),
  city: z.string().nullable(),
  primaryCategory: z.string().nullable(),
  hasSponsorshipEvidence: z.boolean(),
  isRegional: z.boolean(),
});

export type CompanySearchResult = z.infer<typeof CompanySearchResultSchema>;

export const CompanySearchResponseSchema = z.object({
  version: z.literal(1),
  query: z.string(),
  results: z.array(CompanySearchResultSchema).max(20),
});

export type CompanySearchResponse = z.infer<typeof CompanySearchResponseSchema>;

export const CategorySchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  groupKey: z.string().min(1),
  groupLabel: z.string().min(1),
});

export type Category = z.infer<typeof CategorySchema>;

export const CategoriesResponseSchema = z.object({
  version: z.literal(1),
  categories: z.array(CategorySchema),
});

export type CategoriesResponse = z.infer<typeof CategoriesResponseSchema>;

export const RegionalHubSchema = z.object({
  city: z.string().min(1),
  count: z.number().int().min(1),
});

export type RegionalHub = z.infer<typeof RegionalHubSchema>;

export const RegionalHubsResponseSchema = z.object({
  version: z.literal(1),
  hubs: z.array(RegionalHubSchema),
});

export type RegionalHubsResponse = z.infer<typeof RegionalHubsResponseSchema>;

export const RegionScoreComponentSchema = z.object({
  raw: z.unknown(),
  normalized: z.number().min(0).max(1).nullable(),
  weight: z.number().min(0).max(1),
});

export const RegionOpportunityResponseSchema = z
  .object({
    version: z.literal(1),
    region: z.object({
      code: z.string().min(1),
      name: z.string().min(1),
      type: z.literal("sa4"),
    }),
    summary: z.object({
      employerCount: z.number().int().min(0),
      monitoredEmployerCount: z.number().int().min(0),
      activeJobCount: z.number().int().min(0),
      industryCount: z.number().int().min(0),
    }),
    migrationContext: z.object({
      categories: z.array(z.enum(["category_2", "category_3", "dama"])),
      damaNames: z.array(z.string().min(1)),
    }),
    employers: z
      .array(
        z.object({
          slug: z.string().min(1),
          name: z.string().min(1),
          primaryCategory: z.string().nullable(),
          activeJobCount: z.number().int().min(0),
        }),
      )
      .max(20),
    jobs: z
      .array(
        z.object({
          companySlug: z.string().min(1),
          companyName: z.string().min(1),
          title: z.string().min(1),
          roleFamily: z.string().nullable(),
          remoteType: z.enum([
            "onsite",
            "hybrid",
            "remote",
            "flexible_mixed",
            "unknown",
          ]),
          sourceUrl: z.string().url(),
          postedAt: z.string().nullable(),
        }),
      )
      .max(20),
    laborSignals: z
      .array(
        z.object({
          dataset: z.enum(["nero", "ivi"]),
          metricKey: z.string().min(1),
          periodStart: z.string().date(),
          periodEnd: z.string().date(),
          value: z.number(),
          unit: z.string().min(1),
          direction: z.number().int().min(-1).max(1).nullable(),
          sourceVersion: z.string().min(1),
        }),
      )
      .max(20),
    score: z.object({
      value: z.number().min(0).max(100).nullable(),
      methodologyVersion: z.string().nullable(),
      periodStart: z.string().date().nullable(),
      periodEnd: z.string().date().nullable(),
      generatedAt: z.string().nullable(),
      components: z.record(z.string(), RegionScoreComponentSchema),
      sufficiency: z.object({
        sufficient: z.boolean(),
        reasons: z.array(z.string()),
        thresholds: z.record(z.string(), z.number()).optional(),
        observed: z.record(z.string(), z.number()).optional(),
      }),
    }),
  })
  .refine(
    ({ score }) => score.sufficiency.sufficient === (score.value !== null),
    {
      message:
        "score value must be present exactly when evidence is sufficient",
      path: ["score", "value"],
    },
  );

export type RegionOpportunityResponse = z.infer<
  typeof RegionOpportunityResponseSchema
>;

// --- Phase 7: Retention & Opportunity Engine Contracts ---

export const SavedSearchFilterSchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  roleFamily: z.string().optional(),
  hiring: z.boolean().optional(),
  sponsorship: z.string().optional(),
  regional: z.boolean().optional(),
  remote: z.string().optional(),
  hubCity: z.string().optional(),
  sa4Code: z.string().optional(),
});

export type SavedSearchFilter = z.infer<typeof SavedSearchFilterSchema>;

export const AlertFrequencySchema = z.enum(["never", "daily", "weekly", "instant"]);
export type AlertFrequency = z.infer<typeof AlertFrequencySchema>;

export const SavedSearchSchema = z.object({
  id: z.string().uuid(),
  userId: z.number().int(),
  name: z.string().min(1),
  filters: SavedSearchFilterSchema,
  alertFrequency: AlertFrequencySchema,
  lastAlertedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type SavedSearch = z.infer<typeof SavedSearchSchema>;

export const CreateSavedSearchRequestSchema = z.object({
  name: z.string().trim().min(1).max(255),
  filters: SavedSearchFilterSchema,
  alertFrequency: AlertFrequencySchema.default("never"),
});

export type CreateSavedSearchRequest = z.infer<typeof CreateSavedSearchRequestSchema>;

export const SavedSearchListResponseSchema = z.object({
  version: z.literal(1),
  searches: z.array(SavedSearchSchema),
});

export type SavedSearchListResponse = z.infer<typeof SavedSearchListResponseSchema>;

export const WatchlistEntityTypeSchema = z.enum(["company", "region"]);
export type WatchlistEntityType = z.infer<typeof WatchlistEntityTypeSchema>;

export const WatchlistEntrySchema = z.object({
  id: z.string().uuid(),
  userId: z.number().int(),
  entityType: WatchlistEntityTypeSchema,
  companyId: z.string().uuid().nullable(),
  regionId: z.string().uuid().nullable(),
  sa4Code: z.string().nullable(),
  notes: z.string().nullable().optional(),
  createdAt: z.string(),
  company: z
    .object({
      id: z.string().uuid(),
      slug: z.string(),
      name: z.string(),
      city: z.string().nullable().optional(),
      primaryCategory: z.string().nullable().optional(),
      hasSponsorshipEvidence: z.boolean().optional(),
      isRegional: z.boolean().optional(),
    })
    .optional(),
  region: z
    .object({
      code: z.string(),
      name: z.string(),
      opportunityScore: z.number().nullable().optional(),
    })
    .optional(),
});

export type WatchlistEntry = z.infer<typeof WatchlistEntrySchema>;

export const ToggleWatchlistRequestSchema = z.object({
  entityType: WatchlistEntityTypeSchema,
  companyId: z.string().uuid().optional(),
  sa4Code: z.string().optional(),
  regionId: z.string().uuid().optional(),
});

export type ToggleWatchlistRequest = z.infer<typeof ToggleWatchlistRequestSchema>;

export const WatchlistListResponseSchema = z.object({
  version: z.literal(1),
  watchlist: z.array(WatchlistEntrySchema),
});

export type WatchlistListResponse = z.infer<typeof WatchlistListResponseSchema>;

export const AlertTypeSchema = z.enum([
  "new_job",
  "sponsorship_change",
  "company_update",
  "region_update",
  "saved_search_match",
]);
export type AlertType = z.infer<typeof AlertTypeSchema>;

export const UserAlertSchema = z.object({
  id: z.string().uuid(),
  userId: z.number().int(),
  alertType: AlertTypeSchema,
  title: z.string().min(1),
  message: z.string().min(1),
  link: z.string().nullable(),
  entityType: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});

export type UserAlert = z.infer<typeof UserAlertSchema>;

export const UserAlertsResponseSchema = z.object({
  version: z.literal(1),
  unreadCount: z.number().int().min(0),
  alerts: z.array(UserAlertSchema),
});

export type UserAlertsResponse = z.infer<typeof UserAlertsResponseSchema>;

// --- Phase 7: Opportunity Match & Explainability Engine ---

export const OpportunityExperienceBandSchema = z.enum([
  "entry",
  "mid",
  "senior",
  "lead_principal",
  "any",
]);
export type OpportunityExperienceBand = z.infer<
  typeof OpportunityExperienceBandSchema
>;

export const OpportunityWorkStyleSchema = z.enum([
  "onsite",
  "hybrid",
  "remote",
  "any",
]);
export type OpportunityWorkStyle = z.infer<typeof OpportunityWorkStyleSchema>;

export const OpportunityMatchPreferencesSchema = z.object({
  roleFamily: z.string().optional(),
  skills: z.array(z.string()).default([]),
  experienceBand: OpportunityExperienceBandSchema.default("any"),
  locations: z.array(z.string()).default([]),
  locationRequired: z.boolean().default(false),
  workStyle: OpportunityWorkStyleSchema.default("any"),
  workStyleRequired: z.boolean().default(false),
  requiresSponsorship: z.boolean().default(false),
  prefersRegional: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(20),
});

export type OpportunityMatchPreferences = z.infer<
  typeof OpportunityMatchPreferencesSchema
>;

export const OpportunityScoreComponentsSchema = z.object({
  roleFit: z.number().min(0).max(30),
  currentHiring: z.number().min(0).max(20),
  skillFit: z.number().min(0).max(15),
  locationWorkStyleFit: z.number().min(0).max(15),
  hiringMomentum: z.number().min(0).max(10),
  sponsorshipRegionalFit: z.number().min(0).max(10),
  totalScore: z.number().min(0).max(100),
});

export type OpportunityScoreComponents = z.infer<
  typeof OpportunityScoreComponentsSchema
>;

export const SampleActiveRoleSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  locationText: z.string().nullable().optional(),
  remoteType: z.string().nullable().optional(),
  sourceUrl: z.string(),
});

export type SampleActiveRole = z.infer<typeof SampleActiveRoleSchema>;

export const OpportunityMatchResultSchema = z.object({
  companyId: z.string().uuid(),
  companyName: z.string(),
  companySlug: z.string(),
  primaryCategory: z.string().nullable().optional(),
  hqCity: z.string().nullable().optional(),
  matchScore: z.number().min(0).max(100),
  scoreComponents: OpportunityScoreComponentsSchema,
  topReasons: z.array(z.string()),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  activeRolesCount: z.number().int().min(0),
  sampleActiveRoles: z.array(SampleActiveRoleSchema),
  hasSponsorshipEvidence: z.boolean(),
  sponsorshipSummary: z.string().nullable().optional(),
  isRegional: z.boolean(),
  dataQuality: z.enum(["high", "medium", "low", "insufficient"]),
  methodologyVersion: z.string(),
  generatedAt: z.string(),
});

export type OpportunityMatchResult = z.infer<
  typeof OpportunityMatchResultSchema
>;

export const OpportunityMatchResponseSchema = z.object({
  version: z.literal(1),
  queryHash: z.string(),
  totalMatches: z.number().int().min(0),
  matches: z.array(OpportunityMatchResultSchema),
});

export type OpportunityMatchResponse = z.infer<
  typeof OpportunityMatchResponseSchema
>;

// --- Phase 7: Change Events & Notification Delivery Contracts ---

export const ChangeEventTypeSchema = z.enum([
  "job.first_seen",
  "job.expired",
  "sponsorship.evidence_added",
  "company.location_added",
  "company.updated",
]);
export type ChangeEventType = z.infer<typeof ChangeEventTypeSchema>;

export const ChangeEventSchema = z.object({
  id: z.string().uuid(),
  eventType: ChangeEventTypeSchema,
  entityType: z.enum(["company", "job", "region"]),
  entityId: z.string(),
  dedupeKey: z.string(),
  payload: z.record(z.string(), z.unknown()),
  sourceId: z.string().uuid().nullable().optional(),
  occurredAt: z.string(),
  eventVersion: z.number().int().default(1),
  createdAt: z.string(),
});

export type ChangeEvent = z.infer<typeof ChangeEventSchema>;

export const NotificationDeliveryChannelSchema = z.enum(["in_app", "email"]);
export type NotificationDeliveryChannel = z.infer<
  typeof NotificationDeliveryChannelSchema
>;

export const NotificationDeliveryStatusSchema = z.enum([
  "sent",
  "skipped_suppressed",
  "failed",
]);
export type NotificationDeliveryStatus = z.infer<
  typeof NotificationDeliveryStatusSchema
>;

export const NotificationDeliverySchema = z.object({
  id: z.string().uuid(),
  userId: z.number().int(),
  eventId: z.string().uuid(),
  channel: NotificationDeliveryChannelSchema,
  deliveryWindow: z.string(),
  status: NotificationDeliveryStatusSchema,
  errorMessage: z.string().nullable().optional(),
  deliveredAt: z.string(),
});

export type NotificationDelivery = z.infer<typeof NotificationDeliverySchema>;

export const DigestItemSchema = z.object({
  title: z.string(),
  description: z.string(),
  link: z.string(),
  badge: z.string().optional(),
  category: z.string().optional(),
});

export type DigestItem = z.infer<typeof DigestItemSchema>;

export const DigestEmailPayloadSchema = z.object({
  userEmail: z.string().email(),
  userName: z.string().optional(),
  frequency: z.enum(["daily", "weekly", "instant"]),
  windowKey: z.string(),
  items: z.array(DigestItemSchema),
  unsubscribeUrl: z.string().url(),
});

export type DigestEmailPayload = z.infer<typeof DigestEmailPayloadSchema>;

// --- Phase 9: Commercial Readiness — Verified Claims & Corrections ---

export const EmployerClaimStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "revoked",
]);
export type EmployerClaimStatus = z.infer<typeof EmployerClaimStatusSchema>;

export const DataCorrectionTypeSchema = z.enum([
  "location_incorrect",
  "careers_url_broken",
  "sponsorship_dispute",
  "category_mismatch",
  "other",
]);
export type DataCorrectionType = z.infer<typeof DataCorrectionTypeSchema>;

export const DataCorrectionStatusSchema = z.enum([
  "pending",
  "approved",
  "rejected",
]);
export type DataCorrectionStatus = z.infer<typeof DataCorrectionStatusSchema>;

export const CreateEmployerClaimRequestSchema = z.object({
  companyId: z.string().uuid(),
  claimantName: z.string().trim().min(2).max(100),
  claimantEmail: z.string().trim().email(),
  claimantRole: z.string().trim().min(2).max(100),
  claimType: z.string().trim().default("profile_verification"),
  claimedData: z.record(z.string(), z.unknown()).default({}),
  evidenceUrl: z.string().url().nullable().optional(),
});
export type CreateEmployerClaimRequest = z.infer<
  typeof CreateEmployerClaimRequestSchema
>;

export const EmployerClaimSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  userId: z.number().int().nullable().optional(),
  claimantName: z.string(),
  claimantEmail: z.string().email(),
  claimantRole: z.string(),
  claimType: z.string(),
  claimedData: z.record(z.string(), z.unknown()),
  evidenceUrl: z.string().nullable().optional(),
  status: EmployerClaimStatusSchema,
  reviewNotes: z.string().nullable().optional(),
  reviewedByUserId: z.number().int().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type EmployerClaim = z.infer<typeof EmployerClaimSchema>;

export const CreateDataCorrectionRequestSchema = z.object({
  companyId: z.string().uuid().nullable().optional(),
  submitterName: z.string().trim().max(100).optional(),
  submitterEmail: z.string().trim().email(),
  correctionType: DataCorrectionTypeSchema,
  details: z.string().trim().min(10).max(2000),
  evidenceUrl: z.string().url().nullable().optional(),
});
export type CreateDataCorrectionRequest = z.infer<
  typeof CreateDataCorrectionRequestSchema
>;

export const DataCorrectionSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid().nullable().optional(),
  userId: z.number().int().nullable().optional(),
  submitterName: z.string().nullable().optional(),
  submitterEmail: z.string().email(),
  correctionType: DataCorrectionTypeSchema,
  details: z.string(),
  evidenceUrl: z.string().nullable().optional(),
  status: DataCorrectionStatusSchema,
  reviewNotes: z.string().nullable().optional(),
  reviewedByUserId: z.number().int().nullable().optional(),
  reviewedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type DataCorrection = z.infer<typeof DataCorrectionSchema>;

export const ReviewClaimActionSchema = z.object({
  claimId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  reviewNotes: z.string().trim().max(1000).optional(),
});
export type ReviewClaimAction = z.infer<typeof ReviewClaimActionSchema>;

export const ReviewCorrectionActionSchema = z.object({
  correctionId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  reviewNotes: z.string().trim().max(1000).optional(),
});
export type ReviewCorrectionAction = z.infer<
  typeof ReviewCorrectionActionSchema
>;

// --- Phase 9.2: Analytics Entitlements, Billing Boundaries & Sponsored Placements ---

export const EntitlementTypeSchema = z.enum([
  "employer_analytics",
  "institutional_export",
  "extended_alerts",
  "api_stream",
]);
export type EntitlementType = z.infer<typeof EntitlementTypeSchema>;

export const UserEntitlementSchema = z.object({
  id: z.string().uuid(),
  userId: z.number().int(),
  entitlement: EntitlementTypeSchema,
  grantedByUserId: z.number().int().nullable().optional(),
  grantedAt: z.string(),
  expiresAt: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});
export type UserEntitlement = z.infer<typeof UserEntitlementSchema>;

export const BillingTierSchema = z.enum([
  "free",
  "employer_pro",
  "institutional_annual",
]);
export type BillingTier = z.infer<typeof BillingTierSchema>;

export const BillingCustomerStatusSchema = z.enum([
  "active",
  "past_due",
  "canceled",
  "trialing",
]);
export type BillingCustomerStatus = z.infer<typeof BillingCustomerStatusSchema>;

export const BillingCustomerSchema = z.object({
  id: z.string().uuid(),
  userId: z.number().int(),
  stripeCustomerId: z.string().nullable().optional(),
  billingTier: BillingTierSchema,
  status: BillingCustomerStatusSchema,
  currentPeriodEnd: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BillingCustomer = z.infer<typeof BillingCustomerSchema>;

export const SponsoredPlacementStatusSchema = z.enum([
  "active",
  "paused",
  "expired",
]);
export type SponsoredPlacementStatus = z.infer<
  typeof SponsoredPlacementStatusSchema
>;

export const SponsoredPlacementSchema = z.object({
  id: z.string().uuid(),
  companyId: z.string().uuid(),
  companyName: z.string().optional(),
  companySlug: z.string().optional(),
  campaignName: z.string().trim().min(1),
  headline: z.string().trim().min(1),
  targetRoleFamilies: z.array(z.string()).default([]),
  targetRegions: z.array(z.string()).default([]),
  ctaLabel: z.string().default("View Verified Profile"),
  ctaUrl: z.string().url().nullable().optional(),
  status: SponsoredPlacementStatusSchema,
  startDate: z.string(),
  endDate: z.string(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});
export type SponsoredPlacement = z.infer<typeof SponsoredPlacementSchema>;



