import { requireRole } from "../../../../lib/auth/require-role";
import { getPool } from "../../../../lib/db";
import { encryptTotpSecret, EncryptedSecret } from "../../../../lib/mfa/crypto";
import { generateRecoveryCodes } from "../../../../lib/mfa/recovery-codes";
import {
  generateTotpSecret,
  totpProvisioningUri,
} from "../../../../lib/mfa/totp";
import { confirmEnrollment } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Every unconfirmed page load regenerates the pending secret/recovery
 * codes and overwrites the prior pending row -- nothing is usable until
 * `verified_at` is set below, so re-generating before confirmation is
 * safe and avoids a "lost the secret on refresh" dead end. Once verified,
 * this page never regenerates or re-displays the secret again.
 */
async function ensurePendingEnrollment(
  userId: number,
  email: string,
): Promise<
  | { alreadyEnrolled: true }
  | {
      alreadyEnrolled: false;
      secretBase32: string;
      otpauthUri: string;
      recoveryCodes: string[];
    }
> {
  const pool = getPool();
  const existing = await pool.query<{ verified_at: Date | null }>(
    "SELECT verified_at FROM staff_mfa_credentials WHERE user_id = $1",
    [userId],
  );
  if (existing.rows[0]?.verified_at) {
    return { alreadyEnrolled: true };
  }

  const secret = generateTotpSecret();
  const otpauthUri = totpProvisioningUri({ secret, accountEmail: email });
  const encrypted: EncryptedSecret = encryptTotpSecret(
    Buffer.from(secret.base32, "utf8"),
  );

  await pool.query(
    `INSERT INTO staff_mfa_credentials (user_id, encrypted_secret, encryption_key_version, last_accepted_step, verified_at)
     VALUES ($1, $2, $3, NULL, NULL)
     ON CONFLICT (user_id) DO UPDATE
       SET encrypted_secret = $2, encryption_key_version = $3, last_accepted_step = NULL, verified_at = NULL`,
    [userId, encrypted.ciphertext, encrypted.keyVersion],
  );
  const recoveryCodes = await generateRecoveryCodes(pool, userId);

  return {
    alreadyEnrolled: false,
    secretBase32: secret.base32,
    otpauthUri,
    recoveryCodes,
  };
}

export default async function MfaEnrollPage() {
  const actor = await requireRole("reviewer");
  const state = await ensurePendingEnrollment(actor.id, actor.email);

  if (state.alreadyEnrolled) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-8">
        <p className="text-sm">MFA is already enrolled on this account.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-8">
      <header className="border-b border-emerald-950/15 pb-5">
        <span className="text-sm font-semibold tracking-[0.18em] uppercase">
          Enroll MFA
        </span>
      </header>

      <section className="flex flex-col gap-2 text-sm">
        <p>Scan or manually enter this in your authenticator app:</p>
        <code className="break-all rounded bg-slate-100 p-2 text-xs">
          {state.otpauthUri}
        </code>
        <p className="text-slate-600">Secret: {state.secretBase32}</p>
      </section>

      <section className="flex flex-col gap-2 text-sm">
        <p className="font-medium">
          Recovery codes -- save these now, they will not be shown again:
        </p>
        <ul className="rounded bg-slate-100 p-2 font-mono text-xs">
          {state.recoveryCodes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      </section>

      <form action={confirmEnrollment} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Enter the 6-digit code from your authenticator app
          <input
            name="token"
            required
            pattern="[0-9]{6}"
            className="rounded-lg border border-emerald-950/20 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-emerald-900 px-4 py-2 text-sm font-medium text-white"
        >
          Confirm enrollment
        </button>
      </form>
    </main>
  );
}
