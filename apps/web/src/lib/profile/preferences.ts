import type {
  CandidateProfile,
  CandidateProfileSuggestion,
  OpportunityMatchPreferences,
} from "@austechmap/contracts";

/**
 * A new CV replaces the saved skills, but it can't see everything a profile
 * holds. Where the CV gave no signal (no role or experience detected, no
 * stated work style) the saved value is kept, so re-uploading never silently
 * wipes something the user set earlier. Locations are never read from a CV and
 * are carried separately (ResumeReviewPanel's `initialLocations`).
 */
export function mergeSuggestionWithProfile(
  suggestion: CandidateProfileSuggestion,
  profile: CandidateProfile,
): CandidateProfileSuggestion {
  const detectedWorkStyle = suggestion.workStyle !== "any";
  return {
    roleFamilyKey: suggestion.roleFamilyKey ?? profile.roleFamilyKey,
    roleFamilyLabel: suggestion.roleFamilyKey
      ? suggestion.roleFamilyLabel
      : profile.roleFamilyLabel,
    experienceBand:
      suggestion.experienceBand !== "any"
        ? suggestion.experienceBand
        : profile.experienceBand,
    skills: suggestion.skills,
    workStyle: detectedWorkStyle ? suggestion.workStyle : profile.workStyle,
    workStyleRequired: detectedWorkStyle
      ? suggestion.workStyleRequired
      : profile.workStyleRequired,
  };
}

/**
 * A saved profile holds the user's own confirmed choices, so it replaces the
 * matching preference fields outright: an unset role stays unset and an empty
 * skills or locations list stays empty, rather than falling back to the
 * /opportunities demo defaults. Toggles the profile doesn't carry
 * (sponsorship, regional, location strictness, result limit) are kept from
 * `base`.
 */
export function applyCandidateProfile(
  base: OpportunityMatchPreferences,
  profile: CandidateProfile,
): OpportunityMatchPreferences {
  return {
    ...base,
    roleFamily: profile.roleFamilyKey ?? undefined,
    skills: profile.skills.map((skill) => skill.label),
    experienceBand: profile.experienceBand,
    locations: profile.locations,
    workStyle: profile.workStyle,
    workStyleRequired: profile.workStyleRequired,
  };
}
