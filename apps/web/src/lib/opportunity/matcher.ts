import { createHash } from "node:crypto";
import type { Pool } from "pg";
import type {
  OpportunityMatchPreferences,
  OpportunityMatchResponse,
  OpportunityMatchResult,
  OpportunityScoreComponents,
  SampleActiveRole,
} from "@austechmap/contracts";

export function computeQueryHash(
  preferences: OpportunityMatchPreferences,
): string {
  const normalized = {
    roleFamily: preferences.roleFamily?.trim().toLowerCase() || null,
    skills: [...preferences.skills]
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
      .sort(),
    experienceBand: preferences.experienceBand || "any",
    locations: [...preferences.locations]
      .map((l) => l.trim().toLowerCase())
      .filter(Boolean)
      .sort(),
    locationRequired: Boolean(preferences.locationRequired),
    workStyle: preferences.workStyle || "any",
    workStyleRequired: Boolean(preferences.workStyleRequired),
    requiresSponsorship: Boolean(preferences.requiresSponsorship),
    prefersRegional: Boolean(preferences.prefersRegional),
  };

  return createHash("sha256")
    .update(JSON.stringify(normalized))
    .digest("hex");
}

export interface RawCompanyData {
  id: string;
  slug: string;
  display_name: string;
  primary_category: string | null;
  hq_city: string | null;
  is_regional: boolean;
  has_sponsorship_evidence: boolean;
  sponsorship_summary: string | null;
  locations: string[];
  jobs: Array<{
    id: string;
    title: string;
    normalized_title: string;
    role_family_id: string | null;
    role_family_key: string | null;
    seniority: string;
    remote_type: string;
    location_text: string | null;
    source_url: string;
    posted_at: string | null;
    first_seen_at: string;
  }>;
  observed_skills: string[];
}

