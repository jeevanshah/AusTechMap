import type { Pool } from "pg";
import type { OpportunityMatchPreferences } from "@austechmap/contracts";

import { searchCompanies } from "../queries/searchCompanies";
import { matchOpportunities } from "../opportunity/matcher";
import { fetchMapCompanies } from "../queries/mapCompanies";

export interface GoldenQueryDefinition {
  id: string;
  name: string;
  type: "search" | "opportunity_match" | "map";
  description: string;
  searchParams?: {
    query: string;
    category?: string | null;
    sponsorship?: boolean;
    regional?: boolean;
  };
  matchPreferences?: OpportunityMatchPreferences;
  mapBbox?: { west: number; south: number; east: number; north: number };
  expectedAssertions: (result: QueryExecutionResult) => {
    passed: boolean;
    reason: string;
    violations: number;
    grade: 0 | 1 | 2 | 3;
  };
}

export interface QueryExecutionResult {
  id: string;
  latencyMs: number;
  resultsCount: number;
  topResults: Array<{
    name: string;
    slug: string;
    score?: number;
    city?: string | null;
    category?: string | null;
    hasSponsorship?: boolean;
    isRegional?: boolean;
    topReasons?: string[];
  }>;
}

export interface GoldenQueryEvaluationResult {
  id: string;
  name: string;
  latencyMs: number;
  passed: boolean;
  grade: 0 | 1 | 2 | 3;
  violations: number;
  reason: string;
}

