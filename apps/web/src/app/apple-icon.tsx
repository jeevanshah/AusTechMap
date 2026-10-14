import { ImageResponse } from "next/og";

import { roleWideInverseMarkDataUri } from "./brand-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#0f172a",
        borderRadius: "40px",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <img
        alt=""
        height="122"
        src={roleWideInverseMarkDataUri}
        style={{ height: "122px", width: "122px" }}
        width="122"
      />
    </div>,
    size,
  );
}
