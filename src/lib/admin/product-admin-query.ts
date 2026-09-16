import { ProductStatus } from "@/generated/prisma/enums";

/**
 * The URL contract for the admin product list.
 *
 * Deliberately a separate contract from the storefront's
 * `features/storefront/product-query.ts`, not a widened version of it. The two
 * listings answer different questions: a shopper filters by colour and size
 * and never sees a draft, an administrator filters by status and stock health
 * and mostly cares about drafts. Bolting admin-only filters onto the shopper's
 * parser would put "show me archived products" one typo away from the public
 * storefront.
 *
 * What they do share is the shape of the idea: filters live in the query
 * string, so an admin search is shareable and survives a reload, and the page
 * stays a Server Component.
 *
 * Everything arriving here is attacker-controlled — an administrator's URL bar
 * is still a URL bar — so each value is reduced to something known and
 * anything unrecognised is dropped rather than passed to Prisma.
 */

export type RawSearchParams = Record<string, string | string[] | undefined>;

/** How the admin list may be ordered. */
export const adminSortValues = [
  "updated-desc",
  "created-desc",
  "name-asc",
  "price-asc",
  "price-desc",
  "stock-asc",
  "status-asc",
] as const;

export type AdminSortValue = (typeof adminSortValues)[number];

export const adminSortOptions: readonly { value: AdminSortValue; label: string }[] = [
  { value: "updated-desc", label: "Recently updated" },
  { value: "created-desc", label: "Recently created" },
  { value: "name-asc", label: "Name: A to Z" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "stock-asc", label: "Stock: lowest first" },
  { value: "status-asc", label: "Status" },
] as const;

export const defaultAdminSort: AdminSortValue = "updated-desc";

/** Stock health, derived from inventory rather than stored. */
export const stockFilters = ["in-stock", "low", "out"] as const;
export type StockFilter = (typeof stockFilters)[number];

/** The merchandising flags, filterable one at a time. */
export const merchandisingFilters = [
  "featured",
  "new",
  "bestseller",
  "seasonal",
  "sale",
] as const;
export type MerchandisingFilter = (typeof merchandisingFilters)[number];

export type AdminProductQuery = {
  /** Matches name, slug, article number or variant SKU. */
  search?: string;
  /** Absent means every status, including drafts and archived. */
  status?: ProductStatus;
  /** Category slug. */
  category?: string;
  merchandising?: MerchandisingFilter;
  stock?: StockFilter;
  sort: AdminSortValue;
  page: number;
};

export const adminProductParams = {
  search: "q",
  status: "status",
  category: "category",
  merchandising: "flag",
  stock: "stock",
  sort: "sort",
  page: "page",
} as const;

/** How many rows a page of the admin list holds. */
export const adminPageSize = 20;

const MAX_SEARCH_LENGTH = 80;

function first(raw: string | string[] | undefined): string | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value?.trim() || undefined;
}

/**
 * A free-text term.
 *
 * Control characters replaced, whitespace collapsed, length capped. It reaches
 * Prisma as a bound parameter and is never built into SQL, so the cap is about
 * keeping a query sane rather than about escaping. Written as a code-point test
 * rather than a character class so no literal control bytes end up in this file.
 */
function readTerm(raw: string | string[] | undefined): string | undefined {
  const value = first(raw);

  if (!value) {
    return undefined;
  }

  let cleaned = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    cleaned += code < 0x20 || code === 0x7f ? " " : character;
  }

  const collapsed = cleaned.trim().replace(/\s+/g, " ");
  return collapsed ? collapsed.slice(0, MAX_SEARCH_LENGTH) : undefined;
}

function readOneOf<T extends string>(
  raw: string | string[] | undefined,
  allowed: readonly T[],
): T | undefined {
  const value = first(raw);
  return allowed.find((candidate) => candidate === value);
}

/** A slug-shaped token, or nothing. */
const TOKEN = /^[a-z0-9][a-z0-9-]{0,60}$/;

export function parseAdminProductQuery(params: RawSearchParams): AdminProductQuery {
  const category = first(params[adminProductParams.category])?.toLowerCase();
  const page = Number.parseInt(first(params[adminProductParams.page]) ?? "", 10);

  return {
    search: readTerm(params[adminProductParams.search]),
    status: readOneOf(params[adminProductParams.status], Object.values(ProductStatus)),
    category: category && TOKEN.test(category) ? category : undefined,
    merchandising: readOneOf(params[adminProductParams.merchandising], merchandisingFilters),
    stock: readOneOf(params[adminProductParams.stock], stockFilters),
    sort: readOneOf(params[adminProductParams.sort], adminSortValues) ?? defaultAdminSort,
    page: Number.isSafeInteger(page) && page >= 1 && page <= 9999 ? page : 1,
  };
}

/** True when anything narrows the list, which decides whether to offer a reset. */
export function hasAdminFilters(query: AdminProductQuery): boolean {
  return Boolean(
    query.search ||
      query.status ||
      query.category ||
      query.merchandising ||
      query.stock,
  );
}

/**
 * Rebuild the query string with one parameter changed.
 *
 * Used by every control on the list. Changing anything but the page resets to
 * page one, because staying on page four of a narrower result set usually
 * shows nothing.
 */
export function adminProductHref(
  query: AdminProductQuery,
  change: Partial<AdminProductQuery>,
): string {
  const next: AdminProductQuery = { ...query, ...change };
  const params = new URLSearchParams();

  if (next.search) params.set(adminProductParams.search, next.search);
  if (next.status) params.set(adminProductParams.status, next.status);
  if (next.category) params.set(adminProductParams.category, next.category);
  if (next.merchandising) params.set(adminProductParams.merchandising, next.merchandising);
  if (next.stock) params.set(adminProductParams.stock, next.stock);
  if (next.sort !== defaultAdminSort) params.set(adminProductParams.sort, next.sort);

  const page = "page" in change ? next.page : 1;
  if (page > 1) params.set(adminProductParams.page, String(page));

  const queryString = params.toString();
  return queryString ? `/admin/products?${queryString}` : "/admin/products";
}
