import { redirect } from "next/navigation";

import { UnauthenticatedError } from "./errors";
import { requireRole, type VerifiedActor } from "./require-role";

/**
 * Page-level role check with a browser-safe anonymous outcome. Server actions
 * continue to call requireRole/requireStaffSession directly so this redirect
 * is never treated as the authorisation boundary.
 */
export async function requirePageRole(minRole: string): Promise<VerifiedActor> {
  try {
    return await requireRole(minRole);
  } catch (error) {
    if (error instanceof UnauthenticatedError) {
      redirect("/sign-in");
    }
    throw error;
  }
}
