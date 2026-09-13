import { defaultSort, sortOptions } from "@/config/storefront";
import type { ProductSortValue } from "@/types/commerce";

/**
 * The URL contract for a product listing.
 *
 * Filters and sorting live in the query string rather than in client state,
 * which is what makes a filtered listing shareable, bookmarkable, restorable
 * on back, and renderable on the server. The filter controls write here; the
 * page reads here.
 *
 * This file is **not** mock scaffolding. Phase 5 keeps it exactly as is and
 * feeds the parsed query to a database call instead of to an array.
 *
 * Everything arriving from a URL is attacker-controlled, so each value is
 * parsed into a known shape and anything unrecognised is dropped rather than
 * passed along.
 */

/** What Next.js hands a page as `searchParams`. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export type ProductQuery = {
  categories: readonly string[];
  sizes: readonly string[];
  colours: readonly string[];
  /** Only reduced items. */
  onSale: boolean;
  /** Hide anything out of stock. */
  inStockOnly: boolean;
  /** Inclusive bounds in minor units, when given. */
  minPrice?: number;
  maxPrice?: number;
  sort: ProductSortValue;
  page: number;
};

/** URL parameter names, defined once so controls and parser cannot drift. */
export const productQueryParams = {
  category: "category",
  size: "size",
  colour: "colour",
  sale: "sale",
  inStock: "in-stock",
  minPrice: "min",
  maxPrice: "max",
  sort: "sort",
  page: "page",
} as const;

/** A slug-ish token. Anything else is discarded rather than trusted. */
const TOKEN = /^[a-z0-9][a-z0-9-]{0,40}$/i;

function readList(raw: string | string[] | undefined): string[] {
  if (!raw) {
    return [];
  }

  const values = Array.isArray(raw) ? raw : raw.split(",");

  return Array.from(
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter((value) => TOKEN.test(value)),
    ),
    // A bounded list: a URL cannot be used to force a thousand-term query.
  ).slice(0, 24);
}

function readFlag(raw: string | string[] | undefined): boolean {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "true" || value === "1";
}

function readPositiveInt(
  raw: string | string[] | undefined,
  max: number,
): number | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > max) {
    return undefined;
  }

  return parsed;
}

export function parseProductQuery(params: RawSearchParams): ProductQuery {
  const sortRaw = Array.isArray(params[productQueryParams.sort])
    ? params[productQueryParams.sort]?.[0]
    : params[productQueryParams.sort];

  const sort = sortOptions.some((option) => option.value === sortRaw)
    ? (sortRaw as ProductSortValue)
    : defaultSort;

  // Prices arrive in whole rupees, which is what a shopper sees, and are held
  // internally in minor units like every other amount.
  const minRupees = readPositiveInt(params[productQueryParams.minPrice], 1_000_000);
  const maxRupees = readPositiveInt(params[productQueryParams.maxPrice], 1_000_000);

  return {
    categories: readList(params[productQueryParams.category]),
    sizes: readList(params[productQueryParams.size]),
    colours: readList(params[productQueryParams.colour]),
    onSale: readFlag(params[productQueryParams.sale]),
    inStockOnly: readFlag(params[productQueryParams.inStock]),
    minPrice: minRupees === undefined ? undefined : minRupees * 100,
    maxPrice: maxRupees === undefined ? undefined : maxRupees * 100,
    sort,
    page: readPositiveInt(params[productQueryParams.page], 9999) || 1,
  };
}

/** True when anything narrows the listing, which decides whether to offer a reset. */
export function hasActiveFilters(query: ProductQuery): boolean {
  return (
    query.categories.length > 0 ||
    query.sizes.length > 0 ||
    query.colours.length > 0 ||
    query.onSale ||
    query.inStockOnly ||
    query.minPrice !== undefined ||
    query.maxPrice !== undefined
  );
}

export function activeFilterCount(query: ProductQuery): number {
  return (
    query.categories.length +
    query.sizes.length +
    query.colours.length +
    (query.onSale ? 1 : 0) +
    (query.inStockOnly ? 1 : 0) +
    (query.minPrice !== undefined || query.maxPrice !== undefined ? 1 : 0)
  );
}
