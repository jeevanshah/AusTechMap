import type {
  OpportunityExperienceBand,
  OpportunityWorkStyle,
} from "@austechmap/contracts";

/**
 * Deterministic, rule-based classification for resume text (Applicant
 * Velocity P1). Pure functions, no DB/network access. The "never guess"
 * discipline is ported from the job-posting classifiers in
 * workers/ingestion/src/austechmap_ingestion/hiring/normalisation.py
 * (keyword lookup, unmatched -> null/"any") and the negation guard from
 * employers/sponsorship_keywords.py (a fixed 5-word lookback for a
 * negation word immediately before a match). No LLM call is involved.
 *
 * Deliberate differences from the Python originals, because a resume is a
 * multi-page document rather than a single job title:
 * - Boundaries use lookarounds instead of \b. \b cannot match a phrase that
 *   starts or ends with punctuation, so the Python matcher never finds
 *   "C#", ".NET" or "Sr.".
 * - Role family is scored across every family (distinct keywords matched)
 *   instead of first-match-wins; a tie or zero matches yields null.
 * - Seniority keywords are only read from the document header, where the
 *   candidate's current title sits ("senior" elsewhere in a resume usually
 *   describes someone else), and only title-shaped phrases count: a plain
 *   "Product Manager" or "Graduate Diploma" says nothing about level.
 * - Skill names that are also everyday English words only match in their
 *   canonical or ALL-CAPS form ("Go", "React"), not "go live" or "react to".
 */

export interface SkillCandidate {
  key: string;
  label: string;
  aliases: readonly string[];
}

export interface SkillMatch {
  key: string;
  label: string;
}

// Keys match role_families.key (PRODUCT_SPEC.md Appendix A.2). The first
// block per family mirrors normalisation.py's ROLE_FAMILY_KEYWORDS; entries
// after the "resume vocabulary" comment are additions for how people
// describe themselves on a resume rather than how employers title a job.
const ROLE_FAMILY_KEYWORDS: Record<string, readonly string[]> = {
  "software-engineering": [
    "software engineer",
    "frontend",
    "front-end",
    "front end",
    "backend",
    "back-end",
    "back end",
    "full stack",
    "fullstack",
    "mobile engineer",
    "ios engineer",
    "android engineer",
    "embedded",
    "staff engineer",
    "principal engineer",
    // resume vocabulary
    "full-stack",
    "software developer",
    "web developer",
    "application developer",
  ],
  data: [
    "data analyst",
    "analytics engineer",
    "data engineer",
    "data scientist",
    "data science",
    // resume vocabulary
    "business intelligence",
  ],
  "ai-ml": [
    "ml engineer",
    "machine learning",
    "ai engineer",
    "applied scientist",
    "mlops",
    "artificial intelligence",
  ],
  "cloud-platform": [
    "cloud engineer",
    "platform engineer",
    "devops",
    "site reliability",
    "sre",
  ],
  security: [
    "cybersecurity",
    "security engineer",
    "security analyst",
    "grc",
    "appsec",
    "application security",
    // resume vocabulary
    "information security",
    "penetration testing",
  ],
  quality: [
    "qa engineer",
    "quality assurance",
    "test automation",
    "performance test",
    "sdet",
    // resume vocabulary
    "test engineer",
    "qa analyst",
  ],
  "product-delivery": [
    "product manager",
    "technical business analyst",
    "business analyst",
    "delivery manager",
    "program manager",
    "scrum master",
    "product owner",
    // resume vocabulary
    "project manager",
  ],
  design: [
    "product designer",
    "ux research",
    "user research",
    "user experience",
    "ux/ui",
    // resume vocabulary
    "ux designer",
    "ui designer",
  ],
  architecture: [
    "solution architect",
    "enterprise architect",
    "data architect",
    "software architect",
  ],
  "it-infrastructure": [
    "systems administrator",
    "network engineer",
    "it support",
    "end user computing",
    "helpdesk",
    "service desk",
    "infrastructure engineer",
  ],
};

