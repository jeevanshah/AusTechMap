import { NextResponse } from "next/server";
import { auth } from "../../../../auth";
import { getPool } from "../../../../lib/db";
import { recordAudit } from "../../../../lib/audit";
import { hasEntitlement } from "../../../../lib/commercial/entitlements";
import { getRegionOpportunity } from "../../../../lib/queries/getRegionOpportunity";
import { enforceApiRateLimit } from "../../../../lib/security/apiRateLimit";

export const dynamic = "force-dynamic";

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val).trim();
  if (
    str.includes(",") ||
    str.includes('"') ||
    str.includes("\n") ||
    str.includes("\r")
  ) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET() {
  const pool = getPool();
  const session = await auth();
  const user = session?.user;
  const userId = user?.id ? Number(user.id) : null;
  const userRole = (user as { role?: string })?.role;
  const isStaff = userRole === "admin" || userRole === "reviewer";

  const isInstitutional =
    isStaff ||
    (userId
      ? await hasEntitlement(pool, userId, "institutional_export")
      : false);

  // Tiered rate limit: 120/min for institutional/staff, 10/min for community/anonymous
  const limit = isInstitutional ? 120 : 10;
  const rateLimitResponse = await enforceApiRateLimit(pool, {
    scope: isInstitutional
      ? "api_export_regions_inst"
      : "api_export_regions_pub",
    limit,
    windowSeconds: 60,
    lockSeconds: 60,
  });
  if (rateLimitResponse) return rateLimitResponse;

  try {
    const { rows: regionRows } = await pool.query<{
      code: string;
      name: string;
      state: string;
    }>(`
      SELECT code, name, state
      FROM regions
      WHERE type = 'sa4'
      ORDER BY code ASC;
    `);

    const headers = [
      "SA4 Code",
      "Region Name",
      "State",
      "Migration Category",
      "DAMA Covered",
      "Tech Opportunity Score",
      "Data Sufficiency Status",
      "Suppression Reason",
      "Mapped Employers",
      "Active Tech Roles",
    ];

    if (isInstitutional) {
      headers.push(
        "Employer Depth Score",
        "Vacancies Score",
        "Momentum Score",
        "Labour Market Direction",
        "Industry Diversity Score",
      );
    }

    headers.push("Profile URL");

    const csvRows: string[] = [];

    if (isInstitutional) {
      csvRows.push(
        `# AusTechMap Institutional Regional Intelligence Export (Licensed to: ${user?.email ?? "Staff"}, Generated: ${new Date().toISOString()})`,
      );
      csvRows.push(
        "# Notice: Data governed by Australia Tech Map Institutional Terms and Source Attribution Registers.",
      );
    }

    csvRows.push(headers.map(escapeCsvField).join(","));

    for (const r of regionRows) {
      const opp = await getRegionOpportunity(pool, r.code);

      const migrationCategories = opp?.migrationContext.categories || [];
      const damaNames = opp?.migrationContext.damaNames || [];
      const isDama = damaNames.length > 0;

      const migrationLabel = isDama
        ? "DAMA Regional Agreement"
        : migrationCategories.includes("category_2")
          ? "Category 2 Regional Centre"
          : migrationCategories.includes("category_3")
            ? "Category 3 Regional Area"
            : "Major Metropolitan";

      const score =
        opp?.score.value !== null && opp?.score.value !== undefined
          ? opp.score.value
          : "";

      const isSuppressed = !opp?.score.sufficiency.sufficient;
      const status = isSuppressed
        ? "Suppressed (Screening)"
        : "Sufficient Data";
      const suppressionReason = opp?.score.sufficiency.reasons?.[0] || "";
      const employerCount = opp?.summary.employerCount ?? 0;
      const activeRoles = opp?.summary.activeJobCount ?? 0;

      const row: unknown[] = [
        r.code,
        r.name,
        r.state,
        migrationLabel,
        isDama ? "TRUE" : "FALSE",
        score,
        status,
        suppressionReason,
        employerCount,
        activeRoles,
      ];

      if (isInstitutional) {
        row.push(
          opp?.score.components.employerDepth ?? 0,
          opp?.score.components.currentVacancies ?? 0,
          opp?.score.components.hiringMomentum ?? 0,
          opp?.score.components.laborMarketDirection ?? 0,
          opp?.score.components.industryDiversity ?? 0,
        );
      }

      row.push(`https://austechmap.com/regions/${r.code}`);

      csvRows.push(row.map(escapeCsvField).join(","));
    }

    // Audit logging for export event
    if (userId) {
      await recordAudit(pool, {
        actorUserId: userId,
        action: "export.regions.download",
        targetType: "export_dataset",
        targetId: "regions",
        metadata: {
          rowCount: regionRows.length,
          isInstitutional,
        },
      });
    }

    const csvContent = "\uFEFF" + csvRows.join("\r\n"); // UTF-8 BOM
    const dateStr = new Date().toISOString().split("T")[0];

    return new Response(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="austechmap-regions-${dateStr}.csv"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("CSV region export error:", error);
    return NextResponse.json(
      { error: "Failed to generate region CSV export" },
      { status: 500 },
    );
  }
}
