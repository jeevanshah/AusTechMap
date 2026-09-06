import { DatabaseNotConfiguredError, getPool } from "../../../lib/db";
import {
  approveReviewItem,
  approveSponsorshipMatch,
  rejectReviewItem,
} from "./actions";

export const dynamic = "force-dynamic";

interface ReviewItemRow {
  id: string;
  kind: string;
  reason: string | null;
  payload: {
    candidate_display_name?: string;
    candidate_abn?: string | null;
    candidate_domain?: string | null;
    match_method?: string;
    candidate_company_ids?: string[];
    holder_name?: string;
    similarity?: number;
  };
  created_at: string;
}

async function loadPendingReviewItems(): Promise<ReviewItemRow[]> {
  const { rows } = await getPool().query<ReviewItemRow>(
    `SELECT id, kind, reason, payload, created_at
     FROM review_queue_items
     WHERE status = 'pending'
     ORDER BY created_at ASC
     LIMIT 100`,
  );
  return rows;
}

export default async function ReviewQueuePage() {
  let items: ReviewItemRow[] = [];
  let error: string | null = null;
  try {
    items = await loadPendingReviewItems();
  } catch (caught) {
    error =
      caught instanceof DatabaseNotConfiguredError
        ? "DATABASE_URL is not configured for this deployment."
        : `Could not load the review queue: ${String(caught)}`;
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-10 px-6 py-8 sm:px-10 sm:py-12">
      <header className="flex items-center justify-between border-b border-emerald-950/15 pb-5">
        <span className="text-sm font-semibold tracking-[0.18em] uppercase">
          Review queue
        </span>
      </header>

      {error && (
        <p className="rounded-xl border border-red-600/40 bg-red-50 p-4 text-sm text-red-900">
          {error}
        </p>
      )}

      {items.length === 0 && !error && (
        <p className="text-sm text-emerald-950/60">Nothing pending review.</p>
      )}

      <div className="flex flex-col gap-6">
        {items.map((item) => {
          const boundReject = rejectReviewItem.bind(null, item.id);

          if (item.kind === "sponsorship_match") {
            const boundApproveSponsorship = approveSponsorshipMatch.bind(
              null,
              item.id,
            );
            return (
              <div
                key={item.id}
                className="rounded-2xl border border-emerald-950/15 p-5"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-medium">
                    {item.payload.holder_name}
                  </span>
                  <span className="font-mono text-xs text-emerald-950/50">
                    {item.kind}
                  </span>
                </div>
                <dl className="mb-4 grid grid-cols-2 gap-2 text-sm text-emerald-950/70">
                  <dt>Similarity score</dt>
                  <dd>{item.payload.similarity?.toFixed(2) ?? "—"}</dd>
                  <dt>Reason</dt>
                  <dd>{item.reason ?? "—"}</dd>
                </dl>
                <div className="flex flex-wrap gap-3">
                  <form action={boundApproveSponsorship}>
                    <button
                      type="submit"
                      className="rounded-full bg-emerald-900 px-4 py-2 text-xs font-medium text-white"
                    >
                      Approve
                    </button>
                  </form>
                  <form action={boundReject}>
                    <button
                      type="submit"
                      className="rounded-full border border-red-700 px-4 py-2 text-xs font-medium text-red-700"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            );
          }

          const boundApprove = approveReviewItem.bind(null, item.id);
          const candidates = item.payload.candidate_company_ids ?? [];
          return (
            <div
              key={item.id}
              className="rounded-2xl border border-emerald-950/15 p-5"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="font-medium">
                  {item.payload.candidate_display_name}
                </span>
                <span className="font-mono text-xs text-emerald-950/50">
                  {item.kind}
                </span>
              </div>
              <dl className="mb-4 grid grid-cols-2 gap-2 text-sm text-emerald-950/70">
                <dt>ABN</dt>
                <dd>{item.payload.candidate_abn ?? "—"}</dd>
                <dt>Domain</dt>
                <dd>{item.payload.candidate_domain ?? "—"}</dd>
                <dt>Match method</dt>
                <dd>{item.payload.match_method ?? "—"}</dd>
                <dt>Reason</dt>
                <dd>{item.reason ?? "—"}</dd>
                <dt>Candidate companies</dt>
                <dd className="font-mono text-xs">
                  {candidates.length > 0 ? candidates.join(", ") : "none"}
                </dd>
              </dl>
              <div className="flex flex-wrap gap-3">
                <form action={boundApprove} className="flex items-center gap-2">
                  <input
                    name="matched_company_id"
                    placeholder="Existing company id (blank = new company)"
                    className="rounded-lg border border-emerald-950/20 px-3 py-2 text-xs"
                  />
                  <button
                    type="submit"
                    className="rounded-full bg-emerald-900 px-4 py-2 text-xs font-medium text-white"
                  >
                    Approve
                  </button>
                </form>
                <form action={boundReject}>
                  <button
                    type="submit"
                    className="rounded-full border border-red-700 px-4 py-2 text-xs font-medium text-red-700"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
