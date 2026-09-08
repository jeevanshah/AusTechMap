import type { ReactNode } from "react";
import Link from "next/link";
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
      <div className="flex items-center justify-between border-b border-emerald-950/15 bg-slate-50 px-6 py-2 text-xs text-slate-600">
        <div className="flex items-center gap-4 font-mono">
          <span className="font-bold text-slate-900 uppercase">Staff</span>
          <Link href="/admin/companies" className="hover:text-slate-900 transition-colors">Companies</Link>
          <Link href="/admin/review" className="hover:text-slate-900 transition-colors">Review</Link>
          <Link href="/admin/geography" className="hover:text-slate-900 transition-colors">Geography</Link>
          <Link href="/admin/monitoring" className="text-emerald-800 font-semibold hover:underline">Monitoring</Link>
        </div>
        <div>
          Signed in as {actor.email} ({actor.role})
        </div>
      </div>
      {children}
    </div>
  );
}
