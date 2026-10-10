/**
 * How a user's confirmed profile skills line up with the skills we found in a
 * job posting.
 *
 * Deliberately modest, because both sides are incomplete:
 * - Posting skills are extracted automatically from the title/description by a
 *   keyword matcher, so the list may miss skills the posting really wants.
 * - Profile skills are what the user confirmed from their CV, not everything
 *   they can do.
 * So a skill the posting names that is not in the profile is "not in your
 * profile", never "you lack it"; there is no score or hiring-chance claim; and
 * when either side has nothing to compare we show nothing rather than 0%.
 * No LLM and no CV text is involved: only structured skill keys.
 */

/**
 * Confidence the ingestion worker assigns to a skill link
 * (workers/ingestion/.../hiring/normalisation.py). Mirrored here so evidence
 * wording can distinguish "named in the title" from "found in the description";
 * skillFit.test.ts pins the values.
 */
export const TITLE_MATCH_CONFIDENCE = 0.7;
export const DESCRIPTION_MATCH_CONFIDENCE = 0.5;

export const MAX_LEAD_WITH = 3;
export const MAX_MISSING_SHOWN = 8;

export interface JobSkillInput {
  key: string;
  label: string;
  confidence: number;
}

export interface FitSkill {
  key: string;
  label: string;
  evidence: "job title" | "job description";
}

export interface SkillFit {
  matched: FitSkill[];
  /** Posting skills not in the profile, capped at MAX_MISSING_SHOWN. */
  missing: FitSkill[];
  /** How many posting skills are not in the profile, before the cap. */
  missingTotal: number;
  /** Matched skills to put first on the CV, title-named skills first. */
  leadWith: FitSkill[];
  /** Posting skills found in total (matched + missing before the cap). */
  statedTotal: number;
}

function evidenceFor(confidence: number): FitSkill["evidence"] {
  return confidence >= TITLE_MATCH_CONFIDENCE ? "job title" : "job description";
}

/**
 * Returns null when there is nothing meaningful to compare (the posting has
 * no extracted skills, or the profile has none).
 */
export function computeSkillFit(
  jobSkills: JobSkillInput[],
  profileSkillKeys: string[],
): SkillFit | null {
  if (jobSkills.length === 0 || profileSkillKeys.length === 0) return null;

  const owned = new Set(profileSkillKeys);
  const seen = new Set<string>();
  const ordered = [...jobSkills]
    .sort(
      (a, b) => b.confidence - a.confidence || a.label.localeCompare(b.label),
    )
    .filter((skill) => {
      if (seen.has(skill.key)) return false;
      seen.add(skill.key);
      return true;
    })
    .map<FitSkill>((skill) => ({
      key: skill.key,
      label: skill.label,
      evidence: evidenceFor(skill.confidence),
    }));

  const matched = ordered.filter((skill) => owned.has(skill.key));
  const missingAll = ordered.filter((skill) => !owned.has(skill.key));

  return {
    matched,
    missing: missingAll.slice(0, MAX_MISSING_SHOWN),
    missingTotal: missingAll.length,
    leadWith: matched.slice(0, MAX_LEAD_WITH),
    statedTotal: ordered.length,
  };
}
