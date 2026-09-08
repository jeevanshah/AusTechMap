import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { enforceApiRateLimit } from "../../../../lib/security/apiRateLimit";

export const dynamic = "force-dynamic";

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val).trim();
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET(request: Request) {
  const pool = getPool();
  const rateLimitResponse = await enforceApiRateLimit(pool, {
    scope: "api_export_companies",
    limit: 20,
    windowSeconds: 60,
    lockSeconds: 60,
  });
  if (rateLimitResponse) return rateLimitResponse;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const sponsorship = searchParams.get("sponsorship") === "true";
  const regional = searchParams.get("regional") === "true";
  const hiring = searchParams.get("hiring") === "true";

  const query = `
    SELECT
      c.slug,
      c.display_name,
      c.domain,
      c.careers_url,
      cat.label AS primary_category,
      research.claim_value ->> 'city' AS city,
      EXISTS (
        SELECT 1 FROM company_locations cl
        JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
        WHERE cl.company_id = c.id AND rl.migration_category IS NOT NULL
      ) AS is_regional,
      EXISTS (
        SELECT 1 FROM evidence e
        WHERE e.entity_type = 'company' AND e.entity_id = c.id::text
          AND e.claim_type IN ('sponsorship_current_explicit', 'sponsorship_historical_explicit', 'sponsorship_labour_agreement')
          AND e.status = 'active'
      ) AS has_sponsorship_evidence,
      (
        SELECT e2.claim_value ->> 'agreement_type'
        FROM evidence e2
        WHERE e2.entity_id = c.id::text
          AND e2.claim_type = 'sponsorship_labour_agreement' AND e2.status = 'active'
        LIMIT 1
      ) AS agreement_type,
      (
        SELECT count(*)::int FROM jobs j
        WHERE j.company_id = c.id AND j.expired_at IS NULL
      ) AS active_jobs_count,
      c.verified_at
    FROM companies c
    LEFT JOIN LATERAL (
      SELECT e.claim_value
      FROM evidence e
      WHERE e.entity_type = 'company' AND e.entity_id = c.id::text
        AND e.claim_type = 'employer_seed_research'
        AND e.status = 'active'
      ORDER BY e.observed_at DESC LIMIT 1
    ) research ON true
    LEFT JOIN LATERAL (
      SELECT cg.label, cg.key
      FROM company_category_links ccl
      JOIN categories cg ON cg.id = ccl.category_id
      WHERE ccl.company_id = c.id
      ORDER BY cg.label
      LIMIT 1
    ) cat ON true
    WHERE c.status != 'disabled' AND c.status != 'merged'
      AND ($1::text IS NULL OR cat.key = $1 OR cat.label = $1)
    ORDER BY c.display_name ASC;
  `;

  try {
    const result = await pool.query(query, [category]);
    let rows = result.rows;

    if (sponsorship) {
      rows = rows.filter((r) => r.has_sponsorship_evidence);
    }
    if (regional) {
      rows = rows.filter((r) => r.is_regional);
    }
    if (hiring) {
      rows = rows.filter((r) => r.active_jobs_count > 0);
    }

    const headers = [
      "Slug",
      "Company Name",
      "Primary Category",
      "Headquarters City",
      "Domain",
      "Careers URL",
      "Is Regional",
      "Has Sponsorship Evidence",
      "Sponsorship Type",
      "Active Tech Jobs",
      "Verified At",
      "Profile URL",
    ];

    const csvRows = [headers.map(escapeCsvField).join(",")];

    for (const r of rows) {
      const sponType = r.agreement_type
        ? `Labour Agreement (${r.agreement_type})`
        : r.has_sponsorship_evidence
          ? "Home Affairs Accredited Sponsor"
          : "None";

      const row = [
        r.slug,
        r.display_name,
        r.primary_category || "",
        r.city || "",
        r.domain || "",
        r.careers_url || "",
        r.is_regional ? "TRUE" : "FALSE",
        r.has_sponsorship_evidence ? "TRUE" : "FALSE",
        sponType,
        r.active_jobs_count,
        r.verified_at ? new Date(r.verified_at).toISOString().split("T")[0] : "",
        `https://austechmap.com/companies/${r.slug}`,
      ];

      csvRows.push(row.map(escapeCsvField).join(","));
    }

    const csvContent = "\uFEFF" + csvRows.join("\r\n"); // UTF-8 BOM for Excel
    const dateStr = new Date().toISOString().split("T")[0];

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="austechmap-companies-${dateStr}.csv"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("CSV company export error:", error);
    return NextResponse.json(
      { error: "Failed to generate company CSV export" },
      { status: 500 },
    );
  }
}
