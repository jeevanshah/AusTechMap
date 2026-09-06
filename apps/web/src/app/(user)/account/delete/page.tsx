import { requireUser } from "../../../../lib/auth/require-role";
import { requestAccountDeletion } from "./actions";

export const dynamic = "force-dynamic";

export default async function DeleteAccountPage() {
  await requireUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-8">
      <header className="border-b border-emerald-950/15 pb-5">
        <span className="text-sm font-semibold tracking-[0.18em] uppercase">
          Delete account
        </span>
      </header>
      <p className="text-sm text-slate-600">
        This starts account deletion. You&apos;ll get a one-time email link to
        confirm -- clicking it signs you out and queues permanent deletion,
        completed within 24 hours.
      </p>
      <form action={requestAccountDeletion}>
        <button
          type="submit"
          className="rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white"
        >
          Send confirmation link
        </button>
      </form>
    </main>
  );
}
