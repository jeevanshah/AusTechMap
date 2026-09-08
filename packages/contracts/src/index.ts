import { z } from "zod";

export const HealthResponseSchema = z.object({
  service: z.enum(["web", "ingestion"]),
  status: z.literal("ok"),
  version: z.literal(1),
  runId: z.string().min(1).optional(),
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

