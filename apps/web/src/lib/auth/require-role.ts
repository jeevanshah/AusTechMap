import { cookies } from "next/headers";

import { auth } from "../../auth";
import { ForbiddenError, MfaStaleError, UnauthenticatedError } from "./errors";
import { MFA_FRESH_WINDOW_S } from "./session-policy";

export { ForbiddenError, MfaStaleError, UnauthenticatedError } from "./errors";

const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
];

/** The raw sessionToken for the current request's cookie, for code that must
 * update a specific `sessions` row (e.g. setting mfa_verified_at) rather
 * than go through the adapter's own session lifecycle. */
export async function currentSessionToken(): Promise<string | null> {
  const jar = await cookies();
  for (const name of SESSION_COOKIE_NAMES) {
    const value = jar.get(name)?.value;
    if (value) return value;
  }
  return null;
}

/**
 * ARCHITECTURE_DECISIONS.md §4.1: "Role and account status are read from
 * the database on every protected server request; client-visible session
 * fields are display hints, never an authorisation boundary." `auth()`
 * under the database strategy calls the adapter's getSessionAndUser fresh
 * on every invocation (no JWT to go stale), so this genuinely is a live DB
 * read, not a decoded token. "Protect both /admin pages and their APIs;
 * hiding navigation is not access control" -- every one of these must be
 * called from the actual page/server action/route handler, never assumed
 * satisfied by proxy.ts alone (see proxy.ts's own comment).
 */

const ROLE_RANK: Record<string, number> = { user: 0, reviewer: 1, admin: 2 };

export interface VerifiedActor {
  id: number;
  email: string;
  role: string;
  mfaVerifiedAt: Date | null;
}

async function currentActor(): Promise<VerifiedActor | null> {
  const session = await auth();
  const user = session?.user;
  if (!user?.id || !user.email) return null;
  const status = (user as { status?: string }).status;
  if (status === "disabled" || status === "deletion_pending") return null;
  return {
    id: Number(user.id),
    email: user.email,
    role: (user as { role?: string }).role ?? "user",
    mfaVerifiedAt: (user as { mfaVerifiedAt?: string | Date | null })
      .mfaVerifiedAt
      ? new Date((user as { mfaVerifiedAt: string | Date }).mfaVerifiedAt)
      : null,
  };
}

export async function requireUser(): Promise<VerifiedActor> {
  const actor = await currentActor();
  if (!actor) throw new UnauthenticatedError();
  return actor;
}

export async function requireRole(minRole: string): Promise<VerifiedActor> {
  const actor = await requireUser();
  const requiredRank = ROLE_RANK[minRole] ?? Infinity;
  const actualRank = ROLE_RANK[actor.role] ?? -1;
  if (actualRank < requiredRank) {
    throw new ForbiddenError(
      `requires role >= ${minRole}, actor has ${actor.role}`,
    );
  }
  return actor;
}

/**
 * §4.1: "MFA is mandatory for both reviewer and admin before any staff
 * route or API is usable." Staff access additionally requires
 * mfa_verified_at within the 8-hour session -- not just a role check.
 */
export async function requireStaffSession(
  minRole: "reviewer" | "admin" = "reviewer",
): Promise<VerifiedActor> {
  const actor = await requireRole(minRole);
  if (!actor.mfaVerifiedAt) {
    throw new ForbiddenError(
      "staff route requires MFA enrollment/verification",
    );
  }
  return actor;
}

/** Destructive operations re-prompt for MFA if the last verification is more than 15 minutes old. */
export async function requireFreshMfa(
  minRole: "reviewer" | "admin" = "admin",
): Promise<VerifiedActor> {
  const actor = await requireStaffSession(minRole);
  const ageSeconds = actor.mfaVerifiedAt
    ? (Date.now() - actor.mfaVerifiedAt.getTime()) / 1000
    : Infinity;
  if (ageSeconds > MFA_FRESH_WINDOW_S) {
    throw new MfaStaleError();
  }
  return actor;
}