// Checked in this fixed order -- a header matching both "senior" and
// "director" classifies as management, the same documented policy as the
// Python original. "management"/"staff_principal" both map onto the
// OpportunityExperienceBand enum's "lead_principal" (there is no separate
// management band in that contract).
//
// Unlike the Python job-title list, bare "manager", "principal" and
// "graduate" are deliberately absent: "Product/Project Manager" is a job, not
// a seniority level, and "principal responsibilities" or "Graduate Diploma"
// say nothing about the candidate's own level. Only title-shaped phrases count.
const SENIORITY_KEYWORDS: Array<{
  band: OpportunityExperienceBand;
  keywords: readonly string[];
}> = [
  {
    band: "lead_principal",
    keywords: [
      "engineering manager",
      "development manager",
      "technical manager",
      "general manager",
      "director",
      "head of",
      "vp",
      "vice president",
      "chief",
      "cto",
      "cio",
    ],
  },
  {
    band: "lead_principal",
    keywords: [
      "staff engineer",
      "principal engineer",
      "principal developer",
      "principal architect",
      "principal consultant",
      "principal analyst",
      "principal scientist",
      "principal designer",
      "distinguished engineer",
    ],
  },
  { band: "senior", keywords: ["senior", "sr."] },
  {
    band: "entry",
    keywords: [
      "junior",
      "jr.",
      "new grad",
      "entry level",
      "graduate engineer",
      "graduate developer",
      "graduate software engineer",
      "graduate analyst",
      "graduate programmer",
      "intern",
      "internship",
    ],
  },
];

// Where a candidate's current title normally sits (name, contact line,
// title, then the start of the summary).
const HEADER_WINDOW_CHARS = 400;

const WORK_STYLE_KEYWORDS: Array<{
  style: OpportunityWorkStyle;
  keywords: readonly string[];
}> = [
  {
    style: "remote",
    keywords: ["seeking remote", "remote only", "open to remote"],
  },
  { style: "hybrid", keywords: ["open to hybrid", "hybrid preferred"] },
  {
    style: "onsite",
    keywords: ["on-site only", "onsite only", "office based"],
  },
];

// Skill names that are also everyday English words. Matched
// case-sensitively (canonical or ALL-CAPS only) so "go live", "react to an
// incident" or "guard rails" don't register as skills.
const AMBIGUOUS_SKILL_WORDS = new Set([
  "go",
  "swift",
  "rust",
  "ruby",
  "react",
  "spring",
  "rails",
  "node",
]);
// Capitalised uses that still aren't the skill. "SWIFT" is the bank payments
// network, so only the canonical "Swift" counts for that one.
const NO_ALL_CAPS_FORM = new Set(["swift"]);
// Extra lookahead appended to an ambiguous word's pattern: "Spring 2019" is a
// date and "Go-to-market"/"Go-live" are compounds, not the language or the
// framework.
const AMBIGUOUS_WORD_GUARDS: Record<string, string> = {
  spring: "(?!\\s+(?:19|20)\\d{2})",
  go: "(?!-)",
};

