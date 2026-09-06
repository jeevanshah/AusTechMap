import { requireRole } from "../../../../lib/auth/require-role";
import { verifyMfaCode } from "./actions";

export const dynamic = "force-dynamic";

export default async function MfaVerifyPage() {
  await requireRole("reviewer");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-8">
      <header className="border-b border-emerald-950/15 pb-5">
        <span className="text-sm font-semibold tracking-[0.18em] uppercase">
          Verify MFA
        </span>
      </header>

      <form action={verifyMfaCode} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          6-digit code (or a recovery code)
          <input
            name="token"
            required
            className="rounded-lg border border-emerald-950/20 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="rounded-full bg-emerald-900 px-4 py-2 text-sm font-medium text-white"
        >
          Verify
        </button>
      </form>
    </main>
  );
}
