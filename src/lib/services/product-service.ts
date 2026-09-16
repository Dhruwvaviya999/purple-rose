import "server-only";

import { cache } from "react";

import { productsPerPage } from "@/config/storefront";
import type { ProductQuery } from "@/features/storefront/product-query";
import { productQueryParams } from "@/features/storefront/product-query";
import type {
  FilterGroup,
  FilterOption,
  ProductCardData,
  ProductDetailData,
} from "@/types/commerce";
import { ProductStatus } from "@/generated/prisma/enums";
import {
  buildProductOrderBy,
  buildProductWhere,
  orderableVariant,
} from "@/lib/catalog/product-filters";
import {
  productCardSelect,
  productDetailSelect,
  toProductCardData,
  toProductDetailData,
} from "@/lib/catalog/product-mapper";
import {
  fabricVocabulary,
  fitVocabulary,
  occasionVocabulary,
  patternVocabulary,
  toToken,
  type Vocabulary,
} from "@/lib/catalog/vocabulary";
import { prisma } from "@/lib/db/client";

/**
 * Reading the catalogue.
 *
 * This is the file that replaced `features/storefront/mock/query.ts`. It
 * exposes the same operations that layer did, with the same arguments and the
 * same return types, so the pages that call it changed one import each:
 *
 * | Mock                       | Here                          |
 * | -------------------------- | ----------------------------- |
 * | `listMockProducts`         | `listProducts`                |
 * | `findMockProductBySlug`    | `getProductBySlug`            |
 * | `listMockProductSlugs`     | `listProductSitemapEntries`   |
 * | `listMockNewArrivals`      | `listMerchandisedProducts`    |
 * | `listMockRelatedProducts`  | `listRelatedProducts`         |
 * | `listMockFilterGroups`     | `listFilterGroups`            |
 * | `listMockCategories`       | `category-service.ts`         |
 *
 * Three rules hold throughout.
 *
 * **Nothing Prisma-shaped leaves this module.** Callers get the presentation
 * types from `@/types/commerce`, mapped in `catalog/product-mapper.ts`.
 *
 * **Only ACTIVE products are visible.** That lives in `buildProductWhere`, in
 * the query, not in a component and not in a filter applied afterwards.
 *
 * **Paging happens in the database.** Nothing here reads a full result set to
 * slice it, and nothing counts values in JavaScript that SQL can count.
 */

/** What a listing returns. The pager and the count both read this. */
export type ProductListResult = {
  products: readonly ProductCardData[];
  /** Matches before paging, for the count and the pager. */
  total: number;
  /** The page actually returned, which may be clamped from the one asked for. */
  page: number;
  pageSize: number;
  pageCount: number;
};

/** The home page rails. All three are merchandising flags, not analytics. */
export type MerchandisingRail = "new-arrivals" | "featured" | "best-sellers";

/**
 * A slug as the route may produce one.
 *
 * `/shop/[slug]` will hand this function anything at all, so the shape is
 * checked before a query is built. A slug that cannot exist is answered
 * without going to the database.
 */
const SLUG = /^[a-z0-9][a-z0-9-]{0,178}[a-z0-9]$|^[a-z0-9]$/;

/**
 * A listing page.
 *
 * Two queries: one `COUNT`, one page of rows. They run together, because the
 * count does not depend on the rows.
 *
 * The page number is clamped to the number of pages that exist, which is what
 * makes `?page=900` show the last page rather than an empty grid. Clamping
 * needs the total, so in the rare case where the requested page overshoots,
 * one more query fetches the page that does exist.
 */
export async function listProducts(
  query: ProductQuery,
): Promise<ProductListResult> {
  const where = buildProductWhere(query);
  const orderBy = buildProductOrderBy(query.sort);
  const pageSize = productsPerPage;
  const requestedPage = Math.max(1, Math.trunc(query.page) || 1);

  const [total, firstAttempt] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: (requestedPage - 1) * pageSize,
      take: pageSize,
      select: productCardSelect,
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, pageCount);

  const rows =
    page === requestedPage
      ? firstAttempt
      : await prisma.product.findMany({
          where,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: productCardSelect,
        });

  return {
    products: rows.map(toProductCardData),
    total,
    page,
    pageSize,
    pageCount,
  };
}

