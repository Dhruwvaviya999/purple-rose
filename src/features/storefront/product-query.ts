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
 * This file is **not** mock scaffolding. Phase 5 kept it and feeds the parsed
 * query to `product-service.ts` instead of to an array. It grew four
 * attribute groups, three merchandising flags and a search term, which the
 * Phase 4 interface had drawn but not yet parsed; nothing that existed
 * changed name or meaning.
 *
 * It owns the URL and nothing else. It does not know Prisma exists, and the
 * services do not read a query string. The seam between them is `ProductQuery`.
 *
 * Everything arriving from a URL is attacker-controlled, so each value is
 * parsed into a known shape and anything unrecognised is dropped rather than
 * passed along. That is the first of two gates: the service then resolves
 * tokens against real rows and real enum values, so an unknown token narrows
 * nothing rather than reaching the database.
 */

/** What Next.js hands a page as `searchParams`. */
export type RawSearchParams = Record<string, string | string[] | undefined>;

export type ProductQuery = {
  /**
   * What the shopper typed. Free text, so it is length-capped and stripped of
   * control characters here and never interpolated into SQL downstream.
   */
  search?: string;
  categories: readonly string[];
  sizes: readonly string[];
  colours: readonly string[];
  /** Attribute vocabularies, as URL tokens: `cotton-poplin`, `a-line`. */
  fabrics: readonly string[];
  patterns: readonly string[];
  fits: readonly string[];
  occasions: readonly string[];
  /** Only reduced items. */
  onSale: boolean;
  /** Hide anything out of stock. */
  inStockOnly: boolean;
  /** Merchandising flags, set by the shop rather than derived from sales. */
  newArrivalsOnly: boolean;
  featuredOnly: boolean;
  bestSellersOnly: boolean;
  /** Inclusive bounds in minor units, when given. */
  minPrice?: number;
  maxPrice?: number;
  sort: ProductSortValue;
  page: number;
};

/** URL parameter names, defined once so controls and parser cannot drift. */
export const productQueryParams = {
  search: "q",
  category: "category",
  size: "size",
  colour: "colour",
  fabric: "fabric",
  pattern: "pattern",
  fit: "fit",
  occasion: "occasion",
  sale: "sale",
  inStock: "in-stock",
  newArrival: "new",
  featured: "featured",
  bestSeller: "bestseller",
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

/**
 * Replace every C0 control character, and DEL, with a space.
 *
 * Written as a code-point test rather than a regular expression because a
 * character class spelling out control characters puts literal control bytes
 * into this file, where nothing can read them and an editor may silently
 * mangle them. Comparing code points says exactly the same thing in
 * characters anyone can see.
 */
function stripControlCharacters(value: string): string {
  let cleaned = "";

  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    cleaned += code < 0x20 || code === 0x7f ? " " : character;
  }

  return cleaned;
}

/** The longest search term accepted. Past this it is not a search. */
const MAX_SEARCH_LENGTH = 80;

/**
 * A free-text term.
 *
 * Unlike every other value here this cannot be reduced to a known token, so it
 * is cleaned instead: control characters removed, whitespace collapsed, length
 * capped. It is passed to Prisma as a bound parameter, never built into SQL,
 * so the cap is about keeping a query sane rather than about escaping.
 */
function readTerm(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (!value) {
    return undefined;
  }

  const cleaned = stripControlCharacters(value).trim().replace(/\s+/g, " ");

  return cleaned ? cleaned.slice(0, MAX_SEARCH_LENGTH) : undefined;
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
    search: readTerm(params[productQueryParams.search]),
    categories: readList(params[productQueryParams.category]),
    sizes: readList(params[productQueryParams.size]),
    colours: readList(params[productQueryParams.colour]),
    fabrics: readList(params[productQueryParams.fabric]),
    patterns: readList(params[productQueryParams.pattern]),
    fits: readList(params[productQueryParams.fit]),
    occasions: readList(params[productQueryParams.occasion]),
    onSale: readFlag(params[productQueryParams.sale]),
    inStockOnly: readFlag(params[productQueryParams.inStock]),
    newArrivalsOnly: readFlag(params[productQueryParams.newArrival]),
    featuredOnly: readFlag(params[productQueryParams.featured]),
    bestSellersOnly: readFlag(params[productQueryParams.bestSeller]),
    minPrice: minRupees === undefined ? undefined : minRupees * 100,
    maxPrice: maxRupees === undefined ? undefined : maxRupees * 100,
    sort,
    page: readPositiveInt(params[productQueryParams.page], 9999) || 1,
  };
}

/**
 * How many things are narrowing the listing.
 *
 * A price range counts as one however many bounds are set, because it is one
 * control and it is removed as one. The search term counts too: it narrows the
 * results exactly as a filter does, it is shown as a removable chip, and
 * leaving it out would let someone search, see nothing, and be told there are
 * no filters to clear.
 */
export function activeFilterCount(query: ProductQuery): number {
  return (
    (query.search ? 1 : 0) +
    query.categories.length +
    query.sizes.length +
    query.colours.length +
    query.fabrics.length +
    query.patterns.length +
    query.fits.length +
    query.occasions.length +
    (query.onSale ? 1 : 0) +
    (query.inStockOnly ? 1 : 0) +
    (query.newArrivalsOnly ? 1 : 0) +
    (query.featuredOnly ? 1 : 0) +
    (query.bestSellersOnly ? 1 : 0) +
    (query.minPrice !== undefined || query.maxPrice !== undefined ? 1 : 0)
  );
}

/** True when anything narrows the listing, which decides whether to offer a reset. */
export function hasActiveFilters(query: ProductQuery): boolean {
  return activeFilterCount(query) > 0;
}
