import { productsPerPage } from "@/config/storefront";
import type {
  FilterGroup,
  ProductCardData,
  ProductDetailData,
  StorefrontCategory,
} from "@/types/commerce";
import type { ProductQuery } from "../product-query";
import { mockCategories } from "./categories";
import { STANDARD_SIZES, mockProducts } from "./products";

/**
 * TEMPORARY listing layer. See ./README.md.
 *
 * This is the seam Phase 5 replaces. Every function here takes the same
 * arguments and returns the same shapes a real service will, so the routes
 * that call them do not change: only the import does, and then this folder is
 * deleted.
 *
 * The filtering below is an array walk over eight items. It is not written to
 * be efficient, because it is not meant to survive.
 */

export type ProductListResult = {
  products: readonly ProductCardData[];
  /** Matches before paging, for the count and the pager. */
  total: number;
  page: number;
  pageCount: number;
};

function isOnSale(product: ProductDetailData): boolean {
  return (
    product.compareAtPrice !== undefined && product.compareAtPrice > product.price
  );
}

function matches(product: ProductDetailData, query: ProductQuery): boolean {
  if (
    query.categories.length > 0 &&
    !query.categories.includes(product.category.slug)
  ) {
    return false;
  }

  // A size or colour counts only when it is actually orderable, so filtering
  // by "M" never surfaces something that has no M left.
  if (
    query.sizes.length > 0 &&
    !product.sizes.some(
      (size) => size.available && query.sizes.includes(size.value.toLowerCase()),
    )
  ) {
    return false;
  }

  if (
    query.colours.length > 0 &&
    !product.colours.some(
      (colour) => colour.available && query.colours.includes(colour.slug),
    )
  ) {
    return false;
  }

  if (query.onSale && !isOnSale(product)) {
    return false;
  }

  if (query.inStockOnly && !product.inStock) {
    return false;
  }

  if (query.minPrice !== undefined && product.price < query.minPrice) {
    return false;
  }

  if (query.maxPrice !== undefined && product.price > query.maxPrice) {
    return false;
  }

  return true;
}

function compare(
  a: ProductDetailData,
  b: ProductDetailData,
  sort: ProductQuery["sort"],
): number {
  switch (sort) {
    case "price-asc":
      return a.price - b.price;
    case "price-desc":
      return b.price - a.price;
    case "name-asc":
      return a.name.localeCompare(b.name);
    case "newest":
      // No timestamps on mock data; the array is newest-first by convention,
      // which a real `createdAt` ordering replaces.
      return mockProducts.indexOf(a) - mockProducts.indexOf(b);
    case "featured":
    default: {
      // Featured first, then sold-out items last: nothing unbuyable at the top.
      const weight = (product: ProductDetailData) =>
        (product.badges.includes("featured") ? -2 : 0) +
        (product.inStock ? 0 : 10);
      return weight(a) - weight(b);
    }
  }
}

export function listMockProducts(query: ProductQuery): ProductListResult {
  const matched = mockProducts
    .filter((product) => matches(product, query))
    .slice()
    .sort((a, b) => compare(a, b, query.sort));

  const pageCount = Math.max(1, Math.ceil(matched.length / productsPerPage));
  const page = Math.min(Math.max(query.page, 1), pageCount);
  const start = (page - 1) * productsPerPage;

  return {
    products: matched.slice(start, start + productsPerPage),
    total: matched.length,
    page,
    pageCount,
  };
}

export function findMockProductBySlug(
  slug: string,
): ProductDetailData | undefined {
  return mockProducts.find((product) => product.slug === slug);
}

export function listMockProductSlugs(): readonly string[] {
  return mockProducts.map((product) => product.slug);
}

export function listMockCategories(): readonly StorefrontCategory[] {
  return mockCategories;
}

/** The newest few, for the home page rail. */
export function listMockNewArrivals(limit = 4): readonly ProductCardData[] {
  return mockProducts.slice(0, limit);
}

/** Other pieces from the same category, for the product page. */
export function listMockRelatedProducts(
  slug: string,
  limit = 4,
): readonly ProductCardData[] {
  const product = findMockProductBySlug(slug);

  if (!product) {
    return [];
  }

  const sameCategory = mockProducts.filter(
    (candidate) =>
      candidate.slug !== slug &&
      candidate.category.slug === product.category.slug,
  );

  // Top up from the rest of the catalogue so the rail is never half empty.
  const others = mockProducts.filter(
    (candidate) =>
      candidate.slug !== slug &&
      candidate.category.slug !== product.category.slug,
  );

  return [...sameCategory, ...others].slice(0, limit);
}

/**
 * Facets built from the data itself, so a filter never offers a value that
 * matches nothing. A real implementation aggregates these in the database.
 */
export function listMockFilterGroups(): readonly FilterGroup[] {
  const sizeCounts = new Map<string, number>();
  const colourCounts = new Map<string, { count: number; name: string; hex: string }>();
  const categoryCounts = new Map<string, number>();

  for (const product of mockProducts) {
    categoryCounts.set(
      product.category.slug,
      (categoryCounts.get(product.category.slug) ?? 0) + 1,
    );

    for (const size of product.sizes) {
      if (size.available) {
        sizeCounts.set(size.value, (sizeCounts.get(size.value) ?? 0) + 1);
      }
    }

    for (const colour of product.colours) {
      if (!colour.available) {
        continue;
      }
      const existing = colourCounts.get(colour.slug);
      colourCounts.set(colour.slug, {
        count: (existing?.count ?? 0) + 1,
        name: colour.name,
        hex: colour.hex,
      });
    }
  }

  return [
    {
      param: "category",
      label: "Category",
      options: mockCategories
        .filter((category) => categoryCounts.has(category.slug))
        .map((category) => ({
          value: category.slug,
          label: category.name,
          count: categoryCounts.get(category.slug),
        })),
    },
    {
      param: "size",
      label: "Size",
      // Ordered smallest to largest. Reading the counts map directly would
      // list them in whatever order the products happened to be walked, which
      // put XS after XXL.
      options: STANDARD_SIZES.filter((size) => sizeCounts.has(size)).map(
        (size) => ({
          value: size.toLowerCase(),
          label: size,
          count: sizeCounts.get(size),
        }),
      ),
    },
    {
      param: "colour",
      label: "Colour",
      options: [...colourCounts.entries()].map(([value, meta]) => ({
        value,
        label: meta.name,
        count: meta.count,
        hex: meta.hex,
      })),
    },
  ];
}
