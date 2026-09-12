import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Statically type every `href`, so navigation config cannot reference a
  // route that does not exist. Route types are generated into `.next/types`.
  typedRoutes: true,
  // Never ship a production build that does not typecheck.
  typescript: { ignoreBuildErrors: false },
  poweredByHeader: false,
};

export default nextConfig;
