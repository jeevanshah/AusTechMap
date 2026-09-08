import { NextResponse } from "next/server";
import { getPool } from "../../../../lib/db";
import { getRegionOpportunity } from "../../../../lib/queries/getRegionOpportunity";

export const dynamic = "force-dynamic";

function escapeCsvField(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val).trim();
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export async function GET() {
  const pool = getPool();

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
      "Profile URL",
    ];

    const csvRows = [headers.map(escapeCsvField).join(",")];

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

      const score = opp?.score.value !== null && opp?.score.value !== undefined
        ? opp.score.value
        : "";

      const isSuppressed = !opp?.score.sufficiency.sufficient;
      const status = isSuppressed ? "Suppressed (Screening)" : "Sufficient Data";
      const suppressionReason = opp?.score.sufficiency.reasons?.[0] || "";
      const employerCount = opp?.summary.employerCount ?? 0;
      const activeRoles = opp?.summary.activeJobCount ?? 0;

      const row = [
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
        `https://austechmap.com/regions/${r.code}`,
      ];

      csvRows.push(row.map(escapeCsvField).join(","));
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
