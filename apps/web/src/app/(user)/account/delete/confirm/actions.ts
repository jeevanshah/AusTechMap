"use server";

import { redirect } from "next/navigation";

import { requireUser } from "../../../../../lib/auth/require-role";
import { getPool } from "../../../../../lib/db";
import { confirmAccountDeletionRequest } from "../../../../../lib/deletion/pipeline";

export async function confirmAccountDeletion(requestId: string): Promise<void> {
  const actor = await requireUser();
  await confirmAccountDeletionRequest(getPool(), requestId, actor.id);
  redirect("/account/delete/done");
}