/**
 * One product, or null.
 *
 * Null covers every reason a shopper cannot see it: no such slug, still a
 * draft, archived. The route turns all of them into the same 404, so the
 * existence of an unpublished product is not leaked by a different response.
 *
 * Wrapped in React's `cache`, which memoises per request. A product page calls
 * this twice — once in `generateMetadata` for the title and the Open Graph
 * image, once in the page itself — and without this that is two identical
 * queries for every view. It is request-scoped, so nothing is shared between
 * two shoppers or held between requests.
 */
export const getProductBySlug = cache(
  async (slug: string): Promise<ProductDetailData | null> => {
    if (!SLUG.test(slug)) {
      return null;
    }

    const row = await prisma.product.findFirst({
      where: { slug, status: ProductStatus.ACTIVE },
      select: productDetailSelect,
    });

    return row ? toProductDetailData(row) : null;
  },
);

/**
 * A home page rail.
 *
 * Every rail is driven by a column somebody set on purpose. `bestSeller` in
 * particular is an editorial flag: no order exists yet, so nothing in this
 * application knows what has sold, and nothing here pretends to.
 */
export async function listMerchandisedProducts(
  rail: MerchandisingRail,
  limit = 4,
): Promise<ProductCardData[]> {
  const where = {
    status: ProductStatus.ACTIVE,
    ...(rail === "new-arrivals" ? { newArrival: true } : {}),
    ...(rail === "featured" ? { featured: true } : {}),
    ...(rail === "best-sellers" ? { bestSeller: true } : {}),
  };

  const rows = await prisma.product.findMany({
    where,
    orderBy: buildProductOrderBy(rail === "new-arrivals" ? "newest" : "featured"),
    take: Math.min(Math.max(limit, 1), 24),
    select: productCardSelect,
  });

  return rows.map(toProductCardData);
}

/**
 * Other pieces to show under a product.
 *
 * Deterministic and explainable: everything that shares a collection with this
 * piece, in merchandising order, with the piece itself excluded. Sharing any
 * collection rather than only the primary one is what lets a print story like
 * "Fresh Prints" pull a co-ord next to a dress.
 *
 * When that is not enough to fill the rail it is topped up from the rest of
 * the catalogue, so the row is never half empty. Two queries at most, and the
 * second only when it is needed.
 *
 * This is not a recommendation engine and is not presented as one. Behaviour
 * signals need behaviour, and none is collected.
 */
export async function listRelatedProducts(
  slug: string,
  limit = 4,
): Promise<ProductCardData[]> {
  if (!SLUG.test(slug)) {
    return [];
  }

  const product = await prisma.product.findFirst({
    where: { slug, status: ProductStatus.ACTIVE },
    select: { id: true, categories: { select: { categoryId: true } } },
  });

  if (!product) {
    return [];
  }

  const categoryIds = product.categories.map((entry) => entry.categoryId);
  const orderBy = buildProductOrderBy("featured");

  const sameCollection = await prisma.product.findMany({
    where: {
      status: ProductStatus.ACTIVE,
      id: { not: product.id },
      categories: { some: { categoryId: { in: categoryIds } } },
    },
    orderBy,
    take: limit,
    select: productCardSelect,
  });

  if (sameCollection.length >= limit) {
    return sameCollection.map(toProductCardData);
  }

  const seen = [product.id, ...sameCollection.map((row) => row.id)];

  const fill = await prisma.product.findMany({
    where: { status: ProductStatus.ACTIVE, id: { notIn: seen } },
    orderBy,
    take: limit - sameCollection.length,
    select: productCardSelect,
  });

  return [...sameCollection, ...fill].map(toProductCardData);
}

/**
 * Active product URLs and when they last changed, for the sitemap.
 *
 * Drafts and archived products are not in the result, so nothing unpublished
 * is advertised to a crawler.
 */
export async function listProductSitemapEntries(): Promise<
  { slug: string; updatedAt: Date }[]
> {
  return prisma.product.findMany({
    where: { status: ProductStatus.ACTIVE },
    orderBy: { publishedAt: { sort: "desc", nulls: "last" } },
    select: { slug: true, updatedAt: true },
  });
}

/* -------------------------------------------------------------------------
 * Facets
 * ---------------------------------------------------------------------- */

