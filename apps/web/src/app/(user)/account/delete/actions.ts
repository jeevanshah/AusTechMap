"use server";

import { redirect } from "next/navigation";

import { signIn } from "../../../../auth";
import { requireUser } from "../../../../lib/auth/require-role";
import { getPool } from "../../../../lib/db";
import { emailDigest } from "../../../../lib/deletion/erasure";
import { startAccountDeletionRequest } from "../../../../lib/deletion/pipeline";

/** §4.1 step 1: start deletion, then confirm with a fresh magic link. */
export async function requestAccountDeletion(): Promise<void> {
  const actor = await requireUser();
  const pool = getPool();

  await startAccountDeletionRequest(
    pool,
    actor.id,
    emailDigest(actor.email.toLowerCase()),
  );
  await signIn("resend", {
    email: actor.email,
    redirect: false,
    callbackUrl: "/account/delete/confirm",
  });

  redirect("/verify-request");
}
