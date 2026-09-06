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