/**
 * The filter groups, with a count beside every value.
 *
 * ## What the numbers mean
 *
 * A count is **the number of products that would be left if this value were
 * ticked, with every other group still applied**. So the group being counted
 * does not narrow itself: choosing Pink leaves the other colours showing how
 * many pink-or-that-colour pieces there are, instead of collapsing the group
 * to "Pink 4" and stranding the shopper. Every other group does narrow it, so
 * a count never promises results that a tick would not produce.
 *
 * A value is listed when its count is above zero, or when it is currently
 * ticked. Keeping a ticked value visible at zero is what lets someone undo the
 * filter that emptied the page.
 *
 * ## How they are counted
 *
 * Three queries, run together, none of which reads a product row into
 * JavaScript to count it:
 *
 * 1. **Categories.** One `findMany` over the category table with a filtered
 *    relation count, so PostgreSQL counts and the names come back with it.
 * 2. **Fabric, pattern, fit and occasion.** One `groupBy` over all four
 *    columns at once. Each product has exactly one value in each, so a row of
 *    that grouping is a distinct combination with a count, and a dimension's
 *    facet is the sum of the rows that agree with the other three selections.
 *    Four aggregations for the price of one query.
 * 3. **Size and colour.** These cannot be a `groupBy`: a product with six
 *    sizes in pink would be counted six times, and what is wanted is
 *    `COUNT(DISTINCT product)`, which Prisma's `groupBy` cannot express. So
 *    one query projects three key columns — product, size, colour — for the
 *    orderable variants of the matching products, and the distinct pairs are
 *    counted from that. The projection is bounded by the result set, not by
 *    the catalogue, and it serves both groups at once because a row carries
 *    both a size and a colour.
 *
 * When the catalogue outgrows that, step 3 becomes a parameterised
 * `COUNT(DISTINCT ...) GROUP BY` and nothing else changes.
 */
export async function listFilterGroups(
  query: ProductQuery,
): Promise<FilterGroup[]> {
  const [categoryRows, attributeRows, variantRows] = await Promise.all([
    prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: {
        slug: true,
        name: true,
        _count: {
          select: {
            products: { where: { product: buildProductWhere(query, ["category"]) } },
          },
        },
      },
    }),

    prisma.product.groupBy({
      by: ["fabric", "pattern", "fit", "occasion"],
      where: buildProductWhere(query, [
        "fabric",
        "pattern",
        "fit",
        "occasion",
      ]),
      _count: { _all: true },
    }),

    prisma.productVariant.findMany({
      where: {
        ...orderableVariant,
        size: { isActive: true },
        color: { isActive: true },
        product: buildProductWhere(query, ["size", "colour"]),
      },
      select: {
        productId: true,
        size: { select: { code: true, position: true } },
        color: {
          select: { slug: true, name: true, hex: true, position: true },
        },
      },
    }),
  ]);

  return [
    {
      param: productQueryParams.category,
      label: "Category",
      options: categoryRows
        .map((row) => ({
          value: row.slug,
          label: row.name,
          count: row._count.products,
        }))
        .filter((option) => keepOption(option, query.categories)),
    },
    sizeGroup(variantRows, query),
    colourGroup(variantRows, query),
    attributeGroup(fabricVocabulary, attributeRows, query, "fabric"),
    attributeGroup(patternVocabulary, attributeRows, query, "pattern"),
    attributeGroup(fitVocabulary, attributeRows, query, "fit"),
    attributeGroup(occasionVocabulary, attributeRows, query, "occasion"),
  ].filter((group) => group.options.length > 0);
}

/** Shown when something matches, or when it is ticked and needs unticking. */
function keepOption(
  option: { value: string; count: number },
  selected: readonly string[],
): boolean {
  return option.count > 0 || selected.includes(option.value);
}

type VariantFacetRow = {
  productId: string;
  size: { code: string; position: number };
  color: { slug: string; name: string; hex: string; position: number };
};

/**
 * Count distinct products per key, honouring the *other* variant selection.
 *
 * The rows arriving here are one per orderable variant, so a product appears
 * once per size-and-colour it is made in. A `Set` of product ids per key is
 * what turns that back into a product count.
 */
