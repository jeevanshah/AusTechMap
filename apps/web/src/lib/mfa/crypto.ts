import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";

/**
 * AES-256-GCM encryption for TOTP seeds, keyed by a versioned Vercel
 * *sensitive* environment variable -- never a plain env var for this one:
 * Vercel's April 2026 breach exposed non-sensitive env vars; sensitive
 * ones were unaffected (ARCHITECTURE_DECISIONS.md §4.1). Rotation = add
 * MFA_ENCRYPTION_KEY_V<n+1>, backfill re-encrypt existing rows, retire the
 * old var -- staff_mfa_credentials.encryption_key_version records which
 * key encrypted each row so old rows keep decrypting during rotation.
 */
const CURRENT_KEY_VERSION = Number(
  process.env.MFA_ENCRYPTION_CURRENT_VERSION ?? "1",
);

function keyForVersion(version: number): Buffer {
  const raw = process.env[`MFA_ENCRYPTION_KEY_V${version}`];
  if (!raw) {
    throw new Error(`no MFA_ENCRYPTION_KEY_V${version} configured`);
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `MFA_ENCRYPTION_KEY_V${version} must decode to 32 bytes (AES-256)`,
    );
  }
  return key;
}

export interface EncryptedSecret {
  ciphertext: Buffer;
  keyVersion: number;
}

export function encryptTotpSecret(plaintext: Buffer): EncryptedSecret {
  const key = keyForVersion(CURRENT_KEY_VERSION);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    // iv (12) || authTag (16) || ciphertext
    ciphertext: Buffer.concat([iv, authTag, encrypted]),
    keyVersion: CURRENT_KEY_VERSION,
  };
}

export function decryptTotpSecret(encrypted: EncryptedSecret): Buffer {
  const key = keyForVersion(encrypted.keyVersion);
  const iv = encrypted.ciphertext.subarray(0, 12);
  const authTag = encrypted.ciphertext.subarray(12, 28);
  const ciphertext = encrypted.ciphertext.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function sha256Digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}
