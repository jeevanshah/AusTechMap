import { ImageResponse } from "next/og";

import { roleWideMarkDataUri } from "./brand-mark";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        background: "#0f172a",
        color: "#ffffff",
        display: "flex",
        height: "100%",
        overflow: "hidden",
        padding: "72px 84px",
        position: "relative",
        width: "100%",
      }}
    >
      <div
        style={{
          background:
            "radial-gradient(circle at 100% 0%, rgba(234, 88, 12, 0.28), transparent 44%), radial-gradient(circle at 6% 100%, rgba(248, 250, 252, 0.1), transparent 42%)",
          inset: 0,
          position: "absolute",
        }}
      />
      <div
        style={{
          alignItems: "flex-start",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          justifyContent: "space-between",
          position: "relative",
          width: "100%",
        }}
      >
        <div style={{ alignItems: "center", display: "flex", gap: "22px" }}>
          <div
            style={{
              alignItems: "center",
              background: "#ffffff",
              borderRadius: "22px",
              display: "flex",
              height: "92px",
              justifyContent: "center",
              width: "92px",
            }}
          >
            <img
              alt=""
              height="72"
              src={roleWideMarkDataUri}
              style={{ height: "72px", width: "72px" }}
              width="72"
            />
          </div>
          <span
            style={{
              fontFamily: "Arial, sans-serif",
              fontSize: "42px",
              fontWeight: 800,
              letterSpacing: "-1.5px",
            }}
          >
            RoleWide
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          <span
            style={{
              fontFamily: "Arial, sans-serif",
              fontSize: "74px",
              fontWeight: 800,
              letterSpacing: "-3.5px",
              lineHeight: 1.04,
            }}
          >
            Search wider. Choose smarter.
          </span>
          <span
            style={{
              color: "#cbd5e1",
              fontFamily: "Arial, sans-serif",
              fontSize: "28px",
            }}
          >
            Evidence-backed Australian technology opportunity intelligence.
          </span>
        </div>
        <div
          style={{
            alignItems: "center",
            color: "#fed7aa",
            display: "flex",
            fontFamily: "Arial, sans-serif",
            fontSize: "21px",
            fontWeight: 700,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
          }}
        >
          Employers Â· live roles Â· regional opportunity
        </div>
      </div>
    </div>,
    size,
  );
}
