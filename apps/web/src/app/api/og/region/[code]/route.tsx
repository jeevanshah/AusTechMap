import { ImageResponse } from "next/og";
import { getPool } from "../../../../../lib/db";
import { getRegionOpportunity } from "../../../../../lib/queries/getRegionOpportunity";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const { code } = await params;
  const pool = getPool();

  let opportunity = null;
  let state = "AU";
  try {
    const [oppResult, regionResult] = await Promise.all([
      getRegionOpportunity(pool, code),
      pool.query<{ state: string }>(
        "SELECT state FROM regions WHERE code = $1 LIMIT 1",
        [code],
      ),
    ]);
    opportunity = oppResult;
    state = regionResult.rows[0]?.state || "AU";
  } catch (err) {
    console.error("Failed to load region for OG card:", err);
  }

  const regionName = opportunity?.region.name || `Region ${code}`;
  const migrationCategories = opportunity?.migrationContext.categories || [];
  const damaNames = opportunity?.migrationContext.damaNames || [];
  const isDama = damaNames.length > 0;

  const score = opportunity?.score.value;
  const isSuppressed = !opportunity?.score.sufficiency.sufficient;
  const suppressionReason =
    opportunity?.score.sufficiency.reasons?.[0] || "Screening in progress";

  const employerCount = opportunity?.summary.employerCount ?? 0;
  const activeJobsCount = opportunity?.summary.activeJobCount ?? 0;

  const migrationBadge = isDama
    ? "DAMA Regional Agreement"
    : migrationCategories.includes("category_2")
      ? "Category 2 Regional Centre"
      : migrationCategories.includes("category_3")
        ? "Category 3 Regional Area"
        : "Major Metropolitan";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "60px 80px",
          backgroundColor: "#070a12",
          backgroundImage:
            "radial-gradient(circle at 90% 10%, rgba(13, 148, 136, 0.25) 0%, transparent 60%), radial-gradient(circle at 10% 90%, rgba(30, 58, 138, 0.2) 0%, transparent 50%)",
          color: "#f8fafc",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
          boxSizing: "border-box",
        }}
      >
        {/* Header Branding */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <div
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "10px",
                backgroundColor: "#0d9488",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
                fontWeight: 900,
                fontSize: "22px",
                boxShadow: "0 0 20px rgba(13, 148, 136, 0.4)",
              }}
            >
              AU
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span
                style={{
                  fontSize: "18px",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  color: "#e2e8f0",
                }}
              >
                AUSTRALIA TECH MAP
              </span>
              <span
                style={{
                  fontSize: "13px",
                  color: "#94a3b8",
                  letterSpacing: "0.05em",
                }}
              >
                REGIONAL ECOSYSTEM INTELLIGENCE
              </span>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "8px 16px",
              borderRadius: "9999px",
              backgroundColor: "rgba(30, 41, 59, 0.7)",
              border: "1px solid rgba(148, 163, 184, 0.2)",
              fontSize: "14px",
              fontWeight: 600,
              color: "#2dd4bf",
            }}
          >
            <span>●</span>
            <span>ABS ASGS 2021 SA4 COHORT</span>
          </div>
        </div>

        {/* Main Content Body */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            marginTop: "20px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "16px",
              color: "#2dd4bf",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            <span>{state}</span>
            <span>•</span>
            <span>SA4 Code: {code}</span>
            <span>•</span>
            <span>{migrationBadge}</span>
          </div>

          <h1
            style={{
              fontSize: regionName.length > 22 ? "50px" : "62px",
              fontWeight: 900,
              color: "#ffffff",
              margin: 0,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              textShadow: "0 2px 10px rgba(0,0,0,0.5)",
            }}
          >
            {regionName}
          </h1>

          <p
            style={{
              fontSize: "20px",
              color: "#94a3b8",
              margin: 0,
              lineHeight: 1.4,
              maxWidth: "920px",
            }}
          >
            Regional technology employer concentration, location-confirmed role demand, and migration policy context.
          </p>
        </div>

        {/* Key Metrics Row */}
        <div
          style={{
            display: "flex",
            gap: "24px",
            width: "100%",
          }}
        >
          {/* Card 1: Regional Tech Opportunity Score */}
          <div
            style={{
              flex: 1.4,
              display: "flex",
              flexDirection: "column",
              padding: "20px 24px",
              borderRadius: "16px",
              backgroundColor: "rgba(15, 23, 42, 0.8)",
              border: isSuppressed
                ? "1px solid rgba(245, 158, 11, 0.4)"
                : "1px solid rgba(13, 148, 136, 0.5)",
            }}
          >
            <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Tech Opportunity Score
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginTop: "6px" }}>
              {isSuppressed ? (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "22px", fontWeight: 800, color: "#f59e0b" }}>
                    Screening In Progress
                  </span>
                  <span style={{ fontSize: "13px", color: "#94a3b8", marginTop: "2px" }}>
                    {suppressionReason}
                  </span>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px" }}>
                  <span style={{ fontSize: "38px", fontWeight: 900, color: "#2dd4bf" }}>
                    {score}
                  </span>
                  <span style={{ fontSize: "18px", color: "#64748b" }}>/ 100</span>
                  <span style={{ fontSize: "14px", color: "#34d399", fontWeight: 600, marginLeft: "12px" }}>
                    Verified Sufficient Data
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Card 2: Mapped Tech Employers */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              padding: "20px 24px",
              borderRadius: "16px",
              backgroundColor: "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(51, 65, 85, 0.5)",
            }}
          >
            <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Mapped Employers
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "6px" }}>
              <span style={{ fontSize: "36px", fontWeight: 900, color: "#38bdf8" }}>
                {employerCount}
              </span>
              <span style={{ fontSize: "15px", color: "#94a3b8" }}>
                tech organizations
              </span>
            </div>
          </div>

          {/* Card 3: Active Tech Roles */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              padding: "20px 24px",
              borderRadius: "16px",
              backgroundColor: "rgba(15, 23, 42, 0.8)",
              border: "1px solid rgba(51, 65, 85, 0.5)",
            }}
          >
            <span style={{ fontSize: "13px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Active Tech Jobs
            </span>
            <div style={{ display: "flex", alignItems: "baseline", gap: "8px", marginTop: "6px" }}>
              <span style={{ fontSize: "36px", fontWeight: 900, color: "#a78bfa" }}>
                {activeJobsCount}
              </span>
              <span style={{ fontSize: "15px", color: "#94a3b8" }}>
                location-confirmed
              </span>
            </div>
          </div>
        </div>

        {/* Footer Timestamp */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            paddingTop: "20px",
            borderTop: "1px solid rgba(51, 65, 85, 0.4)",
            fontSize: "14px",
            color: "#64748b",
          }}
        >
          <span>Methodology v1.0 • ABS ASGS 2021 & Sourced Migration Evidence</span>
          <span>austechmap.com/regions/{code}</span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