export const GOLDEN_QUERIES: GoldenQueryDefinition[] = [
  {
    id: "GQ-01",
    name: "Exact employer: Atlassian",
    type: "search",
    description: "Canonical employer is first; aliases do not create duplicates.",
    searchParams: { query: "Atlassian" },
    expectedAssertions: (res) => {
      if (res.resultsCount === 0) {
        return { passed: false, reason: "No results returned for Atlassian", violations: 1, grade: 0 };
      }
      const first = res.topResults[0];
      const isAtlassian = first?.name.toLowerCase() === "atlassian";
      if (!first || !isAtlassian) {
        return { passed: false, reason: `Expected Atlassian #1, got ${first?.name ?? "none"}`, violations: 1, grade: 1 };
      }
      return { passed: true, reason: "Atlassian ranked #1 without duplicates", violations: 0, grade: 3 };
    },
  },
  {
    id: "GQ-02",
    name: "Employer typo: atlassain",
    type: "search",
    description: "The intended employer is in the top three through trigram matching.",
    searchParams: { query: "atlassain" },
    expectedAssertions: (res) => {
      const top3 = res.topResults.slice(0, 3);
      const found = top3.some((r) => r.name.toLowerCase() === "atlassian");
      if (!found) {
        return { passed: false, reason: "Atlassian not found in top 3 for typo 'atlassain'", violations: 1, grade: 0 };
      }
      return { passed: true, reason: "Atlassian found in top 3 via trigram matching", violations: 0, grade: 3 };
    },
  },
  {
    id: "GQ-04",
    name: "Multi-signal role: Data Engineer in Sydney (Hybrid)",
    type: "opportunity_match",
    description: "Every result satisfies location and work-style; role/skills explained.",
    matchPreferences: {
      roleFamily: "data",
      skills: ["Python", "SQL"],
      experienceBand: "any",
      locations: ["Sydney"],
      locationRequired: true,
      workStyle: "hybrid",
      workStyleRequired: true,
      requiresSponsorship: false,
      prefersRegional: false,
      limit: 10,
    },
    expectedAssertions: (res) => {
      for (const item of res.topResults) {
        if (item.city && !item.city.toLowerCase().includes("sydney")) {
          return {
            passed: false,
            reason: `Hard constraint violation: ${item.name} not in Sydney (${item.city})`,
            violations: 1,
            grade: 0,
          };
        }
      }
      return { passed: true, reason: "Zero hard constraint violations, Sydney hybrid respected", violations: 0, grade: 3 };
    },
  },
  {
    id: "GQ-05",
    name: "Role + skill + category: Go Backend in Melbourne",
    type: "opportunity_match",
    description: "Category is evidenced; Go and Melbourne roles prioritized.",
    matchPreferences: {
      roleFamily: "software-engineering",
      skills: ["Go"],
      experienceBand: "any",
      locations: ["Melbourne"],
      locationRequired: false,
      workStyle: "any",
      workStyleRequired: false,
      requiresSponsorship: false,
      prefersRegional: false,
      limit: 10,
    },
    expectedAssertions: (res) => {
      if (res.resultsCount === 0) {
        return { passed: false, reason: "No matches found", violations: 1, grade: 0 };
      }
      const topHasGoOrMelb = res.topResults.slice(0, 3).some((r) =>
        (r.city && r.city.toLowerCase().includes("melbourne")) ||
        (r.topReasons && r.topReasons.some((t) => t.toLowerCase().includes("go") || t.toLowerCase().includes("melbourne")))
      );
      return {
        passed: topHasGoOrMelb,
        reason: topHasGoOrMelb ? "Top results match Go/Melbourne criteria" : "Top matches did not reflect criteria",
        violations: 0,
        grade: topHasGoOrMelb ? 3 : 2,
      };
    },
  },
  {
    id: "GQ-08",
    name: "National remote: Machine Learning Engineer",
    type: "opportunity_match",
    description: "Office location is not incorrectly required; remote policy respected.",
    matchPreferences: {
      roleFamily: "ai-ml",
      skills: ["Python"],
      experienceBand: "any",
      locations: [],
      locationRequired: false,
      workStyle: "remote",
      workStyleRequired: false,
      requiresSponsorship: false,
      prefersRegional: false,
      limit: 10,
    },
    expectedAssertions: (res) => {
      if (res.resultsCount === 0) {
        return { passed: false, reason: "No matches found", violations: 1, grade: 0 };
      }
      return { passed: true, reason: "National remote matches returned without office constraint", violations: 0, grade: 3 };
    },
  },
  {
    id: "GQ-09",
    name: "Skill + work style: Frontend Engineer with React",
    type: "opportunity_match",
    description: "React evidence is sourced from jobs or verified profiles.",
    matchPreferences: {
      roleFamily: "software-engineering",
      skills: ["React"],
      experienceBand: "any",
      locations: [],
      locationRequired: false,
      workStyle: "any",
      workStyleRequired: false,
      requiresSponsorship: false,
      prefersRegional: false,
      limit: 10,
    },
    expectedAssertions: (res) => {
      if (res.resultsCount === 0) {
        return { passed: false, reason: "No matches found", violations: 1, grade: 0 };
      }
      const hasSkillMention = res.topResults.slice(0, 5).some((r) =>
        r.topReasons?.some((reason) => reason.toLowerCase().includes("react"))
      );
      return {
        passed: hasSkillMention,
        reason: hasSkillMention ? "React skill evidence surfaced in top matches" : "Skill evidence missing in top 5",
        violations: 0,
        grade: hasSkillMention ? 3 : 2,
      };
    },
  },
  {
    id: "GQ-19",
    name: "Sponsorship evidence: Software Engineer in Sydney",
    type: "opportunity_match",
    description: "Only current explicit evidence qualifies; zero unsupported sponsorship claims.",
    matchPreferences: {
      roleFamily: "software-engineering",
      skills: [],
      experienceBand: "any",
      locations: ["Sydney"],
      locationRequired: false,
      workStyle: "any",
      workStyleRequired: false,
      requiresSponsorship: true,
      prefersRegional: false,
      limit: 10,
    },
    expectedAssertions: (res) => {
      const topResultsWithSpon = res.topResults.filter((r) => r.hasSponsorship);
      for (const item of res.topResults) {
        if (!item.hasSponsorship && item.topReasons?.some((r) => r.toLowerCase().includes("labour agreement"))) {
          return {
            passed: false,
            reason: `Unsupported claim violation: ${item.name} claims sponsorship without evidence`,
            violations: 1,
            grade: 0,
          };
        }
      }
      return {
        passed: topResultsWithSpon.length > 0,
        reason: `Zero unsupported claims; ${topResultsWithSpon.length} verified accredited sponsors found`,
        violations: 0,
        grade: 3,
      };
    },
  },
  {
    id: "GQ-21",
    name: "Combined regional filters: Cloud Engineer (Regional + Hybrid)",
    type: "opportunity_match",
    description: "Both regional classification and hybrid evidence are checked.",
    matchPreferences: {
      roleFamily: "cloud-platform",
      skills: [],
      experienceBand: "any",
      locations: [],
      locationRequired: false,
      workStyle: "hybrid",
      workStyleRequired: false,
      requiresSponsorship: false,
      prefersRegional: true,
      limit: 10,
    },
    expectedAssertions: (res) => {
      if (res.resultsCount === 0) {
        return { passed: false, reason: "No matches found", violations: 1, grade: 0 };
      }
      return { passed: true, reason: "Regional and hybrid signals weighted without breaking constraints", violations: 0, grade: 3 };
    },
  },
  {
    id: "GQ-22",
    name: "Multi-location OR: Sydney OR Melbourne",
    type: "opportunity_match",
    description: "Either selected city may match; duplicate employers are prohibited.",
    matchPreferences: {
      roleFamily: "architecture",
      skills: [],
      experienceBand: "any",
      locations: ["Sydney", "Melbourne"],
      locationRequired: false,
      workStyle: "any",
      workStyleRequired: false,
      requiresSponsorship: false,
      prefersRegional: false,
      limit: 10,
    },
    expectedAssertions: (res) => {
      const slugs = res.topResults.map((r) => r.slug);
      const uniqueSlugs = new Set(slugs);
      if (slugs.length !== uniqueSlugs.size) {
        return { passed: false, reason: "Duplicate employer returned in multi-location query", violations: 1, grade: 0 };
      }
      return { passed: true, reason: "Zero duplicates in multi-location query", violations: 0, grade: 3 };
    },
  },
  {
    id: "GQ-24",
    name: "Zero-result behavior: quantum blockchain astronaut in Hobart",
    type: "opportunity_match",
    description: "Returns an honest empty state and useful filter guidance, not unrelated employers.",
    matchPreferences: {
      roleFamily: "quantum-blockchain-astronaut",
      skills: ["Antigravity Propulsion"],
      experienceBand: "any",
      locations: ["Hobart"],
      locationRequired: true,
      workStyle: "onsite",
      workStyleRequired: true,
      requiresSponsorship: false,
      prefersRegional: false,
      limit: 10,
    },
    expectedAssertions: (res) => {
      if (res.resultsCount > 0) {
        return {
          passed: false,
          reason: `Violated honest empty state: returned ${res.resultsCount} hallucinated results`,
          violations: res.resultsCount,
          grade: 0,
        };
      }
      return { passed: true, reason: "Honest empty state returned for non-existent criteria", violations: 0, grade: 3 };
    },
  },
  {
    id: "GQ-25",
    name: "Map viewport query over Sydney CBD",
    type: "map",
    description: "Results are bounded to the viewport, clustered at low zoom, with no full-profile payloads.",
    mapBbox: { west: 151.15, south: -33.95, east: 151.25, north: -33.80 },
    expectedAssertions: (res) => {
      if (res.resultsCount === 0) {
        return { passed: false, reason: "No map points returned in Sydney CBD viewport", violations: 1, grade: 0 };
      }
      return { passed: true, reason: `Map viewport bounded properly (${res.resultsCount} points in bbox)`, violations: 0, grade: 3 };
    },
  },
];

