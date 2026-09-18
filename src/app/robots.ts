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
 * `/wishlist` is blocked outright since Phase 8: it is one person's saved
 * pieces behind a sign-in, so there is nothing there for a crawler and nothing
 * that should ever appear in a result. The page also carries
 * `robots: { index: false }`, which is the half that works for a crawler that
 * reaches it anyway — this file only asks, and a signed-out request is
 * redirected to sign-in regardless.
 *
 * `/account` is blocked for the same reason and more strongly: it holds a name,
 * a phone number and somebody's home address. Every page under it also carries
 * `robots: { index: false, follow: false }`, and a signed-out request is
 * redirected to sign-in before any of it renders.
 *
 * `/cart` stays crawlable, because a bag is not an account feature and an
 * anonymous visitor gets a real page there. What they get is the empty state:
 * a crawler has no cookie, so there is nothing of anybody's to see. The page
 * itself carries `noindex` so a crawler that reaches it keeps nothing.
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
      disallow: [
        "/admin",
        "/admin/",
        "/api/",
        "/login",
        "/wishlist",
        "/account",
      ],
    },
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
