/**
 * Does a newly found role match a user's confirmed candidate profile?
 *
 * A job-level predicate for alerts. Deliberately conservative: an alert is an
 * interruption, so it requires a real signal (the profile's role family, or a
 * skill in common) and only excludes on information the job actually states.
 * Unknown job fields (no seniority, no location, no skills) never exclude a
 * role on their own.
 *
 * Seniority uses an explicit mapping from the job vocabulary
 * (junior/mid/senior/staff_principal/management) to the profile's experience
 * bands (entry/mid/senior/lead_principal). The roles surfaced are the user's
 * own band and the one above it: nobody wants alerts for a step down.
 */

export interface JobForMatch {
  roleFamilyKey: string | null;
  seniority: string | null;
  remoteType: string | null;
  locationText: string | null;
  skillKeys: string[];
}

export interface ProfileForMatch {
  roleFamilyKey: string | null;
  experienceBand: string;
  skillKeys: string[];
  workStyle: string;
  workStyleRequired: boolean;
  locations: string[];
}

const BAND_ORDER = ["entry", "mid", "senior", "lead_principal"] as const;

const JOB_SENIORITY_TO_BAND: Record<string, (typeof BAND_ORDER)[number]> = {
  junior: "entry",
  mid: "mid",
  senior: "senior",
  staff_principal: "lead_principal",
  management: "lead_principal",
};

function seniorityMatches(
  profileBand: string,
  jobSeniority: string | null,
): boolean {
  const profileIndex = BAND_ORDER.indexOf(
    profileBand as (typeof BAND_ORDER)[number],
  );
  if (profileIndex === -1) return true; // 'any'
  const jobBand = jobSeniority
    ? JOB_SENIORITY_TO_BAND[jobSeniority]
    : undefined;
  if (!jobBand) return true; // unknown seniority never excludes
  const jobIndex = BAND_ORDER.indexOf(jobBand);
  return jobIndex === profileIndex || jobIndex === profileIndex + 1;
}

function workStyleMatches(
  profile: ProfileForMatch,
  remoteType: string | null,
): boolean {
  if (!profile.workStyleRequired || profile.workStyle === "any") return true;
  return remoteType === profile.workStyle || remoteType === "flexible_mixed";
}

function locationMatches(profile: ProfileForMatch, job: JobForMatch): boolean {
  if (profile.locations.length === 0) return true;
  if (job.remoteType === "remote") return true;
  if (!job.locationText) return true; // unstated location never excludes
  const where = job.locationText.toLowerCase();
  return profile.locations.some((location) => {
    const wanted = location.trim().toLowerCase();
    return wanted.length > 0 && where.includes(wanted);
  });
}

export function jobMatchesProfile(
  job: JobForMatch,
  profile: ProfileForMatch,
): boolean {
  const profileSkills = new Set(profile.skillKeys);
  const sharedSkill = job.skillKeys.some((key) => profileSkills.has(key));

  // Require a real signal; a profile with neither role nor skills matches nothing.
  if (!profile.roleFamilyKey && profileSkills.size === 0) return false;

  if (profile.roleFamilyKey) {
    if (job.roleFamilyKey !== profile.roleFamilyKey) return false;
    // Role matches; if both sides name skills they must overlap.
    if (profileSkills.size > 0 && job.skillKeys.length > 0 && !sharedSkill) {
      return false;
    }
  } else if (!sharedSkill) {
    return false;
  }

  return (
    seniorityMatches(profile.experienceBand, job.seniority) &&
    workStyleMatches(profile, job.remoteType) &&
    locationMatches(profile, job)
  );
}
