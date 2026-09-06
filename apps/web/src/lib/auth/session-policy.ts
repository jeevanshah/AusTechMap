/**
 * ARCHITECTURE_DECISIONS.md §4.1's session/MFA numbers, named in one place
 * rather than scattered as magic numbers across the auth module.
 */

export const USER_SESSION_MAX_AGE_S = 30 * 24 * 60 * 60; // 30 days
export const STAFF_SESSION_MAX_AGE_S = 8 * 60 * 60; // 8 hours
export const SESSION_UPDATE_AGE_S = 24 * 60 * 60; // rotate at least daily
export const MFA_FRESH_WINDOW_S = 15 * 60; // destructive ops re-prompt after 15 min

export const STAFF_ROLES = ["reviewer", "admin"] as const;

export function isStaffRole(role: string): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role);
}

export function sessionMaxAgeForRole(role: string): number {
  return isStaffRole(role) ? STAFF_SESSION_MAX_AGE_S : USER_SESSION_MAX_AGE_S;
}
