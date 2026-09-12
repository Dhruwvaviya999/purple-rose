import { ImageResponse } from "next/og";

import { siteConfig } from "@/config/site";

export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Default social share card. Route-specific cards can override this later by
 * adding their own `opengraph-image` file to a segment.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "96px",
          background: "#faf9fb",
          color: "#1c1a21",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            fontSize: 24,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            color: "#73409a",
          }}
        >
          {siteConfig.name}
        </div>
        <div
          style={{
            marginTop: 32,
            fontSize: 76,
            lineHeight: 1.1,
            maxWidth: 880,
          }}
        >
          {siteConfig.tagline}
        </div>
        <div
          style={{
            marginTop: 40,
            width: 96,
            height: 4,
            background: "#73409a",
          }}
        />
      </div>
    ),
    size,
  );
}
