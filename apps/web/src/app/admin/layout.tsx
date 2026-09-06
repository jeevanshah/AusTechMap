import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import {
  ForbiddenError,
  UnauthenticatedError,
  requireRole,
} from "../../lib/auth/require-role";
import { getPool } from "../../lib/db";

/**
 * Page-level gate for every current/future /admin/* page -- replaces the
 * old "Unauthenticated -- internal use only" badge with the real
 * signed-in user's identity. Per ARCHITECTURE_DECISIONS.md §4.1 and
 * proxy.ts's own comment, this is a convenience, not the sole control:
 * every mutating server action independently calls requireRole/
 * requireFreshMfa too.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  let actor;
  try {
    actor = await requireRole("reviewer");
  } catch (error) {
    if (error instanceof UnauthenticatedError) redirect("/sign-in");
    if (error instanceof ForbiddenError) {
      throw new Error(
        "Signed in, but this account does not have staff access.",
      );
    }
    throw error;
  }

  const mfaRow = await getPool().query<{ verified_at: Date | null }>(
    "SELECT verified_at FROM staff_mfa_credentials WHERE user_id = $1",
    [actor.id],
  );
  if (!mfaRow.rows[0]?.verified_at) {
    redirect("/mfa/enroll");
  }
  if (!actor.mfaVerifiedAt) {
    redirect("/mfa/verify");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="border-b border-emerald-950/15 bg-slate-50 px-4 py-2 text-xs text-slate-600">
        Signed in as {actor.email} ({actor.role})
      </div>
      {children}
    </div>
  );
}
