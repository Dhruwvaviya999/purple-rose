import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";

/**
 * Crawl rules.
 *
 * The whole storefront is crawlable: the home page, the listing, every
 * category-filtered listing and every product. What is blocked is everything
 * that is not a shopfront — the admin area, the API routes, and sign-in, which
 * is a form rather than a page with anything to index.
 *
 * `/cart` and `/wishlist` are left crawlable but carry no content a crawler
 * would keep; they become `noindex` when they hold a person's own basket.
 *
 * `disallow` is a request to crawlers and nothing more. `/admin` is protected
 * by a server-side session and role check, and that is what actually keeps
 * people out of it.
 *
 * The sitemap is declared here so a crawler finds it without guessing. It
 * lists only active categories and ACTIVE products; see `sitemap.ts`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/admin/", "/api/", "/login"],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
