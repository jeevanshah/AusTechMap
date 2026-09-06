import { randomBytes } from "node:crypto";
import type { Pool } from "pg";

import { sha256Digest } from "./crypto";

const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 16; // 128 bits

function formatCode(bytes: Buffer): string {
  const hex = bytes.toString("hex");
  return (hex.match(/.{1,4}/g) ?? [hex]).join("-");
}

/** Generates 10 single-use recovery codes (shown once) and stores only their SHA-256 digests. */
export async function generateRecoveryCodes(
  pool: Pool,
  userId: number,
): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, () =>
    formatCode(randomBytes(RECOVERY_CODE_BYTES)),
  );
  await pool.query("DELETE FROM staff_mfa_recovery_codes WHERE user_id = $1", [
    userId,
  ]);
  for (const code of codes) {
    await pool.query(
      "INSERT INTO staff_mfa_recovery_codes (user_id, code_digest) VALUES ($1, $2)",
      [userId, sha256Digest(code)],
    );
  }
  return codes;
}

/** Verifies and consumes a recovery code; returns false if it's unknown or already used. */
export async function verifyAndConsumeRecoveryCode(
  pool: Pool,
  userId: number,
  code: string,
): Promise<boolean> {
  const result = await pool.query(
    `UPDATE staff_mfa_recovery_codes
     SET used_at = now()
     WHERE user_id = $1 AND code_digest = $2 AND used_at IS NULL`,
    [userId, sha256Digest(code)],
  );
  return (result.rowCount ?? 0) > 0;
}
