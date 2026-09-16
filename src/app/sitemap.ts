import type { MetadataRoute } from "next";

import { siteConfig } from "@/config/site";
import { listCategorySitemapEntries } from "@/lib/services/category-service";
import { listProductSitemapEntries } from "@/lib/services/product-service";

/**
 * The sitemap.
 *
 * Phase 4 had nothing worth listing: the catalogue was eight objects in a
 * TypeScript file, and a sitemap of invented URLs is worse than none. Now the
 * product and category URLs are real, so they are declared.
 *
 * **What is in it:** the public pages, every active category as the listing it
 * filters, and every ACTIVE product.
 *
 * **What is not:** `/admin`, `/login`, `/api`, drafts and archived products,
 * and disabled categories. The two services already filter by status, so
 * nothing unpublished can reach this file even by mistake. `robots.ts` blocks
 * the same routes, and this is the other half of that pair.
 *
 * `lastModified` is the row's own `updatedAt`, not the time of the build, so a
 * crawler is told when the piece actually changed.
 *
 * Built per request rather than at build time. A sitemap is fetched by
 * crawlers occasionally and by nobody else, so two queries when it is asked
 * for costs nothing, it is never stale, and `next build` does not need a
 * database to produce it.
 */
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteConfig.url;

  const [categories, products] = await Promise.all([
    listCategorySitemapEntries(),
    listProductSitemapEntries(),
  ]);

  const now = new Date();

  return [
    {
      url: base,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${base}/shop`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    // Categories are a filtered listing rather than a route of their own, so
    // that is the URL advertised. There is deliberately no second, competing
    // `/category/[slug]` URL for the same set of products.
    ...categories.map((category) => ({
      url: `${base}/shop?category=${category.slug}`,
      lastModified: category.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...products.map((product) => ({
      url: `${base}/shop/${product.slug}`,
      lastModified: product.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
  ];
}
