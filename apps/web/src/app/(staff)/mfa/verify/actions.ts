"use server";

import { Secret } from "otpauth";
import { redirect } from "next/navigation";

import {
  currentSessionToken,
  requireRole,
} from "../../../../lib/auth/require-role";
import { getPool } from "../../../../lib/db";
import { decryptTotpSecret } from "../../../../lib/mfa/crypto";
import { verifyAndConsumeRecoveryCode } from "../../../../lib/mfa/recovery-codes";
import { validateTotpToken } from "../../../../lib/mfa/totp";
import { checkRateLimit } from "../../../../lib/rate-limit";
import { currentClientIp } from "../../../../lib/request-ip";

// ARCHITECTURE_DECISIONS.md §4.1: "TOTP/recovery attempts are limited to
// five per account and IP per 15 minutes" -- both keys are checked at the
// same limit the ADR states, not just the account, so a stolen session
// cookie can't be brute-forced from an unlimited number of source IPs
// against a single account's cap alone.
const MFA_ATTEMPT_LIMIT = 5;
const MFA_IP_LIMIT = 5;
const MFA_WINDOW_SECONDS = 15 * 60;
const MFA_LOCK_SECONDS = 15 * 60;

function looksLikeRecoveryCode(token: string): boolean {
  return token.includes("-");
}

export async function verifyMfaCode(formData: FormData): Promise<void> {
  const actor = await requireRole("reviewer");
  const token = String(formData.get("token") ?? "").trim();
  const pool = getPool();
  const ip = await currentClientIp();

  const accountCheck = await checkRateLimit(pool, {
    scope: "mfa_attempt_account",
    key: String(actor.id),
    limit: MFA_ATTEMPT_LIMIT,
    windowSeconds: MFA_WINDOW_SECONDS,
    lockSeconds: MFA_LOCK_SECONDS,
  });
  const ipCheck = await checkRateLimit(pool, {
    scope: "mfa_attempt_ip",
    key: ip,
    limit: MFA_IP_LIMIT,
    windowSeconds: MFA_WINDOW_SECONDS,
    lockSeconds: MFA_LOCK_SECONDS,
  });
  if (!accountCheck.allowed || !ipCheck.allowed) {
    throw new Error("Too many attempts -- try again in 15 minutes");
  }

  let valid = false;
  if (looksLikeRecoveryCode(token)) {
    valid = await verifyAndConsumeRecoveryCode(pool, actor.id, token);
  } else {
    const row = await pool.query<{
      encrypted_secret: Buffer;
      encryption_key_version: number;
      last_accepted_step: number | null;
    }>(
      "SELECT encrypted_secret, encryption_key_version, last_accepted_step FROM staff_mfa_credentials WHERE user_id = $1 AND verified_at IS NOT NULL",
      [actor.id],
    );
    const credential = row.rows[0];
    if (credential) {
      const secretBase32 = decryptTotpSecret({
        ciphertext: credential.encrypted_secret,
        keyVersion: credential.encryption_key_version,
      }).toString("utf8");
      const result = validateTotpToken({
        token,
        secret: Secret.fromBase32(secretBase32),
        lastAcceptedStep: credential.last_accepted_step,
      });
      valid = result.valid;
      if (valid) {
        await pool.query(
          "UPDATE staff_mfa_credentials SET last_accepted_step = $2 WHERE user_id = $1",
          [actor.id, result.acceptedStep],
        );
      }
    }
  }

  if (!valid) {
    throw new Error("Invalid or already-used code");
  }

  const sessionToken = await currentSessionToken();
  if (sessionToken) {
    await pool.query(
      'UPDATE sessions SET mfa_verified_at = now() WHERE "sessionToken" = $1',
      [sessionToken],
    );
  }

  redirect("/admin/companies");
}
