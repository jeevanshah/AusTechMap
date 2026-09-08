import { DatabaseNotConfiguredError, getPool } from "../../../lib/db";
import {
  approveEmployerClaimAction,
  approveReviewItem,
  approveSponsorshipMatch,
  rejectEmployerClaimAction,
  rejectReviewItem,
  resolveDataCorrectionAction,
} from "./actions";

export const dynamic = "force-dynamic";

interface ReviewItemRow {
  id: string;
  kind: string;
  reason: string | null;
  payload: {
    // candidate_match
    candidate_display_name?: string;
    candidate_abn?: string | null;
    candidate_domain?: string | null;
    match_method?: string;
    candidate_company_ids?: string[];
    // sponsorship_match
    holder_name?: string;
    similarity?: number;
    // employer_claim
    claim_id?: string;
    company_name?: string;
    company_slug?: string;
    claimant_name?: string;
    claimant_email?: string;
    claimant_role?: string;
    claim_type?: string;
    claimed_data?: {
      domainMatched?: boolean;
      officialCareersUrl?: string;
      corporateDescription?: string;
      [key: string]: unknown;
    };
    evidence_url?: string | null;
    // data_correction
    correction_id?: string;
    submitter_name?: string | null;
    submitter_email?: string;
    correction_type?: string;
    details?: string;
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
                      className="rounded-full bg-emerald-900 px-4 py-2 text-xs font-medium text-white cursor-pointer"
                    >
                      Approve
                    </button>
                  </form>
                  <form action={boundReject}>
                    <button
                      type="submit"
                      className="rounded-full border border-red-700 px-4 py-2 text-xs font-medium text-red-700 cursor-pointer"
                    >
                      Reject
                    </button>
                  </form>
                </div>
              </div>
            );
          }

          if (item.kind === "employer_claim") {
            const claimId = item.payload.claim_id ?? item.id;
            const boundApproveClaim = approveEmployerClaimAction.bind(
              null,
              claimId,
              "Verified by staff reviewer",
            );
            const boundRejectClaim = rejectEmployerClaimAction.bind(
              null,
              claimId,
              "Rejected by staff reviewer",
            );
            const domainMatched = item.payload.claimed_data?.domainMatched;

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-sky-300 bg-sky-50/30 p-5 shadow-2xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-bold text-navy-900 text-base">
                      {item.payload.company_name}
                    </span>
                    {domainMatched ? (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-800">
                        Domain Verified
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-amber-800">
                        Manual Check Needed
                      </span>
                    )}
                  </div>
                  <span className="rounded-full bg-sky-100 px-2.5 py-0.5 font-mono text-[10px] font-bold text-sky-800 uppercase">
                    Employer Claim
                  </span>
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-700 border-y border-sky-100 py-3">
                  <div>
                    <dt className="text-slate-500 font-medium">Claimant</dt>
                    <dd className="font-semibold text-slate-900">
                      {item.payload.claimant_name} ({item.payload.claimant_role})
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500 font-medium">Email</dt>
                    <dd className="font-mono text-slate-900">
                      {item.payload.claimant_email}
                    </dd>
                  </div>
                  {item.payload.evidence_url && (
                    <div className="col-span-2">
                      <dt className="text-slate-500 font-medium">Evidence URL</dt>
                      <dd>
                        <a
                          href={item.payload.evidence_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sky-700 underline truncate block"
                        >
                          {item.payload.evidence_url}
                        </a>
                      </dd>
                    </div>
                  )}
                  {item.reason && (
                    <div className="col-span-2">
                      <dt className="text-slate-500 font-medium">Reason / Context</dt>
                      <dd className="italic text-slate-600">{item.reason}</dd>
                    </div>
                  )}
                </dl>

                <div className="flex flex-wrap gap-3 pt-1">
                  <form action={boundApproveClaim}>
                    <button
                      type="submit"
                      className="rounded-full bg-emerald-800 hover:bg-emerald-900 px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer"
                    >
                      Approve & Verify Employer
                    </button>
                  </form>
                  <form action={boundRejectClaim}>
                    <button
                      type="submit"
                      className="rounded-full border border-red-700 hover:bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 transition-colors cursor-pointer"
                    >
                      Reject Claim
                    </button>
                  </form>
                </div>
              </div>
            );
          }

          if (item.kind === "data_correction") {
            const correctionId = item.payload.correction_id ?? item.id;
            const boundApproveCorr = resolveDataCorrectionAction.bind(
              null,
              correctionId,
              "approved",
              "Correction approved by staff",
            );
            const boundRejectCorr = resolveDataCorrectionAction.bind(
              null,
              correctionId,
              "rejected",
              "Correction rejected by staff",
            );

            return (
              <div
                key={item.id}
                className="rounded-2xl border border-amber-300 bg-amber-50/20 p-5 shadow-2xs space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-bold text-navy-900 text-base">
                      {item.payload.company_name}
                    </span>
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-amber-900">
                      {item.payload.correction_type}
                    </span>
                  </div>
                  <span className="rounded-full bg-slate-200 px-2.5 py-0.5 font-mono text-[10px] font-bold text-slate-800 uppercase">
                    Data Correction
                  </span>
                </div>

                <div className="text-xs text-slate-700 border-y border-amber-100 py-3 space-y-2">
                  <p>
                    <strong className="text-slate-900">Details:</strong> {item.payload.details}
                  </p>
                  <p className="text-slate-500">
                    Reported by: {item.payload.submitter_name ?? "Anonymous"} ({item.payload.submitter_email})
                  </p>
                  {item.payload.evidence_url && (
                    <p>
                      <strong className="text-slate-900">Evidence link:</strong>{" "}
                      <a
                        href={item.payload.evidence_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-amber-800 underline truncate inline-block max-w-full"
                      >
                        {item.payload.evidence_url}
                      </a>
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 pt-1">
                  <form action={boundApproveCorr}>
                    <button
                      type="submit"
                      className="rounded-full bg-emerald-800 hover:bg-emerald-900 px-4 py-2 text-xs font-semibold text-white transition-colors cursor-pointer"
                    >
                      Accept Correction
                    </button>
                  </form>
                  <form action={boundRejectCorr}>
                    <button
                      type="submit"
                      className="rounded-full border border-red-700 hover:bg-red-50 px-4 py-2 text-xs font-semibold text-red-700 transition-colors cursor-pointer"
                    >
                      Dismiss Report
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