function countDistinctProducts<TKey extends string>(
  rows: readonly VariantFacetRow[],
  keyOf: (row: VariantFacetRow) => TKey,
  accept: (row: VariantFacetRow) => boolean,
): Map<TKey, Set<string>> {
  const counts = new Map<TKey, Set<string>>();

  for (const row of rows) {
    if (!accept(row)) {
      continue;
    }

    const key = keyOf(row);
    const products = counts.get(key);

    if (products) {
      products.add(row.productId);
    } else {
      counts.set(key, new Set([row.productId]));
    }
  }

  return counts;
}

function sizeGroup(
  rows: readonly VariantFacetRow[],
  query: ProductQuery,
): FilterGroup {
  const colours = new Set(query.colours);

  // The colour selection still applies, and it applies to the same variant:
  // "how many pieces have an M available in one of the chosen colours".
  const counts = countDistinctProducts(
    rows,
    (row) => row.size.code,
    (row) => colours.size === 0 || colours.has(row.color.slug),
  );

  const positions = new Map<string, number>();
  for (const row of rows) {
    positions.set(row.size.code, row.size.position);
  }

  const options: FilterOption[] = [...positions.keys()]
    // Smallest to largest, by the position on the size row. Reading the
    // counts map in insertion order would list XS after XXL.
    .sort((a, b) => (positions.get(a) ?? 0) - (positions.get(b) ?? 0))
    .map((code) => ({
      value: code.toLowerCase(),
      label: code,
      count: counts.get(code)?.size ?? 0,
    }))
    .filter((option) => keepOption({ ...option, count: option.count ?? 0 }, query.sizes));

  return { param: productQueryParams.size, label: "Size", options };
}

function colourGroup(
  rows: readonly VariantFacetRow[],
  query: ProductQuery,
): FilterGroup {
  const sizes = new Set(query.sizes.map((code) => code.toUpperCase()));

  const counts = countDistinctProducts(
    rows,
    (row) => row.color.slug,
    (row) => sizes.size === 0 || sizes.has(row.size.code),
  );

  const meta = new Map<string, VariantFacetRow["color"]>();
  for (const row of rows) {
    meta.set(row.color.slug, row.color);
  }

  const options: FilterOption[] = [...meta.values()]
    .sort((a, b) => a.position - b.position)
    .map((colour) => ({
      value: colour.slug,
      label: colour.name,
      count: counts.get(colour.slug)?.size ?? 0,
      hex: colour.hex,
    }))
    .filter((option) => keepOption({ ...option, count: option.count ?? 0 }, query.colours));

  return { param: productQueryParams.colour, label: "Colour", options };
}

type AttributeRow = {
  fabric: string;
  pattern: string;
  fit: string;
  occasion: string;
  _count: { _all: number };
};

type AttributeKey = "fabric" | "pattern" | "fit" | "occasion";

const attributeSelections: Record<AttributeKey, (query: ProductQuery) => readonly string[]> = {
  fabric: (query) => query.fabrics,
  pattern: (query) => query.patterns,
  fit: (query) => query.fits,
  occasion: (query) => query.occasions,
};

/**
 * One attribute facet, summed out of the four-column grouping.
 *
 * The grouping was made with none of the four filters applied, so the other
 * three are applied here instead. That is what "self-excluding" means for
 * these groups, and it costs nothing: there is one row per distinct
 * combination, never one per product.
 */
function attributeGroup<TValue extends string>(
  vocabulary: Vocabulary<TValue>,
  rows: readonly AttributeRow[],
  query: ProductQuery,
  key: AttributeKey,
): FilterGroup {
  const others = (Object.keys(attributeSelections) as AttributeKey[]).filter(
    (candidate) => candidate !== key,
  );

  const counts = new Map<string, number>();

  for (const row of rows) {
    const matchesOthers = others.every((other) => {
      const selected = attributeSelections[other](query);
      return selected.length === 0 || selected.includes(toToken(row[other]));
    });

    if (!matchesOthers) {
      continue;
    }

    const value = row[key];
    counts.set(value, (counts.get(value) ?? 0) + row._count._all);
  }

  const selected = attributeSelections[key](query);

  const options: FilterOption[] = vocabulary.values
    .map((value) => ({
      value: toToken(value),
      label: vocabulary.labels[value],
      count: counts.get(value) ?? 0,
    }))
    .filter((option) => keepOption(option, selected));

  return { param: vocabulary.param, label: vocabulary.label, options };
}
