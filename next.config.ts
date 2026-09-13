import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Statically type every `href`, so navigation config cannot reference a
  // route that does not exist. Route types are generated into `.next/types`.
  typedRoutes: true,
  // Never ship a production build that does not typecheck.
  typescript: { ignoreBuildErrors: false },
  poweredByHeader: false,
  images: {
    // Development placeholder photography only. Every URL is declared in
    // src/features/storefront/mock/media.ts; no component builds its own.
    // Phase 5 replaces this host with wherever real product photography is
    // served from, and this entry goes with it.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
