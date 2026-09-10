import type { Pool } from "pg";
import type {
  CreateEmployerClaimRequest,
  EmployerClaim,
  CreateDataCorrectionRequest,
  DataCorrection,
} from "@austechmap/contracts";
import { recordAudit } from "../audit";

export interface CreateClaimResult {
  claim: EmployerClaim;
  reviewQueueItemId: string;
}

export interface CreateCorrectionResult {
  correction: DataCorrection;
  reviewQueueItemId: string;
}

/**
 * Creates an employer profile verification claim and enqueues it for staff review.
 * Preserves independent observations separately without mutating company facts.
 */
export async function createEmployerClaim(
  pool: Pool,
  data: CreateEmployerClaimRequest,
  userId?: number | null,
): Promise<CreateClaimResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    // 1. Insert claim
    const claimRes = await client.query<{
      id: string;
      company_id: string;
      user_id: string | null;
      claimant_name: string;
      claimant_email: string;
      claimant_role: string;
      claim_type: string;
      claimed_data: Record<string, unknown>;
      evidence_url: string | null;
      status: "pending" | "approved" | "rejected" | "revoked";
      review_notes: string | null;
      reviewed_by_user_id: string | null;
      reviewed_at: Date | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO employer_claims (
        company_id, user_id, claimant_name, claimant_email,
        claimant_role, claim_type, claimed_data, evidence_url, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')
      RETURNING *`,
      [
        data.companyId,
        userId ?? null,
        data.claimantName,
        data.claimantEmail,
        data.claimantRole,
        data.claimType,
        JSON.stringify(data.claimedData ?? {}),
        data.evidenceUrl ?? null,
      ],
    );

    const row = claimRes.rows[0];
    if (!row) {
      throw new Error("Failed to insert employer claim");
    }

    // 2. Fetch company display name for queue payload
    const compRes = await client.query<{ display_name: string; slug: string }>(
      `SELECT display_name, slug FROM companies WHERE id = $1`,
      [data.companyId],
    );
    const company = compRes.rows[0];

    // 3. Enqueue into review_queue_items
    const queuePayload = {
      claim_id: row.id,
      company_id: row.company_id,
      company_name: company?.display_name ?? "Unknown",
      company_slug: company?.slug ?? "",
      claimant_name: row.claimant_name,
      claimant_email: row.claimant_email,
      claimant_role: row.claimant_role,
      claim_type: row.claim_type,
      claimed_data: row.claimed_data,
      evidence_url: row.evidence_url,
    };

    const queueRes = await client.query<{ id: string }>(
      `INSERT INTO review_queue_items (
        kind, status, company_id, payload, reason
      ) VALUES ('employer_claim', 'pending', $1, $2, $3)
      RETURNING id`,
      [
        row.company_id,
        JSON.stringify(queuePayload),
        `Employer profile verification claim by ${row.claimant_name} (${row.claimant_role})`,
      ],
    );

    const queueItemId = queueRes.rows[0]?.id;
    if (!queueItemId) {
      throw new Error("Failed to enqueue claim review item");
    }

    await client.query("COMMIT;");

    const claim: EmployerClaim = {
      id: row.id,
      companyId: row.company_id,
      userId: row.user_id ? Number(row.user_id) : undefined,
      claimantName: row.claimant_name,
      claimantEmail: row.claimant_email,
      claimantRole: row.claimant_role,
      claimType: row.claim_type,
      claimedData: row.claimed_data,
      evidenceUrl: row.evidence_url ?? undefined,
      status: row.status,
      reviewNotes: row.review_notes ?? undefined,
      reviewedByUserId: row.reviewed_by_user_id
        ? Number(row.reviewed_by_user_id)
        : undefined,
      reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : undefined,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };

    return { claim, reviewQueueItemId: queueItemId };
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Creates a community data correction / dispute and enqueues it for staff review.
 */
export async function createDataCorrection(
  pool: Pool,
  data: CreateDataCorrectionRequest,
  userId?: number | null,
): Promise<CreateCorrectionResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    const corrRes = await client.query<{
      id: string;
      company_id: string | null;
      user_id: string | null;
      submitter_name: string | null;
      submitter_email: string;
      correction_type: DataCorrection["correctionType"];
      details: string;
      evidence_url: string | null;
      status: "pending" | "approved" | "rejected";
      review_notes: string | null;
      reviewed_by_user_id: string | null;
      reviewed_at: Date | null;
      created_at: Date;
    }>(
      `INSERT INTO data_corrections (
        company_id, user_id, submitter_name, submitter_email,
        correction_type, details, evidence_url, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending')
      RETURNING *`,
      [
        data.companyId ?? null,
        userId ?? null,
        data.submitterName ?? null,
        data.submitterEmail,
        data.correctionType,
        data.details,
        data.evidenceUrl ?? null,
      ],
    );

    const row = corrRes.rows[0];
    if (!row) {
      throw new Error("Failed to insert data correction");
    }

    let companyName = "General / Non-Company";
    let companySlug = "";
    if (data.companyId) {
      const compRes = await client.query<{
        display_name: string;
        slug: string;
      }>(`SELECT display_name, slug FROM companies WHERE id = $1`, [
        data.companyId,
      ]);
      if (compRes.rows[0]) {
        companyName = compRes.rows[0].display_name;
        companySlug = compRes.rows[0].slug;
      }
    }

    const queuePayload = {
      correction_id: row.id,
      company_id: row.company_id,
      company_name: companyName,
      company_slug: companySlug,
      submitter_name: row.submitter_name,
      submitter_email: row.submitter_email,
      correction_type: row.correction_type,
      details: row.details,
      evidence_url: row.evidence_url,
    };

    const queueRes = await client.query<{ id: string }>(
      `INSERT INTO review_queue_items (
        kind, status, company_id, payload, reason
      ) VALUES ('data_correction', 'pending', $1, $2, $3)
      RETURNING id`,
      [
        row.company_id,
        JSON.stringify(queuePayload),
        `Community data correction (${row.correction_type}) by ${row.submitter_email}`,
      ],
    );

    const queueItemId = queueRes.rows[0]?.id;
    if (!queueItemId) {
      throw new Error("Failed to enqueue correction review item");
    }

    await client.query("COMMIT;");

    const correction: DataCorrection = {
      id: row.id,
      companyId: row.company_id ?? undefined,
      userId: row.user_id ? Number(row.user_id) : undefined,
      submitterName: row.submitter_name ?? undefined,
      submitterEmail: row.submitter_email,
      correctionType: row.correction_type,
      details: row.details,
      evidenceUrl: row.evidence_url ?? undefined,
      status: row.status,
      reviewNotes: row.review_notes ?? undefined,
      reviewedByUserId: row.reviewed_by_user_id
        ? Number(row.reviewed_by_user_id)
        : undefined,
      reviewedAt: row.reviewed_at ? row.reviewed_at.toISOString() : undefined,
      createdAt: row.created_at.toISOString(),
    };

    return { correction, reviewQueueItemId: queueItemId };
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Staff approves an employer claim.
 * Flags company as is_claimed = true while strictly preserving raw observations.
 */
export async function approveEmployerClaim(
  pool: Pool,
  claimId: string,
  reviewerUserId: number,
  reviewNotes?: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    // 1. Update claim status
    const claimRes = await client.query<{
      company_id: string;
      user_id: string | null;
      claimant_email: string;
    }>(
      `UPDATE employer_claims
       SET status = 'approved',
           reviewed_by_user_id = $1,
           reviewed_at = now(),
           review_notes = $2,
           updated_at = now()
       WHERE id = $3 AND status = 'pending'
       RETURNING company_id, user_id, claimant_email`,
      [reviewerUserId, reviewNotes ?? "Approved by staff reviewer", claimId],
    );

    const claim = claimRes.rows[0];
    if (!claim) {
      throw new Error("Claim not found or not in pending status");
    }

    // 2. Mark company is_claimed = true without overwriting observations
    await client.query(
      `UPDATE companies
       SET is_claimed = true,
           claimed_at = now(),
           claimed_by_user_id = $1,
           updated_at = now()
       WHERE id = $2`,
      [
        claim.user_id ? Number(claim.user_id) : reviewerUserId,
        claim.company_id,
      ],
    );

    // 2b. Automatically grant employer_analytics entitlement if claimant has user account
    if (claim.user_id) {
      await client.query(
        `INSERT INTO user_entitlements (user_id, entitlement, granted_by_user_id, metadata)
         VALUES ($1, 'employer_analytics', $2, $3)
         ON CONFLICT (user_id, entitlement) DO NOTHING`,
        [
          Number(claim.user_id),
          reviewerUserId,
          JSON.stringify({ company_id: claim.company_id, claim_id: claimId }),
        ],
      );
    }

    // 3. Resolve review_queue_item
    await client.query(
      `UPDATE review_queue_items
       SET status = 'approved',
           reviewed_by_user_id = $1,
           reviewed_at = now()
       WHERE kind = 'employer_claim'
         AND (payload->>'claim_id') = $2
         AND status = 'pending'`,
      [reviewerUserId, claimId],
    );

    // 4. Audit log
    await recordAudit(client, {
      actorUserId: reviewerUserId,
      action: "employer_claim.approve",
      targetType: "employer_claim",
      targetId: claimId,
      reason: reviewNotes ?? "Approved by staff reviewer",
      metadata: {
        company_id: claim.company_id,
        claimant_email: claim.claimant_email,
        review_notes: reviewNotes,
      },
    });

    await client.query("COMMIT;");
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Staff rejects an employer claim.
 */
export async function rejectEmployerClaim(
  pool: Pool,
  claimId: string,
  reviewerUserId: number,
  reviewNotes: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    const claimRes = await client.query<{
      company_id: string;
      claimant_email: string;
    }>(
      `UPDATE employer_claims
       SET status = 'rejected',
           reviewed_by_user_id = $1,
           reviewed_at = now(),
           review_notes = $2,
           updated_at = now()
       WHERE id = $3 AND status = 'pending'
       RETURNING company_id, claimant_email`,
      [reviewerUserId, reviewNotes, claimId],
    );

    const claim = claimRes.rows[0];
    if (!claim) {
      throw new Error("Claim not found or not in pending status");
    }

    // Resolve review queue item
    await client.query(
      `UPDATE review_queue_items
       SET status = 'rejected',
           reviewed_by_user_id = $1,
           reviewed_at = now()
       WHERE kind = 'employer_claim'
         AND (payload->>'claim_id') = $2
         AND status = 'pending'`,
      [reviewerUserId, claimId],
    );

    // Audit log
    await recordAudit(client, {
      actorUserId: reviewerUserId,
      action: "employer_claim.reject",
      targetType: "employer_claim",
      targetId: claimId,
      reason: reviewNotes,
      metadata: {
        company_id: claim.company_id,
        claimant_email: claim.claimant_email,
        review_notes: reviewNotes,
      },
    });

    await client.query("COMMIT;");
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Staff resolves a community data correction.
 */
export async function resolveDataCorrection(
  pool: Pool,
  correctionId: string,
  action: "approved" | "rejected",
  reviewerUserId: number,
  reviewNotes?: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN;");

    const corrRes = await client.query<{
      company_id: string | null;
      submitter_email: string;
      correction_type: string;
    }>(
      `UPDATE data_corrections
       SET status = $1,
           reviewed_by_user_id = $2,
           reviewed_at = now(),
           review_notes = $3
       WHERE id = $4 AND status = 'pending'
       RETURNING company_id, submitter_email, correction_type`,
      [
        action,
        reviewerUserId,
        reviewNotes ?? `Correction marked as ${action}`,
        correctionId,
      ],
    );

    const corr = corrRes.rows[0];
    if (!corr) {
      throw new Error("Correction not found or not in pending status");
    }

    // Resolve review queue item
    await client.query(
      `UPDATE review_queue_items
       SET status = $1,
           reviewed_by_user_id = $2,
           reviewed_at = now()
       WHERE kind = 'data_correction'
         AND (payload->>'correction_id') = $3
         AND status = 'pending'`,
      [action, reviewerUserId, correctionId],
    );

    // Audit log
    await recordAudit(client, {
      actorUserId: reviewerUserId,
      action: `data_correction.${action}`,
      targetType: "data_correction",
      targetId: correctionId,
      reason: reviewNotes ?? `Correction marked as ${action}`,
      metadata: {
        company_id: corr.company_id,
        submitter_email: corr.submitter_email,
        correction_type: corr.correction_type,
        review_notes: reviewNotes,
      },
    });

    await client.query("COMMIT;");
  } catch (err) {
    await client.query("ROLLBACK;");
    throw err;
  } finally {
    client.release();
  }
}
