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

const MFA_ATTEMPT_LIMIT = 5;
const MFA_WINDOW_SECONDS = 15 * 60;
const MFA_LOCK_SECONDS = 15 * 60;

function looksLikeRecoveryCode(token: string): boolean {
  return token.includes("-");
}

export async function verifyMfaCode(formData: FormData): Promise<void> {
  const actor = await requireRole("reviewer");
  const token = String(formData.get("token") ?? "").trim();
  const pool = getPool();

  const rateLimit = await checkRateLimit(pool, {
    scope: "mfa_attempt",
    key: String(actor.id),
    limit: MFA_ATTEMPT_LIMIT,
    windowSeconds: MFA_WINDOW_SECONDS,
    lockSeconds: MFA_LOCK_SECONDS,
  });
  if (!rateLimit.allowed) {
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
