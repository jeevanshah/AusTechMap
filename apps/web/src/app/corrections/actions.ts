"use server";

import {
  CreateDataCorrectionRequestSchema,
  CreateEmployerClaimRequestSchema,
} from "@austechmap/contracts";
import { auth } from "../../auth";
import { getPool } from "../../lib/db";
import { checkRateLimit } from "../../lib/rate-limit";
import { currentClientIp } from "../../lib/request-ip";
import { validateSafeUrl } from "../../lib/security/ssrf";
import {
  createDataCorrection,
  createEmployerClaim,
} from "../../lib/queries/claims";

export interface ClaimSubmissionResponse {
  ok: boolean;
  claimId?: string;
  error?: string;
  domainMatched?: boolean;
}

export interface CorrectionSubmissionResponse {
  ok: boolean;
  correctionId?: string;
  error?: string;
}

/**
 * Public action to claim an employer profile.
 * Verifies email domain against verified company domain, guards SSRF on evidence link,
 * and rate-limits abuse-prone submissions.
 */
export async function submitEmployerClaimAction(
  formData: unknown,
): Promise<ClaimSubmissionResponse> {
  const ip = await currentClientIp();
  const pool = getPool();

  // Rate limit: 5 claim submissions per hour per IP
  const rateResult = await checkRateLimit(pool, {
    scope: "employer_claim",
    key: ip,
    limit: 5,
    windowSeconds: 3600,
    lockSeconds: 3600,
  });
  if (!rateResult.allowed) {
    return {
      ok: false,
      error: "Too many submission attempts. Please try again later.",
    };
  }

  const parsed = CreateEmployerClaimRequestSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid submission data.",
    };
  }

  const data = parsed.data;

  // SSRF guard on corroborating evidence link if provided
  if (data.evidenceUrl) {
    const ssrfCheck = await validateSafeUrl(data.evidenceUrl);
    if (!ssrfCheck.valid) {
      return {
        ok: false,
        error: `Evidence URL rejected: ${ssrfCheck.reason}`,
      };
    }
  }

  // Check company exists
  const compRes = await pool.query<{ id: string; domain: string | null; display_name: string }>(
    `SELECT id, domain, display_name FROM companies WHERE id = $1`,
    [data.companyId],
  );
  const company = compRes.rows[0];
  if (!company) {
    return {
      ok: false,
      error: "Selected company profile could not be found.",
    };
  }

  // Domain match evaluation
  let domainMatched = false;
  if (company.domain) {
    const emailDomain = data.claimantEmail.split("@")[1]?.toLowerCase().trim();
    const cleanCompanyDomain = company.domain.toLowerCase().replace(/^www\./, "").trim();
    if (emailDomain && (emailDomain === cleanCompanyDomain || emailDomain.endsWith("." + cleanCompanyDomain))) {
      domainMatched = true;
    }
  }

  // Current session if authenticated
  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;

  try {
    const result = await createEmployerClaim(
      pool,
      {
        ...data,
        claimedData: {
          ...data.claimedData,
          domainMatched,
          companyDomain: company.domain,
        },
      },
      userId,
    );

    return {
      ok: true,
      claimId: result.claim.id,
      domainMatched,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to record employer claim.",
    };
  }
}

/**
 * Public action to report data corrections or evidence disputes.
 */
export async function submitDataCorrectionAction(
  formData: unknown,
): Promise<CorrectionSubmissionResponse> {
  const ip = await currentClientIp();
  const pool = getPool();

  // Rate limit: 10 reports per hour per IP
  const rateResult = await checkRateLimit(pool, {
    scope: "data_correction",
    key: ip,
    limit: 10,
    windowSeconds: 3600,
    lockSeconds: 3600,
  });
  if (!rateResult.allowed) {
    return {
      ok: false,
      error: "Too many submission attempts. Please try again later.",
    };
  }

  const parsed = CreateDataCorrectionRequestSchema.safeParse(formData);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid correction data.",
    };
  }

  const data = parsed.data;

  // SSRF guard on evidence URL
  if (data.evidenceUrl) {
    const ssrfCheck = await validateSafeUrl(data.evidenceUrl);
    if (!ssrfCheck.valid) {
      return {
        ok: false,
        error: `Evidence URL rejected: ${ssrfCheck.reason}`,
      };
    }
  }

  const session = await auth();
  const userId = session?.user?.id ? Number(session.user.id) : null;

  try {
    const result = await createDataCorrection(pool, data, userId);
    return {
      ok: true,
      correctionId: result.correction.id,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to submit correction report.",
    };
  }
}