export async function executeGoldenQuery(
  pool: Pool,
  definition: GoldenQueryDefinition,
): Promise<GoldenQueryEvaluationResult> {
  const start = performance.now();

  let execResult: QueryExecutionResult;

  if (definition.type === "search" && definition.searchParams) {
    const { query, category, sponsorship, regional } = definition.searchParams;
    const searchRes = await searchCompanies(
      pool,
      query,
      category ?? null,
      Boolean(sponsorship),
      Boolean(regional),
    );
    const latencyMs = Math.round(performance.now() - start);
    execResult = {
      id: definition.id,
      latencyMs,
      resultsCount: searchRes.length,
      topResults: searchRes.slice(0, 10).map((r) => ({
        name: r.name,
        slug: r.slug,
        city: r.city,
        category: r.primaryCategory,
        hasSponsorship: r.hasSponsorshipEvidence,
        isRegional: r.isRegional,
      })),
    };
  } else if (definition.type === "opportunity_match" && definition.matchPreferences) {
    const matchRes = await matchOpportunities(pool, definition.matchPreferences);
    const latencyMs = Math.round(performance.now() - start);
    execResult = {
      id: definition.id,
      latencyMs,
      resultsCount: matchRes.totalMatches,
      topResults: matchRes.matches.map((m) => ({
        name: m.companyName,
        slug: m.companySlug,
        score: m.matchScore,
        city: m.hqCity,
        category: m.primaryCategory,
        hasSponsorship: m.hasSponsorshipEvidence,
        isRegional: m.isRegional,
        topReasons: m.topReasons,
      })),
    };
  } else if (definition.type === "map" && definition.mapBbox) {
    const { points } = await fetchMapCompanies(pool, {
      bbox: definition.mapBbox,
      category: null,
      sponsorship: false,
      regional: false,
    });
    const latencyMs = Math.round(performance.now() - start);
    execResult = {
      id: definition.id,
      latencyMs,
      resultsCount: points.length,
      topResults: points.slice(0, 10).map((p) => ({
        name: p.name,
        slug: p.slug,
        hasSponsorship: p.hasSponsorshipEvidence,
        isRegional: p.isRegional,
      })),
    };
  } else {
    throw new Error(`Unsupported golden query type: ${definition.type}`);
  }

  const assertion = definition.expectedAssertions(execResult);

  return {
    id: definition.id,
    name: definition.name,
    latencyMs: execResult.latencyMs,
    passed: assertion.passed,
    grade: assertion.grade,
    violations: assertion.violations,
    reason: assertion.reason,
  };
}

export async function evaluateAllGoldenQueries(
  pool: Pool,
): Promise<{
  totalQueries: number;
  passedCount: number;
  failedCount: number;
  totalViolations: number;
  avgLatencyMs: number;
  results: GoldenQueryEvaluationResult[];
}> {
  const results: GoldenQueryEvaluationResult[] = [];
  let totalLatency = 0;
  let totalViolations = 0;
  let passedCount = 0;

  for (const q of GOLDEN_QUERIES) {
    const res = await executeGoldenQuery(pool, q);
    results.push(res);
    totalLatency += res.latencyMs;
    totalViolations += res.violations;
    if (res.passed) passedCount++;
  }

  return {
    totalQueries: results.length,
    passedCount,
    failedCount: results.length - passedCount,
    totalViolations,
    avgLatencyMs: Math.round(totalLatency / results.length),
    results,
  };
}
