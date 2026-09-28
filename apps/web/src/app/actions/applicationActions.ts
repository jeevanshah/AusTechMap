"use server";

import type {
  JobApplication,
  JobApplicationStatus,
} from "@austechmap/contracts";
import { JobApplicationStatusSchema } from "@austechmap/contracts";
import { revalidatePath } from "next/cache";

import { requireUser } from "../../lib/auth/require-role";
import { getPool } from "../../lib/db";
import {
  deleteJobApplication,
  saveJobApplication,
  updateJobApplicationNotes,
  updateJobApplicationStatus,
} from "../../lib/queries/jobApplications";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseUuid(value: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error("Invalid identifier");
  return value;
}

type ApplicationActionResult = {
  success: boolean;
  application?: JobApplication;
  error?: string;
};

function actionError(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export async function saveJobApplicationAction(
  rawJobId: string,
): Promise<ApplicationActionResult> {
  try {
    const jobId = parseUuid(rawJobId);
    const actor = await requireUser();
    const application = await saveJobApplication(getPool(), actor.id, jobId);
    revalidatePath("/jobs");
    revalidatePath("/account");
    return { success: true, application };
  } catch (error) {
    return {
      success: false,
      error: actionError(error, "Failed to save this job"),
    };
  }
}

export async function updateJobApplicationStatusAction(
  rawApplicationId: string,
  rawStatus: JobApplicationStatus,
): Promise<ApplicationActionResult> {
  try {
    const applicationId = parseUuid(rawApplicationId);
    const status = JobApplicationStatusSchema.parse(rawStatus);
    const actor = await requireUser();
    const application = await updateJobApplicationStatus(
      getPool(),
      actor.id,
      applicationId,
      status,
    );
    if (!application) return { success: false, error: "Application not found" };
    revalidatePath("/account");
    return { success: true, application };
  } catch (error) {
    return {
      success: false,
      error: actionError(error, "Failed to update application status"),
    };
  }
}

export async function updateJobApplicationNotesAction(
  rawApplicationId: string,
  rawNotes: string,
): Promise<ApplicationActionResult> {
  try {
    const applicationId = parseUuid(rawApplicationId);
    const actor = await requireUser();
    const application = await updateJobApplicationNotes(
      getPool(),
      actor.id,
      applicationId,
      rawNotes,
    );
    if (!application) return { success: false, error: "Application not found" };
    revalidatePath("/account");
    return { success: true, application };
  } catch (error) {
    return {
      success: false,
      error: actionError(error, "Failed to update application notes"),
    };
  }
}

export async function deleteJobApplicationAction(
  rawApplicationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const applicationId = parseUuid(rawApplicationId);
    const actor = await requireUser();
    const deleted = await deleteJobApplication(
      getPool(),
      actor.id,
      applicationId,
    );
    if (!deleted) return { success: false, error: "Application not found" };
    revalidatePath("/jobs");
    revalidatePath("/account");
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: actionError(error, "Failed to remove application"),
    };
  }
}