export async function fetchOpportunityCompanyData(
  pool: Pool,
): Promise<RawCompanyData[]> {
  const query = `
    WITH active_jobs AS (
      SELECT 
        j.id,
        j.company_id,
        j.title,
        j.normalized_title,
        j.role_family_id,
        rf.key AS role_family_key,
        j.seniority::text,
        j.remote_type::text,
        j.location_text,
        j.source_url,
        j.posted_at,
        j.first_seen_at
      FROM jobs j
      LEFT JOIN role_families rf ON rf.id = j.role_family_id
      WHERE j.expired_at IS NULL
    ),
    company_skills AS (
      SELECT 
        j.company_id,
        array_agg(DISTINCT LOWER(s.key)) AS skill_keys,
        array_agg(DISTINCT LOWER(s.label)) AS skill_labels
      FROM job_skill_links jsl
      JOIN jobs j ON j.id = jsl.job_id
      JOIN skills s ON s.id = jsl.skill_id
      WHERE j.expired_at IS NULL
      GROUP BY j.company_id
    ),
    comp_locations AS (
      SELECT 
        cl.company_id,
        array_agg(DISTINCT rl.input_text) FILTER (WHERE rl.input_text IS NOT NULL) AS input_texts,
        array_agg(DISTINCT sa4.code) FILTER (WHERE sa4.code IS NOT NULL) AS sa4_codes,
        array_agg(DISTINCT sa4.name) FILTER (WHERE sa4.name IS NOT NULL) AS sa4_names,
        bool_or(rl.migration_category IS NOT NULL) AS is_regional
      FROM company_locations cl
      JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
      LEFT JOIN regions sa4 ON sa4.id = rl.sa4_region_id
      GROUP BY cl.company_id
    ),
    sponsorship AS (
      SELECT 
        e.entity_id::uuid AS company_id,
        bool_or(e.claim_type = 'sponsorship_labour_agreement' AND e.status = 'active') AS has_sponsorship,
        (
          SELECT e2.claim_value ->> 'agreement_type'
          FROM evidence e2
          WHERE e2.entity_id = e.entity_id AND e2.claim_type = 'sponsorship_labour_agreement' AND e2.status = 'active'
          LIMIT 1
        ) AS agreement_type
      FROM evidence e
      WHERE e.entity_type = 'company'
      GROUP BY e.entity_id
    )
    SELECT 
      c.id,
      c.slug,
      c.display_name,
      cat.label AS primary_category,
      research.claim_value ->> 'city' AS hq_city,
      COALESCE(loc.is_regional, false) AS is_regional,
      COALESCE(spon.has_sponsorship, false) AS has_sponsorship_evidence,
      CASE 
        WHEN spon.agreement_type IS NOT NULL THEN CONCAT('Approved Labour Agreement (', spon.agreement_type, ')')
        WHEN spon.has_sponsorship THEN 'Home Affairs Accredited Sponsor'
        ELSE NULL
      END AS sponsorship_summary,
      ARRAY_CAT(
        COALESCE(loc.input_texts, '{}'),
        ARRAY_CAT(COALESCE(loc.sa4_codes, '{}'), COALESCE(loc.sa4_names, '{}'))
      ) AS locations,
      COALESCE(
        json_agg(
          json_build_object(
            'id', aj.id,
            'title', aj.title,
            'normalized_title', aj.normalized_title,
            'role_family_id', aj.role_family_id,
            'role_family_key', aj.role_family_key,
            'seniority', aj.seniority,
            'remote_type', aj.remote_type,
            'location_text', aj.location_text,
            'source_url', aj.source_url,
            'posted_at', aj.posted_at,
            'first_seen_at', aj.first_seen_at
          )
        ) FILTER (WHERE aj.id IS NOT NULL),
        '[]'
      ) AS jobs,
      ARRAY_CAT(
        COALESCE(csk.skill_keys, '{}'),
        COALESCE(csk.skill_labels, '{}')
      ) AS observed_skills
    FROM companies c
    LEFT JOIN LATERAL (
      SELECT e.claim_value
      FROM evidence e
      WHERE e.entity_type = 'company' AND e.entity_id = c.id::text
        AND e.claim_type = 'employer_seed_research'
        AND e.status = 'active'
      ORDER BY e.observed_at DESC LIMIT 1
    ) research ON true
    LEFT JOIN LATERAL (
      SELECT cg.label
      FROM company_category_links ccl
      JOIN categories cg ON cg.id = ccl.category_id
      WHERE ccl.company_id = c.id
      ORDER BY cg.label
      LIMIT 1
    ) cat ON true
    LEFT JOIN comp_locations loc ON loc.company_id = c.id
    LEFT JOIN sponsorship spon ON spon.company_id = c.id
    LEFT JOIN active_jobs aj ON aj.company_id = c.id
    LEFT JOIN company_skills csk ON csk.company_id = c.id
    WHERE c.status != 'disabled' AND c.status != 'merged'
    GROUP BY c.id, c.slug, c.display_name, cat.label, research.claim_value, loc.is_regional, loc.input_texts, loc.sa4_codes, loc.sa4_names, spon.has_sponsorship, spon.agreement_type, csk.skill_keys, csk.skill_labels
  `;

  const result = await pool.query(query);

  return result.rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    display_name: r.display_name,
    primary_category: r.primary_category ?? null,
    hq_city: r.hq_city ?? null,
    is_regional: Boolean(r.is_regional),
    has_sponsorship_evidence: Boolean(r.has_sponsorship_evidence),
    sponsorship_summary: r.sponsorship_summary ?? null,
    locations: Array.isArray(r.locations) ? r.locations : [],
    jobs: Array.isArray(r.jobs) ? r.jobs : [],
    observed_skills: Array.isArray(r.observed_skills)
      ? Array.from(new Set(r.observed_skills))
      : [],
  }));
}

