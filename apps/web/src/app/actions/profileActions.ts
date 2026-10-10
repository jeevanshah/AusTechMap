"use server";

import type { CandidateProfile } from "@austechmap/contracts";
import {
  ProfileAlertFrequencySchema,
  SaveCandidateProfileInputSchema,
} from "@austechmap/contracts";
import { revalidatePath } from "next/cache";

import { UnauthenticatedError } from "../../lib/auth/errors";
import { requireUser } from "../../lib/auth/require-role";
import { getPool } from "../../lib/db";
import {
  deleteCandidateProfile,
  setProfileAlertFrequency,
  upsertCandidateProfile,
} from "../../lib/queries/candidateProfiles";
import { listActiveSkills, listRoleFamilies } from "../../lib/queries/taxonomy";

// The resume itself is read in the browser (lib/profile/extractSuggestion.ts)
// and never reaches these actions: the only thing sent here is the structured
// profile the user reviewed and confirmed.

// Never pass an arbitrary Error.message back to the client: it could be raw
// database text. Only the error's name is logged.
function actionError(action: string, error: unknown, fallback: string): string {
  console.error(
    `${action} failed:`,
    error instanceof Error ? error.name : "unknown error",
  );
  return error instanceof UnauthenticatedError
    ? "Please sign in to continue."
    : fallback;
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type SaveProfileResult =
  | { success: true; profile: CandidateProfile }
  | { success: false; error: string };

export async function saveCandidateProfileAction(
  rawInput: unknown,
): Promise<SaveProfileResult> {
  try {
    const actor = await requireUser();

    // A Server Action is a public endpoint: validate the argument rather than
    // trusting the TypeScript signature the review panel calls it with.
    const parsed = SaveCandidateProfileInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return {
        success: false,
        error:
          "Some of those details aren't valid. Please check them and try again.",
      };
    }
    const input = parsed.data;

    // Defence in depth: only keys that exist in the taxonomy are stored.
    const pool = getPool();
    const [roleFamilies, skills] = await Promise.all([
      listRoleFamilies(pool),
      listActiveSkills(pool),
    ]);
    const validSkillKeys = new Set(skills.map((skill) => skill.key));
    const sanitizedRoleFamilyKey = roleFamilies.some(
      (family) => family.key === input.roleFamilyKey,
    )
      ? input.roleFamilyKey
      : null;

    const profile = await upsertCandidateProfile(pool, actor.id, {
      ...input,
      roleFamilyKey: sanitizedRoleFamilyKey,
      skillKeys: Array.from(new Set(input.skillKeys)).filter((key) =>
        validSkillKeys.has(key),
      ),
      locations: dedupe(input.locations),
    });

    revalidatePath("/account");
    return { success: true, profile };
  } catch (error) {
    return {
      success: false,
      error: actionError(
        "saveCandidateProfileAction",
        error,
        "Failed to save your profile.",
      ),
    };
  }
}

export async function deleteCandidateProfileAction(): Promise<{
  success: boolean;
  error?: string;
}> {
  try {
    const actor = await requireUser();
    await deleteCandidateProfile(getPool(), actor.id);
    revalidatePath("/account");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: actionError(
        "deleteCandidateProfileAction",
        error,
        "Failed to delete your profile.",
      ),
    };
  }
}

/**
 * Opt in or out of alerts for new roles matching the saved profile. Explicit,
 * per-user, off by default; email delivery additionally respects unsubscribe.
 */
export async function setProfileAlertFrequencyAction(
  rawFrequency: unknown,
): Promise<{ success: boolean; error?: string }> {
  try {
    const actor = await requireUser();
    const parsed = ProfileAlertFrequencySchema.safeParse(rawFrequency);
    if (!parsed.success) {
      return { success: false, error: "Choose never, daily or instant." };
    }
    const updated = await setProfileAlertFrequency(
      getPool(),
      actor.id,
      parsed.data,
    );
    if (!updated) {
      return {
        success: false,
        error: "Save your profile before turning on alerts.",
      };
    }
    revalidatePath("/account");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: actionError(
        "setProfileAlertFrequencyAction",
        error,
        "Failed to update profile alerts.",
      ),
    };
  }
}
