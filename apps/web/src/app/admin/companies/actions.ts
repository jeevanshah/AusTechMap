"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { ensureSystemActor } from "../../../lib/actors";
import { getPool } from "../../../lib/db";
import { normaliseAbn, normaliseAcn } from "../../../lib/normalisation";

function slugify(displayName: string): string {
  return (
    displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "company"
  );
}

async function uniqueSlug(displayName: string): Promise<string> {
  const pool = getPool();
  const base = slugify(displayName);
  let candidate = base;
  let suffix = 1;
  while (true) {
    const existing = await pool.query(
      "SELECT 1 FROM companies WHERE slug = $1",
      [candidate],
    );
    if (existing.rows.length === 0) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

async function writeAudit(
  actorUserId: number,
  action: string,
  targetId: string,
  reason: string | null,
  beforeState: Record<string, unknown> | null,
  afterState: Record<string, unknown> | null,
): Promise<void> {
  await getPool().query(
    `INSERT INTO audit_records (
       actor_type, actor_id, action, target_type, target_id,
       reason, before_state, after_state, request_id
     )
     VALUES ('user', $1, $2, 'company', $3, $4, $5, $6, $7)`,
    [
      String(actorUserId),
      action,
      targetId,
      reason,
      beforeState ? JSON.stringify(beforeState) : null,
      afterState ? JSON.stringify(afterState) : null,
      randomUUID(),
    ],
  );
}

export async function createCompany(formData: FormData): Promise<void> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) {
    throw new Error("Display name is required");
  }
  const abnRaw = String(formData.get("abn") ?? "").trim();
  const acnRaw = String(formData.get("acn") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim() || null;
  const careersUrl = String(formData.get("careers_url") ?? "").trim() || null;

  const abn = abnRaw ? normaliseAbn(abnRaw) : null;
  if (abnRaw && !abn) throw new Error(`Invalid ABN: ${abnRaw}`);
  const acn = acnRaw ? normaliseAcn(acnRaw) : null;
  if (acnRaw && !acn) throw new Error(`Invalid ACN: ${acnRaw}`);

  const pool = getPool();
  const actorUserId = await ensureSystemActor(pool);
  const slug = await uniqueSlug(displayName);
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO companies (slug, display_name, abn, acn, domain, careers_url, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending_review')
     RETURNING id`,
    [slug, displayName, abn, acn, domain, careersUrl],
  );
  const companyId = inserted.rows[0]?.id;
  if (!companyId) throw new Error("insert did not return an id");

  await writeAudit(actorUserId, "company_created", companyId, null, null, {
    slug,
    display_name: displayName,
    abn,
    acn,
    domain,
    careers_url: careersUrl,
  });

  revalidatePath("/admin/companies");
  redirect(`/admin/companies/${companyId}`);
}

export async function updateCompany(
  companyId: string,
  formData: FormData,
): Promise<void> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (!displayName) {
    throw new Error("Display name is required");
  }
  const abnRaw = String(formData.get("abn") ?? "").trim();
  const acnRaw = String(formData.get("acn") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim() || null;
  const careersUrl = String(formData.get("careers_url") ?? "").trim() || null;

  const abn = abnRaw ? normaliseAbn(abnRaw) : null;
  if (abnRaw && !abn) throw new Error(`Invalid ABN: ${abnRaw}`);
  const acn = acnRaw ? normaliseAcn(acnRaw) : null;
  if (acnRaw && !acn) throw new Error(`Invalid ACN: ${acnRaw}`);

  const pool = getPool();
  const actorUserId = await ensureSystemActor(pool);
  const before = await pool.query(
    "SELECT display_name, abn, acn, domain, careers_url FROM companies WHERE id = $1",
    [companyId],
  );
  if (before.rows.length === 0)
    throw new Error(`company not found: ${companyId}`);

  await pool.query(
    `UPDATE companies SET display_name = $1, abn = $2, acn = $3, domain = $4, careers_url = $5
     WHERE id = $6`,
    [displayName, abn, acn, domain, careersUrl, companyId],
  );
  await writeAudit(
    actorUserId,
    "company_edited",
    companyId,
    null,
    before.rows[0],
    { display_name: displayName, abn, acn, domain, careers_url: careersUrl },
  );

  revalidatePath(`/admin/companies/${companyId}`);
  redirect(`/admin/companies/${companyId}`);
}

export async function verifyCompanyAction(companyId: string): Promise<void> {
  const pool = getPool();
  const actorUserId = await ensureSystemActor(pool);
  const before = await pool.query(
    "SELECT verified_at FROM companies WHERE id = $1",
    [companyId],
  );
  if (before.rows.length === 0)
    throw new Error(`company not found: ${companyId}`);

  await pool.query("UPDATE companies SET verified_at = now() WHERE id = $1", [
    companyId,
  ]);
  await writeAudit(
    actorUserId,
    "company_verified",
    companyId,
    null,
    before.rows[0],
    {
      verified_at: "now",
    },
  );

  revalidatePath(`/admin/companies/${companyId}`);
}

export async function disableCompanyAction(
  companyId: string,
  formData: FormData,
): Promise<void> {
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) throw new Error("A reason is required to disable a company");

  const pool = getPool();
  const actorUserId = await ensureSystemActor(pool);
  const before = await pool.query(
    "SELECT status FROM companies WHERE id = $1",
    [companyId],
  );
  if (before.rows.length === 0)
    throw new Error(`company not found: ${companyId}`);
  if (before.rows[0].status === "merged") {
    throw new Error("cannot disable a merged company");
  }

  await pool.query(
    `UPDATE companies SET status = 'disabled', disabled_reason = $1, disabled_at = now()
     WHERE id = $2`,
    [reason, companyId],
  );
  await writeAudit(
    actorUserId,
    "company_disabled",
    companyId,
    reason,
    before.rows[0],
    {
      status: "disabled",
      disabled_reason: reason,
    },
  );

  revalidatePath(`/admin/companies/${companyId}`);
}

export async function mergeCompanyAction(
  sourceId: string,
  formData: FormData,
): Promise<void> {
  const targetId = String(formData.get("target_company_id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!targetId) throw new Error("A target company id is required");
  if (!reason) throw new Error("A reason is required to merge companies");
  if (targetId === sourceId)
    throw new Error("cannot merge a company into itself");

  const pool = getPool();
  const actorUserId = await ensureSystemActor(pool);
  const source = await pool.query(
    "SELECT status FROM companies WHERE id = $1",
    [sourceId],
  );
  const target = await pool.query(
    "SELECT status FROM companies WHERE id = $1",
    [targetId],
  );
  if (source.rows.length === 0)
    throw new Error(`source company not found: ${sourceId}`);
  if (target.rows.length === 0)
    throw new Error(`target company not found: ${targetId}`);
  if (source.rows[0].status === "merged")
    throw new Error("source company is already merged");
  if (target.rows[0].status === "merged") {
    throw new Error(
      "target company is itself merged — merge into its current target instead",
    );
  }

  await pool.query(
    "UPDATE companies SET status = 'merged', merged_into_company_id = $1 WHERE id = $2",
    [targetId, sourceId],
  );
  await writeAudit(
    actorUserId,
    "company_merged",
    sourceId,
    reason,
    source.rows[0],
    {
      status: "merged",
      merged_into_company_id: targetId,
    },
  );

  revalidatePath(`/admin/companies/${sourceId}`);
  redirect(`/admin/companies/${sourceId}`);
}
