import "server-only";

import { cache } from "react";

import type { StorefrontCategory, StorefrontImage } from "@/types/commerce";
import { prisma } from "@/lib/db/client";

/**
 * Reading categories.
 *
 * Every public read here filters on `isActive`, in the query rather than
 * afterwards, so a disabled collection cannot reach a page by being forgotten
 * in one branch. Nothing in this file writes: catalogue management belongs to
 * the admin phase.
 *
 * Prisma rows do not leave this module. Callers get the small presentation
 * shapes in `@/types/commerce`, so a column rename is a change here and
 * nowhere else.
 */

/** A category as the listing header and the search suggestions need it. */
export type CategorySummary = {
  slug: string;
  name: string;
  /** The one-line description. Empty string when none is written. */
  tagline: string;
};

/** A category with its SEO copy, for a category-filtered listing. */
export type CategoryDetail = CategorySummary & {
  seoTitle: string | null;
  seoDescription: string | null;
};

/** What the header, the mobile drawer and the footer need. */
export type CategoryNavigationItem = Pick<CategorySummary, "slug" | "name">;

/** Selected once so every read returns the same columns. */
const summarySelect = {
  slug: true,
  name: true,
  description: true,
} as const;

/** Active first, merchandising order, then name so ties are not arbitrary. */
const activeOrder = [{ position: "asc" }, { name: "asc" }] as const;

/**
 * Every category a shopper may browse, in merchandising order.
 *
 * This is the list the shop page names a filtered listing from, and the list
 * the search panel offers before anything is typed.
 */
export async function getActiveCategories(): Promise<CategorySummary[]> {
  const rows = await prisma.category.findMany({
    where: { isActive: true },
    orderBy: [...activeOrder],
    select: summarySelect,
  });

  return rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    tagline: row.description ?? "",
  }));
}

/**
 * The category links in the header, the mobile drawer and the footer.
 *
 * A narrower select than {@link getActiveCategories} because navigation needs
 * two columns and pulling the rest would be read on every page of the site.
 */
export async function getCategoryNavigation(): Promise<
  CategoryNavigationItem[]
> {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: [...activeOrder],
    select: { slug: true, name: true },
  });
}

/**
 * One category, or null when the slug matches nothing public.
 *
 * A disabled category returns null rather than its row, so a link that used to
 * work stops working rather than quietly showing a collection that has been
 * taken down.
 *
 * Memoised per request, because the shop page asks for the same category twice
 * — once in `generateMetadata` for the title, once to name the listing.
 */
export const getCategoryBySlug = cache(
  async (slug: string): Promise<CategoryDetail | null> => {
    const row = await prisma.category.findFirst({
      where: { slug, isActive: true },
      select: { ...summarySelect, seoTitle: true, seoDescription: true },
    });

    if (!row) {
      return null;
    }

    return {
      slug: row.slug,
      name: row.name,
      tagline: row.description ?? "",
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
    };
  },
);

/**
 * The home page tiles.
 *
 * Only categories that have a photograph are returned. A tile is a picture
 * with a caption, so a category without one has nothing to render, and
 * dropping it here keeps `StorefrontCategory.image` a required field instead
 * of pushing an "if there is an image" branch into the component.
 */
export async function getCategoryTiles(
  limit = 4,
): Promise<StorefrontCategory[]> {
  const rows = await prisma.category.findMany({
    where: {
      isActive: true,
      imageUrl: { not: null },
      imageWidth: { not: null },
      imageHeight: { not: null },
    },
    orderBy: [...activeOrder],
    take: limit,
    select: {
      ...summarySelect,
      imageUrl: true,
      imageAlt: true,
      imageWidth: true,
      imageHeight: true,
    },
  });

  const tiles: StorefrontCategory[] = [];

  for (const row of rows) {
    const image = toStorefrontImage(row);

    // The query already excluded rows with no image; this narrows the three
    // nullable columns to one non-null object for TypeScript, and is what
    // would catch a row with a URL but no dimensions.
    if (!image) {
      continue;
    }

    tiles.push({
      slug: row.slug,
      name: row.name,
      tagline: row.description ?? "",
      image,
    });
  }

  return tiles;
}

/**
 * Active category slugs with their last change, for the sitemap.
 *
 * `updatedAt` is what `lastModified` reports, so a crawler is told the truth
 * about when the collection last changed rather than the time of the build.
 */
export async function listCategorySitemapEntries(): Promise<
  { slug: string; updatedAt: Date }[]
> {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: [...activeOrder],
    select: { slug: true, updatedAt: true },
  });
}

function toStorefrontImage(row: {
  imageUrl: string | null;
  imageAlt: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  name: string;
}): StorefrontImage | null {
  if (!row.imageUrl || !row.imageWidth || !row.imageHeight) {
    return null;
  }

  return {
    src: row.imageUrl,
    // Falling back to the category name keeps the image described rather than
    // announced as "image", which is what an empty alt on a link would do.
    alt: row.imageAlt ?? row.name,
    width: row.imageWidth,
    height: row.imageHeight,
  };
}
