import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

/**
 * Crawl rules. The sitemap is added with the catalogue, once there are
 * category and product URLs worth listing.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/admin/", "/api/", "/login"],
    },
    host: siteConfig.url,
  };
}
