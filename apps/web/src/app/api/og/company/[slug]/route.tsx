import { ImageResponse } from "next/og";
import { getPool } from "../../../../../lib/db";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const pool = getPool();

  const query = `
    SELECT
      c.id,
      c.slug,
      c.display_name,
      c.domain,
      research.claim_value ->> 'city' AS city,
      cat.label AS primary_category,
      EXISTS (
        SELECT 1 FROM evidence e
        WHERE e.entity_type = 'company' AND e.entity_id = c.id::text
          AND e.claim_type IN ('sponsorship_current_explicit', 'sponsorship_historical_explicit', 'sponsorship_labour_agreement')
          AND e.status = 'active'
      ) AS has_sponsorship_evidence,
      (
        SELECT e2.claim_value ->> 'agreement_type'
        FROM evidence e2
        WHERE e2.entity_type = 'company' AND e2.entity_id = c.id::text
          AND e2.claim_type = 'sponsorship_labour_agreement' AND e2.status = 'active'
        LIMIT 1
      ) AS agreement_type,
      EXISTS (
        SELECT 1 FROM company_locations cl
        JOIN resolved_locations rl ON rl.id = cl.resolved_location_id
        WHERE cl.company_id = c.id AND rl.migration_category IS NOT NULL
      ) AS is_regional,
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
      SELECT cg.label
      FROM company_category_links ccl
      JOIN categories cg ON cg.id = ccl.category_id
      WHERE ccl.company_id = c.id
      ORDER BY cg.label
      LIMIT 1
    ) cat ON true
    WHERE c.slug = $1
    LIMIT 1;
  `;

  let row: {
    display_name: string;
    city: string | null;
    primary_category: string | null;
    has_sponsorship_evidence: boolean;
    agreement_type: string | null;
    is_regional: boolean;
    active_jobs_count: number;
    verified_at: string | null;
  } | null = null;

  try {
    const result = await pool.query(query, [slug]);
    row = result.rows[0] ?? null;
  } catch (err) {
    console.error("Failed to load company for OG card:", err);
  }

  const name = row ? row.display_name : "Australia Tech Map";
  const category = row?.primary_category || "Technology Employer";
  const city = row?.city || "Australia";
  const activeJobs = row?.active_jobs_count ?? 0;
  const hasSponsorship = Boolean(row?.has_sponsorship_evidence);
  const isRegional = Boolean(row?.is_regional);
  const sponsorshipText = row?.agreement_type
    ? `Accredited Sponsor (${row.agreement_type})`
    : hasSponsorship
      ? "Home Affairs Verified Sponsor"
      : "Standard Employer Status";

  return new ImageResponse(
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
          "radial-gradient(circle at 90% 10%, rgba(30, 58, 138, 0.25) 0%, transparent 60%), radial-gradient(circle at 10% 90%, rgba(6, 78, 59, 0.2) 0%, transparent 50%)",
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
              backgroundColor: "#0284c7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#ffffff",
              fontWeight: 900,
              fontSize: "22px",
              boxShadow: "0 0 20px rgba(2, 132, 199, 0.4)",
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
              NATIONAL TECH OPPORTUNITY GRAPH
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
            color: "#38bdf8",
          }}
        >
          <span>●</span>
          <span>VERIFIED EMPLOYER INTELLIGENCE</span>
        </div>
      </div>

      {/* Main Content Body */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "18px",
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
            color: "#38bdf8",
            fontWeight: 700,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          <span>{category}</span>
          <span>•</span>
          <span>{city}</span>
        </div>

        <h1
          style={{
            fontSize: name.length > 20 ? "52px" : "64px",
            fontWeight: 900,
            color: "#ffffff",
            margin: 0,
            lineHeight: 1.1,
            letterSpacing: "-0.03em",
            textShadow: "0 2px 10px rgba(0,0,0,0.5)",
          }}
        >
          {name}
        </h1>

        <p
          style={{
            fontSize: "20px",
            color: "#94a3b8",
            margin: 0,
            lineHeight: 1.4,
            maxWidth: "880px",
          }}
        >
          Sourced tech career footprint, active hiring signals, and verified
          migration evidence across Australia.
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
        {/* Card 1: Active Roles */}
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
          <span
            style={{
              fontSize: "13px",
              color: "#64748b",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Active Tech Roles
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: "8px",
              marginTop: "6px",
            }}
          >
            <span
              style={{ fontSize: "36px", fontWeight: 900, color: "#38bdf8" }}
            >
              {activeJobs}
            </span>
            <span style={{ fontSize: "15px", color: "#94a3b8" }}>
              currently open
            </span>
          </div>
        </div>

        {/* Card 2: Sponsorship */}
        <div
          style={{
            flex: 1.3,
            display: "flex",
            flexDirection: "column",
            padding: "20px 24px",
            borderRadius: "16px",
            backgroundColor: "rgba(15, 23, 42, 0.8)",
            border: hasSponsorship
              ? "1px solid rgba(16, 185, 129, 0.4)"
              : "1px solid rgba(51, 65, 85, 0.5)",
          }}
        >
          <span
            style={{
              fontSize: "13px",
              color: "#64748b",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Migration & Sponsorship
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "10px",
            }}
          >
            <span
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: hasSponsorship ? "#34d399" : "#cbd5e1",
              }}
            >
              {hasSponsorship ? "✓ " : ""}
              {sponsorshipText}
            </span>
          </div>
        </div>

        {/* Card 3: Regional Classification */}
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
          <span
            style={{
              fontSize: "13px",
              color: "#64748b",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Ecosystem Hub
          </span>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "10px",
            }}
          >
            <span
              style={{
                fontSize: "17px",
                fontWeight: 700,
                color: isRegional ? "#f59e0b" : "#94a3b8",
              }}
            >
              {isRegional ? "Designated Regional" : "Metropolitan"}
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
        <span>Methodology v1.0 • Verified primary sources & Home Affairs</span>
        <span>austechmap.com/companies/{slug}</span>
      </div>
    </div>,
    {
      width: 1200,
      height: 630,
    },
  );
}
