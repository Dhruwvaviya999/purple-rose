import "server-only";

import type { ProductQuery } from "@/features/storefront/product-query";
import type { ProductSortValue } from "@/types/commerce";
import { ProductStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import {
  fabricVocabulary,
  fitVocabulary,
  occasionVocabulary,
  patternVocabulary,
  tokensToValues,
} from "./vocabulary";

/**
 * Turning a parsed URL into a Prisma query.
 *
 * This is the one place a `ProductQuery` becomes SQL. The listing, the total
 * count and every facet count build their `where` here, which is what makes a
 * facet count agree with the number of results it predicts: they cannot drift,
 * because there is only one definition.
 *
 * ## Filter semantics
 *
 * **Groups are ANDed; values inside a group are ORed.** Ticking Pink and Blue
 * means "either colour"; ticking Pink and then M means "pink *and* in M".
 * Nothing here ever ORs two different groups together.
 *
 * **Size and colour are evaluated against the same variant.** A product
 * matches `colour=pink&size=m` only when one orderable variant is both pink
 * and M. Checking them separately would return a dress that comes in pink (in
 * S only) and in M (in blue only), which is not a pink dress in M. This is
 * stricter than the Phase 4 mock, which checked the two lists independently,
 * and the change is deliberate: it is the answer a shopper is asking for.
 *
 * **A size or colour counts only when it is orderable.** Filtering by M never
 * surfaces a garment with no M left. That is the Phase 4 behaviour, kept, and
 * it is also what keeps the facet counts honest.
 *
 * **Draft and archived products do not exist.** `status: ACTIVE` is added
 * here, unconditionally, rather than by each caller remembering to.
 */

/** The filter groups that have facet counts, and so can be self-excluded. */
export type FilterGroupKey =
  | "category"
  | "size"
  | "colour"
  | "fabric"
  | "pattern"
  | "fit"
  | "occasion";

/**
 * A variant somebody could actually order: live, and with stock behind it.
 *
 * `inventory: { is: ... }` rather than a column on the variant, because stock
 * lives in its own table. A variant with no inventory row at all is treated as
 * unavailable, which is the safe reading of missing stock data.
 */
export const orderableVariant = {
  isActive: true,
  inventory: { is: { quantity: { gt: 0 } } },
} as const satisfies Prisma.ProductVariantWhereInput;

/** At most this many words are taken from a search term. */
const MAX_SEARCH_TOKENS = 6;

/**
 * Where a search term is looked for.
 *
 * Name, the short description, the article number, the collections a product
 * sits in and the colours it comes in. The long description is deliberately
 * left out: it is prose, and matching inside it returns a dress because the
 * copy mentions the word "linen" in passing.
 *
 * `contains` compiles to `ILIKE '%term%'`, which PostgreSQL answers with a
 * sequential scan. For a catalogue of this size that is a sub-millisecond
 * scan of a few dozen rows and the right amount of machinery. The upgrade
 * path is a generated `tsvector` column with a GIN index, or a `pg_trgm`
 * index for the same `ILIKE`, and it replaces the body of this one function.
 * No caller and no component changes, because the contract is `ProductQuery`
 * in, `Prisma.ProductWhereInput` out.
 */
function buildSearchWhere(term: string): Prisma.ProductWhereInput[] {
  const tokens = term
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TOKENS);

  // Every word has to be found somewhere, so "pink linen" does not return
  // everything pink plus everything linen.
  return tokens.map((token) => ({
    OR: [
      { name: { contains: token, mode: "insensitive" } },
      { shortDescription: { contains: token, mode: "insensitive" } },
      { articleNumber: { contains: token, mode: "insensitive" } },
      {
        categories: {
          some: {
            category: { isActive: true, name: { contains: token, mode: "insensitive" } },
          },
        },
      },
      {
        variants: {
          some: {
            isActive: true,
            color: { isActive: true, name: { contains: token, mode: "insensitive" } },
          },
        },
      },
    ],
  }));
}

/**
 * Build the `where` for a listing.
 *
 * `exclude` drops one or more groups, which is how a facet count is made for
 * a group without that group narrowing its own options. See
 * `buildFilterGroups` in the product service.
 */
