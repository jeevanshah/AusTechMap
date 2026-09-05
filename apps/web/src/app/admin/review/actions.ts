"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { ensureSystemActor } from "../../../lib/actors";
import { getPool } from "../../../lib/db";

interface CandidatePayload {
  candidate_display_name: string;
  candidate_abn?: string | null;
  candidate_acn?: string | null;
  candidate_domain?: string | null;
}

function slugify(displayName: string): string {
  return (
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "company"
  );
}

function normaliseCompanyName(raw: string): string {
  const withoutAmpersand = raw.toUpperCase().replace(/&/g, " AND ");
  const collapsed = withoutAmpersand.replace(/[^A-Z0-9]+/g, " ").trim();
  const suffixes = [
    ["PROPRIETARY", "LIMITED"],
    ["PROPRIETARY", "LTD"],
    ["PTY", "LIMITED"],
    ["PTY", "LTD"],
    ["LIMITED"],
    ["LTD"],
    ["INCORPORATED", "ASSOCIATION"],
    ["INCORPORATED"],
    ["INC"],
    ["LLC"],
    ["LLP"],
  ];
  const tokens = collapsed.split(" ").filter(Boolean);
  for (const suffix of suffixes) {
    if (tokens.length > suffix.length) {
      const tail = tokens.slice(tokens.length - suffix.length).join(" ");
      if (tail === suffix.join(" ")) {
        return tokens.slice(0, tokens.length - suffix.length).join(" ");
      }
    }
  }
  return tokens.join(" ");
}

export async function rejectReviewItem(reviewItemId: string): Promise<void> {
  const pool = getPool();
  const actorUserId = await ensureSystemActor(pool);
  const existing = await pool.query(
    "SELECT status FROM review_queue_items WHERE id = $1",
    [reviewItemId],
  );
  if (existing.rows.length === 0)
    throw new Error(`review item not found: ${reviewItemId}`);
  if (existing.rows[0].status !== "pending")
    throw new Error("review item already resolved");

  await pool.query(
    `UPDATE review_queue_items
     SET status = 'rejected', reviewed_by_user_id = $1, reviewed_at = now()
     WHERE id = $2`,
    [actorUserId, reviewItemId],
  );
  revalidatePath("/admin/review");
}

interface SponsorshipMatchPayload {
  holder_name?: string;
  similarity?: number;
}

export async function approveSponsorshipMatch(
  reviewItemId: string,
): Promise<void> {
  const pool = getPool();
  const actorUserId = await ensureSystemActor(pool);
  const row = await pool.query<{
    status: string;
    company_id: string | null;
    payload: SponsorshipMatchPayload;
    source_id: string;
  }>(
    "SELECT status, company_id, payload, source_id FROM review_queue_items WHERE id = $1",
    [reviewItemId],
  );
  const reviewRow = row.rows[0];
  if (!reviewRow) throw new Error(`review item not found: ${reviewItemId}`);
  if (reviewRow.status !== "pending")
    throw new Error("review item already resolved");
  if (!reviewRow.company_id)
    throw new Error("sponsorship match review item has no company_id");

  await pool.query(
    `INSERT INTO evidence (
       entity_type, entity_id, claim_type, claim_value, source_id, confidence, observed_at
     )
     VALUES ('company', $1, 'sponsorship_labour_agreement', $2, $3, 1.0, now())`,
    [
      reviewRow.company_id,
      JSON.stringify({
        holder_name: reviewRow.payload.holder_name,
        similarity: reviewRow.payload.similarity,
        approved_via: "review",
      }),
      reviewRow.source_id,
    ],
  );
  await pool.query(
    `UPDATE review_queue_items
     SET status = 'approved', reviewed_by_user_id = $1, reviewed_at = now()
     WHERE id = $2`,
    [actorUserId, reviewItemId],
  );
  await pool.query(
    `INSERT INTO audit_records (
       actor_type, actor_id, action, target_type, target_id, request_id
     )
     VALUES ('user', $1, 'review_item_approved', 'company', $2, $3)`,
    [String(actorUserId), reviewRow.company_id, randomUUID()],
  );

  revalidatePath("/admin/review");
}

export async function approveReviewItem(
  reviewItemId: string,
  formData: FormData,
): Promise<void> {
  const matchedCompanyId =
    String(formData.get("matched_company_id") ?? "").trim() || null;

  const pool = getPool();
  const actorUserId = await ensureSystemActor(pool);
  const row = await pool.query<{
    status: string;
    payload: CandidatePayload;
    source_id: string;
  }>(
    "SELECT status, payload, source_id FROM review_queue_items WHERE id = $1",
    [reviewItemId],
  );
  const reviewRow = row.rows[0];
  if (!reviewRow) throw new Error(`review item not found: ${reviewItemId}`);
  if (reviewRow.status !== "pending")
    throw new Error("review item already resolved");
  const payload = reviewRow.payload;
  const sourceId = reviewRow.source_id;

  let resultingCompanyId: string;
  if (matchedCompanyId) {
    const existing = await pool.query<{ display_name: string }>(
      "SELECT display_name FROM companies WHERE id = $1",
      [matchedCompanyId],
    );
    const existingCompany = existing.rows[0];
    if (!existingCompany)
      throw new Error(`company not found: ${matchedCompanyId}`);

    await pool.query(
      `UPDATE companies
       SET abn = COALESCE(abn, $1), acn = COALESCE(acn, $2), domain = COALESCE(domain, $3)
       WHERE id = $4`,
      [
        payload.candidate_abn ?? null,
        payload.candidate_acn ?? null,
        payload.candidate_domain ?? null,
        matchedCompanyId,
      ],
    );
    await pool.query(
      `INSERT INTO evidence (
         entity_type, entity_id, claim_type, claim_value, source_id, confidence, observed_at
       )
       VALUES ('company', $1, 'identity_match', $2, $3, 1.0, now())`,
      [
        matchedCompanyId,
        JSON.stringify({
          method: "review",
          candidate_display_name: payload.candidate_display_name,
        }),
        sourceId,
      ],
    );
    if (
      normaliseCompanyName(payload.candidate_display_name) !==
      normaliseCompanyName(existingCompany.display_name)
    ) {
      await pool.query(
        `INSERT INTO company_aliases (company_id, alias, alias_type, source_id)
         VALUES ($1, $2, 'trading_name', $3)
         ON CONFLICT (company_id, alias, alias_type) DO NOTHING`,
        [matchedCompanyId, payload.candidate_display_name, sourceId],
      );
    }
    resultingCompanyId = matchedCompanyId;
  } else {
    const slug = slugify(payload.candidate_display_name);
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO companies (slug, display_name, abn, acn, domain, status)
       VALUES ($1, $2, $3, $4, $5, 'pending_review')
       RETURNING id`,
      [
        slug,
        payload.candidate_display_name,
        payload.candidate_abn ?? null,
        payload.candidate_acn ?? null,
        payload.candidate_domain ?? null,
      ],
    );
    const newId = inserted.rows[0]?.id;
    if (!newId) throw new Error("insert did not return an id");
    resultingCompanyId = newId;
  }

  await pool.query(
    `UPDATE review_queue_items
     SET status = 'approved', reviewed_by_user_id = $1, reviewed_at = now()
     WHERE id = $2`,
    [actorUserId, reviewItemId],
  );
  await pool.query(
    `INSERT INTO audit_records (
       actor_type, actor_id, action, target_type, target_id, request_id
     )
     VALUES ('user', $1, 'review_item_approved', 'company', $2, $3)`,
    [String(actorUserId), resultingCompanyId, randomUUID()],
  );

  revalidatePath("/admin/review");
}