export function scoreCompany(
  company: RawCompanyData,
  preferences: OpportunityMatchPreferences,
): OpportunityMatchResult | null {
  const normTargetLocations = (preferences.locations ?? []).map((l) =>
    l.trim().toLowerCase(),
  );
  const companyLocationsLower = company.locations.map((l) =>
    l.trim().toLowerCase(),
  );
  if (company.hq_city) {
    companyLocationsLower.push(company.hq_city.trim().toLowerCase());
  }

  // --- HARD FILTER: Location ---
  if (preferences.locationRequired && normTargetLocations.length > 0) {
    const hasLocationMatch = normTargetLocations.some((target) =>
      companyLocationsLower.some(
        (loc) => loc.includes(target) || target.includes(loc),
      ),
    );
    if (!hasLocationMatch) {
      return null;
    }
  }

  // --- HARD FILTER: Work Style ---
  const companyWorkStyles = new Set(
    company.jobs.map((j) => j.remote_type.toLowerCase()),
  );
  if (preferences.workStyleRequired && preferences.workStyle !== "any") {
    const requested = preferences.workStyle.toLowerCase();
    const hasWorkStyleMatch =
      companyWorkStyles.has(requested) ||
      (requested === "remote" && companyWorkStyles.has("hybrid")) ||
      (companyWorkStyles.size === 0 && requested === "hybrid"); // give benefit of doubt if no active roles
    if (!hasWorkStyleMatch && company.jobs.length > 0) {
      return null;
    }
  }

  // --- HARD FILTER: Sponsorship ---
  if (preferences.requiresSponsorship && !company.has_sponsorship_evidence) {
    return null;
  }

  // --- 1. Role Fit (Max 30) ---
  let roleFitScore = 0;
  const targetRoleFamily = preferences.roleFamily?.trim().toLowerCase();
  const matchingRoleJobs = targetRoleFamily
    ? company.jobs.filter((j) => {
        const rfKey = j.role_family_key?.toLowerCase();
        const normTitle = j.normalized_title.toLowerCase();
        return (
          rfKey === targetRoleFamily ||
          normTitle.includes(targetRoleFamily) ||
          targetRoleFamily.includes(rfKey || "")
        );
      })
    : company.jobs;

  if (!targetRoleFamily) {
    // Neutral baseline if no specific role family targeted
    roleFitScore = company.jobs.length > 0 ? 25 : 18;
  } else if (matchingRoleJobs.length > 0) {
    roleFitScore = 30;
  } else {
    const knownRoleFamilies = [
      "software-engineering",
      "data",
      "ai-ml",
      "cloud-platform",
      "security",
      "quality",
      "product-delivery",
      "design",
      "architecture",
      "it-infrastructure",
    ];
    if (knownRoleFamilies.includes(targetRoleFamily)) {
      if (company.jobs.length > 0) {
        roleFitScore = 15;
      } else if (
        !company.primary_category ||
        company.primary_category.toLowerCase().includes("software") ||
        company.primary_category.toLowerCase().includes("tech") ||
        company.primary_category.toLowerCase().includes("saas") ||
        company.primary_category.toLowerCase().includes("cloud") ||
        company.primary_category.toLowerCase().includes("data") ||
        company.primary_category.toLowerCase().includes("ai") ||
        company.primary_category.toLowerCase().includes("fintech") ||
        company.primary_category.toLowerCase().includes("security")
      ) {
        roleFitScore = 10;
      } else {
        roleFitScore = 0;
      }
    } else {
      roleFitScore = 0;
    }
  }

  // Seniority adjustment (+3 bonus if matches requested experience band)
  if (
    preferences.experienceBand &&
    preferences.experienceBand !== "any" &&
    company.jobs.length > 0
  ) {
    const exp = preferences.experienceBand.toLowerCase();
    const hasSeniorityMatch = company.jobs.some(
      (j) => j.seniority.toLowerCase() === exp,
    );
    if (hasSeniorityMatch) {
      roleFitScore = Math.min(30, roleFitScore + 3);
    }
  }

  // --- 2. Relevant Current Hiring (Max 20) ---
  let hiringScore = 0;
  const activeCount = matchingRoleJobs.length;
  if (activeCount >= 5) {
    hiringScore = 20;
  } else if (activeCount >= 3) {
    hiringScore = 16;
  } else if (activeCount >= 1) {
    hiringScore = 12;
  } else if (company.jobs.length > 0) {
    hiringScore = 8; // other tech roles active
  } else {
    hiringScore = 4; // established company, but no active role currently scraped
  }

  // --- 3. Skill Fit (Max 15) ---
  let skillFitScore = 0;
  const userSkills = (preferences.skills ?? [])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const matchedSkills: string[] = [];
  const missingSkills: string[] = [];

  if (userSkills.length === 0) {
    skillFitScore = 10; // neutral
  } else {
    // Also inspect job titles/text for keywords
    const jobTextCombined = company.jobs
      .map((j) => `${j.title} ${j.location_text || ""}`)
      .join(" ")
      .toLowerCase();

    for (const skill of userSkills) {
      const foundInObserved = company.observed_skills.some(
        (s) => s.includes(skill) || skill.includes(s),
      );
      const foundInTitles = jobTextCombined.includes(skill);
      if (foundInObserved || foundInTitles) {
        matchedSkills.push(skill);
      } else {
        missingSkills.push(skill);
      }
    }

    const ratio = matchedSkills.length / userSkills.length;
    skillFitScore = Math.round(ratio * 15);
    if (matchedSkills.length > 0 && skillFitScore < 5) {
      skillFitScore = 5;
    }
  }

  // --- 4. Location & Work Style Fit (Max 15) ---
  // Sub-split: 10 points location, 5 points work style
  let locationFitScore = 0;
  if (normTargetLocations.length === 0) {
    locationFitScore = 8; // all Australia
  } else {
    const matchesLocation = normTargetLocations.some((target) =>
      companyLocationsLower.some(
        (loc) => loc.includes(target) || target.includes(loc),
      ),
    );
    locationFitScore = matchesLocation ? 10 : 3;
  }

  let workStyleScore = 0;
  if (!preferences.workStyle || preferences.workStyle === "any") {
    workStyleScore = 5;
  } else {
    const requested = preferences.workStyle.toLowerCase();
    if (companyWorkStyles.has(requested)) {
      workStyleScore = 5;
    } else if (
      requested === "remote" &&
      companyWorkStyles.has("hybrid")
    ) {
      workStyleScore = 4;
    } else if (companyWorkStyles.size === 0) {
      workStyleScore = 3;
    } else {
      workStyleScore = 1;
    }
  }
  const locationWorkStyleFitScore = Math.min(
    15,
    locationFitScore + workStyleScore,
  );

  // --- 5. Hiring Momentum / Consistency (Max 10) ---
  let momentumScore = 0;
  if (company.jobs.length >= 10) {
    momentumScore = 10;
  } else if (company.jobs.length >= 3) {
    momentumScore = 8;
  } else if (company.jobs.length >= 1) {
    momentumScore = 7;
  } else {
    momentumScore = 5;
  }

  // --- 6. Sponsorship & Regional Fit (Max 10) ---
  let sponRegScore = 0;
  if (preferences.requiresSponsorship && preferences.prefersRegional) {
    const sponPts = company.has_sponsorship_evidence ? 5 : 0;
    const regPts = company.is_regional ? 5 : 1;
    sponRegScore = sponPts + regPts;
  } else if (preferences.requiresSponsorship) {
    sponRegScore = company.has_sponsorship_evidence ? 10 : 0;
  } else if (preferences.prefersRegional) {
    sponRegScore = company.is_regional ? 10 : 2;
  } else {
    // Neither requested: give neutral 5 points, +2 bonus if company has verified sponsorship
    sponRegScore = company.has_sponsorship_evidence ? 8 : 5;
  }

  // --- Total Score ---
  const totalScore = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        roleFitScore +
          hiringScore +
          skillFitScore +
          locationWorkStyleFitScore +
          momentumScore +
          sponRegScore,
      ),
    ),
  );

  // Relevance Cutoff:
  // If user specified role family or skills, but company matches neither, reject match.
  if (
    (targetRoleFamily || userSkills.length > 0) &&
    roleFitScore === 0 &&
    matchedSkills.length === 0
  ) {
    return null;
  }

  // Baseline relevance threshold
  if (totalScore < 40) {
    return null;
  }

  const scoreComponents: OpportunityScoreComponents = {
    roleFit: roleFitScore,
    currentHiring: hiringScore,
    skillFit: skillFitScore,
    locationWorkStyleFit: locationWorkStyleFitScore,
    hiringMomentum: momentumScore,
    sponsorshipRegionalFit: sponRegScore,
    totalScore,
  };

  // --- Top Reasons Generation ---
  const topReasons: string[] = [];

  if (activeCount > 0) {
    topReasons.push(
      `Currently hiring ${activeCount} active ${targetRoleFamily ? `${targetRoleFamily} ` : ""}role${activeCount === 1 ? "" : "s"}`,
    );
  } else if (company.jobs.length > 0) {
    topReasons.push(
      `Hiring ${company.jobs.length} active technology roles across teams`,
    );
  }

  if (matchedSkills.length > 0) {
    topReasons.push(
      `Observed demand for your skills: ${matchedSkills.slice(0, 3).join(", ")}`,
    );
  }

  if (company.has_sponsorship_evidence) {
    topReasons.push(
      company.sponsorship_summary ||
        "Verified accredited sponsor under Department of Home Affairs",
    );
  }

  if (company.is_regional) {
    topReasons.push(
      "Footprint in designated regional Australian innovation hub",
    );
  }

  if (company.hq_city) {
    topReasons.push(
      `Headquarters / office presence in ${company.hq_city}${companyWorkStyles.has("hybrid") ? " (hybrid flexible)" : ""}`,
    );
  }

  const sampleActiveRoles: SampleActiveRole[] = (
    matchingRoleJobs.length > 0 ? matchingRoleJobs : company.jobs
  )
    .slice(0, 3)
    .map((j) => ({
      id: j.id,
      title: j.title,
      locationText: j.location_text,
      remoteType: j.remote_type,
      sourceUrl: j.source_url,
    }));

  return {
    companyId: company.id,
    companyName: company.display_name,
    companySlug: company.slug,
    primaryCategory: company.primary_category,
    hqCity: company.hq_city,
    matchScore: totalScore,
    scoreComponents,
    topReasons: topReasons.slice(0, 3),
    matchedSkills,
    missingSkills,
    activeRolesCount: company.jobs.length,
    sampleActiveRoles,
    hasSponsorshipEvidence: company.has_sponsorship_evidence,
    sponsorshipSummary: company.sponsorship_summary,
    isRegional: company.is_regional,
    dataQuality:
      company.jobs.length > 0 && company.has_sponsorship_evidence
        ? "high"
        : company.jobs.length > 0
          ? "medium"
          : "low",
    methodologyVersion: "v1.0",
    generatedAt: new Date().toISOString(),
  };
}

export async function matchOpportunities(
  pool: Pool,
  preferences: OpportunityMatchPreferences,
): Promise<OpportunityMatchResponse> {
  const queryHash = computeQueryHash(preferences);
  const rawCompanies = await fetchOpportunityCompanyData(pool);

  const matches: OpportunityMatchResult[] = [];

  for (const company of rawCompanies) {
    const scored = scoreCompany(company, preferences);
    if (scored !== null) {
      matches.push(scored);
    }
  }

  // Sort descending by matchScore, then by activeRolesCount
  matches.sort((a, b) => {
    if (b.matchScore !== a.matchScore) {
      return b.matchScore - a.matchScore;
    }
    return b.activeRolesCount - a.activeRolesCount;
  });

  const limitedMatches = matches.slice(0, preferences.limit || 20);

  return {
    version: 1,
    queryHash,
    totalMatches: matches.length,
    matches: limitedMatches,
  };
}