export function buildProductWhere(
  query: ProductQuery,
  exclude: readonly FilterGroupKey[] = [],
): Prisma.ProductWhereInput {
  const skip = new Set(exclude);
  const where: Prisma.ProductWhereInput = { status: ProductStatus.ACTIVE };
  const and: Prisma.ProductWhereInput[] = [];

  if (query.search) {
    and.push(...buildSearchWhere(query.search));
  }

  if (!skip.has("category") && query.categories.length > 0) {
    where.categories = {
      some: {
        category: { isActive: true, slug: { in: [...query.categories] } },
      },
    };
  }

  // Size and colour meet on one variant, so they are one clause rather than
  // two. When neither is selected the clause exists only if "in stock" is
  // ticked, and then it asks nothing more than "something is orderable".
  const wantSizes = !skip.has("size") && query.sizes.length > 0;
  const wantColours = !skip.has("colour") && query.colours.length > 0;

  if (wantSizes || wantColours || query.inStockOnly) {
    const variant: Prisma.ProductVariantWhereInput = { ...orderableVariant };

    if (wantSizes) {
      // Sizes travel down the URL in lower case and are stored uppercase, so
      // one canonical form is compared rather than two spellings.
      variant.size = {
        isActive: true,
        code: { in: query.sizes.map((code) => code.toUpperCase()) },
      };
    }

    if (wantColours) {
      variant.color = { isActive: true, slug: { in: [...query.colours] } };
    }

    where.variants = { some: variant };
  }

  if (!skip.has("fabric") && query.fabrics.length > 0) {
    where.fabric = { in: tokensToValues(fabricVocabulary, query.fabrics) };
  }

  if (!skip.has("pattern") && query.patterns.length > 0) {
    where.pattern = { in: tokensToValues(patternVocabulary, query.patterns) };
  }

  if (!skip.has("fit") && query.fits.length > 0) {
    where.fit = { in: tokensToValues(fitVocabulary, query.fits) };
  }

  if (!skip.has("occasion") && query.occasions.length > 0) {
    where.occasion = { in: tokensToValues(occasionVocabulary, query.occasions) };
  }

  if (query.onSale) {
    // The definition of a sale, in the database rather than in a component:
    // there is a previous price and it is higher than the current one. A
    // field reference keeps the comparison in SQL; it is not a string built
    // from user input, so there is nothing here to inject into.
    and.push({ compareAtPrice: { not: null } });
    and.push({ compareAtPrice: { gt: prisma.product.fields.price } });
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.price = {
      ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
      ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
    };
  }

  if (query.newArrivalsOnly) {
    where.newArrival = true;
  }

  if (query.featuredOnly) {
    where.featured = true;
  }

  if (query.bestSellersOnly) {
    where.bestSeller = true;
  }

  if (and.length > 0) {
    where.AND = and;
  }

  return where;
}

/**
 * How a listing is ordered.
 *
 * Every ordering ends with `id`, so two products with the same price or the
 * same publication date do not swap places between page one and page two.
 * Without that tiebreak, paging through equal rows can show one product twice
 * and skip another.
 *
 * `featured` is the default and means what the shop has chosen to lead with:
 * the featured flag, then the best-seller flag, then newest. Both flags are
 * merchandising, set by whoever runs the shop. Neither is derived from sales,
 * because nothing has been sold yet.
 *
 * Phase 4 also sorted sold-out products to the bottom of the featured order.
 * That is not reproduced here: availability lives in `Inventory`, and ordering
 * a listing by a related table's contents means either a denormalised "in
 * stock" column on `Product` that nothing yet maintains, or a correlated
 * subquery Prisma cannot express. A sold-out piece still carries its badge,
 * and ticking "In stock" removes it outright.
 */
export function buildProductOrderBy(
  sort: ProductSortValue,
): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "price-asc":
      return [{ price: "asc" }, { id: "asc" }];
    case "price-desc":
      return [{ price: "desc" }, { id: "asc" }];
    case "name-asc":
      return [{ name: "asc" }, { id: "asc" }];
    case "newest":
      // Nulls last so an unpublished date never leads the listing. In
      // practice an ACTIVE product always has one.
      return [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "asc" }];
    case "featured":
    default:
      return [
        { featured: "desc" },
        { bestSeller: "desc" },
        { publishedAt: { sort: "desc", nulls: "last" } },
        { id: "asc" },
      ];
  }
}
