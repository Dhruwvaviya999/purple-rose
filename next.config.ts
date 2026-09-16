import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Statically type every `href`, so navigation config cannot reference a
  // route that does not exist. Route types are generated into `.next/types`.
  typedRoutes: true,
  // Never ship a production build that does not typecheck.
  typescript: { ignoreBuildErrors: false },
  poweredByHeader: false,
  images: {
    // Development placeholder photography.
    //
    // Two things still point at this host and nothing else does: the brand
    // imagery in src/config/media.ts, and the product and category image URLs
    // written by prisma/seed.ts. No component builds a URL.
    //
    // The schema is not tied to it: ProductImage.url and Category.imageUrl are
    // plain absolute URLs, so moving to Cloudinary, Vercel Blob or S3 is a
    // seed change plus a second entry here, not a migration.
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
    ],
  },
};

export default nextConfig;
