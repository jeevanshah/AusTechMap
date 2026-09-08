"use server";

import { redirect } from "next/navigation";

import { signIn } from "../../../../auth";
import { requireUser } from "../../../../lib/auth/require-role";
import { getPool } from "../../../../lib/db";
import { emailDigest } from "../../../../lib/deletion/erasure";
import { startAccountDeletionRequest } from "../../../../lib/deletion/pipeline";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { currentClientIp } from "../../../../lib/request-ip";

// Same rate-limit shape as the main sign-in flow (lib/auth/sign-in's
// requestMagicLink) -- this path sends a magic-link email too and was
// missing the same protection, letting a signed-in session spam the
// inbox with no limit.
const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;
const WINDOW_SECONDS = 15 * 60;
const LOCK_SECONDS = 15 * 60;

/** §4.1 step 1: start deletion, then confirm with a fresh magic link. */
export async function requestAccountDeletion(): Promise<void> {
  const actor = await requireUser();
  const pool = getPool();
  const ip = await currentClientIp();

  await startAccountDeletionRequest(
    pool,
    actor.id,
    emailDigest(actor.email.toLowerCase()),
  );

  const emailCheck = await checkRateLimit(pool, {
    scope: "magic_link_email",
    key: actor.email.toLowerCase(),
    limit: EMAIL_LIMIT,
    windowSeconds: WINDOW_SECONDS,
    lockSeconds: LOCK_SECONDS,
  });
  const ipCheck = await checkRateLimit(pool, {
    scope: "magic_link_ip",
    key: ip,
    limit: IP_LIMIT,
    windowSeconds: WINDOW_SECONDS,
    lockSeconds: LOCK_SECONDS,
  });
  if (emailCheck.allowed && ipCheck.allowed) {
    await signIn("resend", {
      email: actor.email,
      redirect: false,
      callbackUrl: "/account/delete/confirm",
    });
  }

  redirect("/verify-request");
}
