import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Favicon generated from the brand mark, so there is no binary asset to keep in sync. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#73409a",
          color: "#ffffff",
          fontSize: 20,
          fontWeight: 500,
          letterSpacing: "-0.02em",
        }}
      >
        PR
      </div>
    ),
    size,
  );
}