const NEGATION_WORDS = new Set([
  "not",
  "no",
  "cannot",
  "can't",
  "unable",
  "don't",
  "won't",
]);
const NEGATION_WINDOW_WORDS = 5;
// Five words fit comfortably in this many characters. Bounding the lookback
// keeps each check constant-cost; re-scanning all preceding text per match is
// quadratic on a long document where every mention is negated.
const NEGATION_LOOKBACK_CHARS = 120;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A match must not be glued to a letter, digit or underscore on either
// side. Unlike \b this still works for phrases that begin or end with
// punctuation ("C#", ".NET", "Sr.").
function tokenPattern(
  phrase: string,
  flags: string,
  extraLookahead = "",
): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}_])${escapeRegExp(phrase)}(?![\\p{L}\\p{N}_])${extraLookahead}`,
    `${flags}u`,
  );
}

function matchesAnyKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => tokenPattern(keyword, "i").test(text));
}

/** Ported from sponsorship_keywords.py's _is_negated: true if a negation
 * word appears among the five words immediately preceding the match. */
export function isNegated(text: string, matchStart: number): boolean {
  const windowStart = Math.max(0, matchStart - NEGATION_LOOKBACK_CHARS);
  const words = text.slice(windowStart, matchStart).match(/[A-Za-z'’]+/g) ?? [];
  // A window that starts mid-word yields a truncated first word ("not" from
  // "knot"); never let that fragment count as a negation.
  if (windowStart > 0 && /[A-Za-z'’]/.test(text.charAt(windowStart - 1))) {
    words.shift();
  }
  return words.slice(-NEGATION_WINDOW_WORDS).some((word) =>
    // PDFs and word processors usually emit curly apostrophes ("don’t").
    NEGATION_WORDS.has(word.toLowerCase().replaceAll("’", "'")),
  );
}

/** Scores every family by distinct-keyword match count (a resume isn't a
 * single job title, so first-match-wins isn't meaningful). A tie or zero
 * matches across all families yields null -- never a guessed default. */
export function classifyRoleFamily(resumeText: string): string | null {
  let bestKey: string | null = null;
  let bestCount = 0;
  let tie = false;

  for (const [familyKey, keywords] of Object.entries(ROLE_FAMILY_KEYWORDS)) {
    const count = keywords.filter((keyword) =>
      tokenPattern(keyword, "i").test(resumeText),
    ).length;
    if (count === 0) continue;
    if (count > bestCount) {
      bestKey = familyKey;
      bestCount = count;
      tie = false;
    } else if (count === bestCount) {
      tie = true;
    }
  }

  if (bestCount === 0 || tie) return null;
  return bestKey;
}

const MONTH_NAME =
  "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
// Optional "Jan " / "January " / "01/" prefix in front of a year.
const DATE_PREFIX = `(?:${MONTH_NAME}\\.?\\s+|\\d{1,2}[/.-])?`;
const YEAR = "((?:19|20)\\d{2})";
const YEAR_RANGE_PATTERN = new RegExp(
  `(?<!\\d)${DATE_PREFIX}${YEAR}\\s*(?:-|–|—|to)\\s*(?:${DATE_PREFIX}${YEAR}|(present|current|now|ongoing|today))(?!\\d)`,
  "gi",
);

const EDUCATION_HEADING =
  /^(education|qualifications?|academic (background|qualifications?)|education (and|&) (training|qualifications?))$/i;
// Headings that end an Education section. Not exhaustive: an unrecognised
// heading after Education keeps suppressing dates until a known one appears,
// which errs towards "no suggestion" rather than counting degree years.
const OTHER_HEADING =
  /^(summary|professional summary|career summary|profile|personal statement|about me|objective|experience|work experience|professional experience|relevant (work )?experience|employment( experience| history)?|work history|career history|career|professional (background|history)|positions held|technical experience|skills|technical skills|key skills|core skills|technical expertise|areas of expertise|core competencies|projects|key projects|selected projects|certifications?|training|professional development|achievements|key achievements|awards|references|interests|languages|publications|volunteer(ing)?( experience)?)$/i;
// "master" alone is deliberately absent -- it would swallow "Scrum Master".
const EDUCATION_LINE =
  /\b(universit\w*|college|bachelor\w*|masters|master['’]s|master of|degree|diploma|tafe|high school|phd|doctorate|honours|b\.?sc|m\.?sc|b\.?eng|b\.?tech|mba)\b/i;

function headingText(line: string): string {
  return line.trim().replace(/:$/, "");
}

/** Best-effort years of experience from "YYYY - YYYY"/"Jan 2020 - Present"
 * style ranges. Ranges on education lines or inside an Education section
 * are ignored (a degree's dates aren't experience), and overlapping
 * ranges are merged so concurrent jobs aren't double-counted. */
function estimateYearsOfExperience(
  resumeText: string,
  now: Date,
): number | null {
  const currentYear = now.getFullYear();
  const intervals: Array<[number, number]> = [];
  let inEducationSection = false;

  for (const line of resumeText.split(/\r?\n/)) {
    const heading = headingText(line);
    if (EDUCATION_HEADING.test(heading)) {
      inEducationSection = true;
      continue;
    }
    if (OTHER_HEADING.test(heading)) {
      inEducationSection = false;
      continue;
    }
    if (inEducationSection || EDUCATION_LINE.test(line)) continue;

    for (const match of line.matchAll(YEAR_RANGE_PATTERN)) {
      const start = Number(match[1]);
      const end = match[3] ? currentYear : Number(match[2]);
      if (start >= 1970 && end >= start && end <= currentYear) {
        intervals.push([start, end]);
      }
    }
  }

  if (intervals.length === 0) return null;

  intervals.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [currentStart, currentEnd] = intervals[0]!;
  for (const [start, end] of intervals.slice(1)) {
    if (start <= currentEnd) {
      currentEnd = Math.max(currentEnd, end);
    } else {
      total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    }
  }
  total += currentEnd - currentStart;
  return total;
}

// Years alone can't distinguish a senior individual contributor from a
// lead or principal, so they never suggest lead_principal -- only an
// explicit title keyword does.
function bandFromYears(years: number): OpportunityExperienceBand {
  if (years < 2) return "entry";
  if (years < 5) return "mid";
  return "senior";
}

/** Order of evidence: (1) a seniority keyword in the document header, same
 * fixed order as the Python original; (2) a years-of-experience estimate
 * from dated ranges; (3) "any" (unset) -- never guessed. */
export function classifyExperienceBand(
  resumeText: string,
  now: Date = new Date(),
): OpportunityExperienceBand {
  const header = resumeText.slice(0, HEADER_WINDOW_CHARS);
  for (const { band, keywords } of SENIORITY_KEYWORDS) {
    if (matchesAnyKeyword(header, keywords)) return band;
  }
  const years = estimateYearsOfExperience(resumeText, now);
  if (years !== null) return bandFromYears(years);
  return "any";
}

function capitalise(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function skillPatterns(skill: SkillCandidate): RegExp[] {
  const candidates = new Set<string>([skill.label, ...skill.aliases]);
  // Only multi-word keys add anything ("github_actions" -> "github
  // actions"); a single-word key would just re-add a lowercase form of the
  // label and defeat the case rule for ambiguous words.
  const keyPhrase = skill.key.replaceAll("_", " ");
  if (keyPhrase.includes(" ")) candidates.add(keyPhrase);

  const patterns: RegExp[] = [];
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    if (AMBIGUOUS_SKILL_WORDS.has(lower)) {
      const forms = new Set([capitalise(candidate)]);
      if (!NO_ALL_CAPS_FORM.has(lower)) forms.add(candidate.toUpperCase());
      for (const form of forms) {
        patterns.push(tokenPattern(form, "g", AMBIGUOUS_WORD_GUARDS[lower]));
      }
    } else {
      patterns.push(tokenPattern(candidate, "gi"));
    }
  }
  return patterns;
}

/** Token-boundary match against each skill's label/aliases, filtered by the
 * negation guard. Deduplicated by key. */
export function extractSkillMatches(
  resumeText: string,
  skills: readonly SkillCandidate[],
): SkillMatch[] {
  const matches: SkillMatch[] = [];
  for (const skill of skills) {
    const found = skillPatterns(skill).some((pattern) =>
      Array.from(resumeText.matchAll(pattern)).some(
        (match) => !isNegated(resumeText, match.index),
      ),
    );
    if (found) matches.push({ key: skill.key, label: skill.label });
  }
  return matches;
}

/** Resumes rarely state an explicit remote/hybrid/onsite preference;
 * keyword-scan for explicit phrases only, else "any" + not required. */
export function classifyWorkStyle(resumeText: string): {
  workStyle: OpportunityWorkStyle;
  workStyleRequired: boolean;
} {
  for (const { style, keywords } of WORK_STYLE_KEYWORDS) {
    for (const keyword of keywords) {
      const found = Array.from(
        resumeText.matchAll(tokenPattern(keyword, "gi")),
      ).some((match) => !isNegated(resumeText, match.index));
      if (found) return { workStyle: style, workStyleRequired: false };
    }
  }
  return { workStyle: "any", workStyleRequired: false };
}
