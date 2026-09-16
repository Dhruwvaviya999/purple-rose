import type { NextConfig } from "next";

// A relative path, not the "@/" alias: this file is loaded by the Next CLI
// before the application's module graph and its path mapping exist.
import { allowedImageHosts } from "./src/config/images";

const nextConfig: NextConfig = {
  // Statically type every `href`, so navigation config cannot reference a
  // route that does not exist. Route types are generated into `.next/types`.
  typedRoutes: true,
  // Never ship a production build that does not typecheck.
  typescript: { ignoreBuildErrors: false },
  poweredByHeader: false,
  images: {
    // Derived from src/config/images.ts, which the admin validation schema
    // also reads. One list: a URL the admin panel accepts is a URL this
    // config can render, and a host that is not here is refused in the form
    // rather than throwing on a product page.
    //
    // Today that is the development placeholder photography host. The brand
    // imagery in src/config/media.ts and the catalogue rows written by
    // prisma/seed.ts both point at it; no component builds a URL.
    //
    // The schema is not tied to it: ProductImage.url and Category.imageUrl are
    // plain absolute URLs, so moving to Cloudinary, Vercel Blob or S3 is a
    // change to that list, not a migration.
    remotePatterns: allowedImageHosts.map((hostname) => ({
      protocol: "https" as const,
      hostname,
      pathname: "/**",
    })),
  },
};

export default nextConfig;
