import { ImageResponse } from "next/og";

import { roleWideInverseMarkDataUri } from "./brand-mark";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "#0f172a",
        borderRadius: "112px",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <img
        alt=""
        height="344"
        src={roleWideInverseMarkDataUri}
        style={{ height: "344px", width: "344px" }}
        width="344"
      />
    </div>,
    size,
  );
}
