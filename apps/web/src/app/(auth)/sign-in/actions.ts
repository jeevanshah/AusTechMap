"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { signIn } from "../../../auth";
import { getPool } from "../../../lib/db";
import { checkRateLimit } from "../../../lib/rate-limit";

const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;
const WINDOW_SECONDS = 15 * 60;
const LOCK_SECONDS = 15 * 60;

function normaliseEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * §4.1: "Return the same response whether an account exists, and
 * rate-limit requests per normalised email and IP." Auth.js's email
 * provider already never reveals account existence (it always redirects
 * to the verify-request page); the rate limiting is this project's own
 * addition, since Auth.js has no built-in concept of it.
 */
export async function requestMagicLink(formData: FormData): Promise<void> {
  const email = normaliseEmail(String(formData.get("email") ?? ""));
  if (!email) throw new Error("Email is required");

  const pool = getPool();
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  const emailCheck = await checkRateLimit(pool, {
    scope: "magic_link_email",
    key: email,
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
    await signIn("resend", { email, redirect: false });
  }
  // Same redirect regardless of the real outcome -- no account-existence
  // or rate-limit-state signal leaks to the caller.
  redirect("/verify-request");
}
