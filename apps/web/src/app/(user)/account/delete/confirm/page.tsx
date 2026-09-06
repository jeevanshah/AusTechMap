import { requireUser } from "../../../../../lib/auth/require-role";
import { getPool } from "../../../../../lib/db";
import { confirmAccountDeletion } from "./actions";

export const dynamic = "force-dynamic";

export default async function ConfirmDeleteAccountPage() {
  const actor = await requireUser();
  const pool = getPool();
  const row = await pool.query<{ id: string }>(
    `SELECT id FROM account_deletion_requests
     WHERE user_id = $1 AND status = 'pending_confirmation'
     ORDER BY requested_at DESC LIMIT 1`,
    [actor.id],
  );
  const requestId = row.rows[0]?.id;

  if (!requestId) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 py-8">
        <p className="text-sm">No pending deletion request found.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-8">
      <header className="border-b border-emerald-950/15 pb-5">
        <span className="text-sm font-semibold tracking-[0.18em] uppercase">
          Confirm deletion
        </span>
      </header>
      <p className="text-sm text-slate-600">
        This is final. Confirming signs you out immediately and permanently
        deletes your account within 24 hours.
      </p>
      <form action={confirmAccountDeletion.bind(null, requestId)}>
        <button
          type="submit"
          className="rounded-full bg-red-700 px-4 py-2 text-sm font-medium text-white"
        >
          Permanently delete my account
        </button>
      </form>
    </main>
  );
}
