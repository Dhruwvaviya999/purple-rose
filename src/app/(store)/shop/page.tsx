import type { Metadata } from "next";
import type { Route } from "next";

import { getCategoryBySlug } from "@/lib/services/category-service";
import {
  listFilterGroups,
  listProducts,
} from "@/lib/services/product-service";
import { getWishlistStateFor } from "@/lib/wishlist/page-state";
import {
  activeFilterCount,
  parseProductQuery,
  productQueryParams,
  type ProductQuery,
} from "@/features/storefront/product-query";
import { ActiveFilters } from "@/components/commerce/active-filters";
import { Breadcrumbs } from "@/components/commerce/breadcrumbs";
import { FilterDrawer } from "@/components/commerce/filter-drawer";
import { FilterPanel } from "@/components/commerce/filter-panel";
import { Pagination } from "@/components/commerce/pagination";
import { ProductGrid } from "@/components/commerce/product-grid";
import { SortSelect } from "@/components/commerce/sort-select";
import { EmptyState } from "@/components/shared/empty-state";
import { CompassIcon } from "@/components/shared/icons";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Heading, Text } from "@/components/ui/typography";

const DEFAULT_DESCRIPTION =
  "Every Purple Rose piece: cotton dresses, co-ord sets, short tops and semi-party wear.";

/**
 * Metadata for the listing.
 *
 * A category-filtered listing is a page in its own right, so it gets the SEO
 * copy an operator wrote for that collection and a canonical URL naming it.
 * Nothing here is generated from a slug: a category with no copy falls back to
 * the shop's own description rather than to an invented sentence.
 *
 * **Everything else is `noindex`.** Filters are a combinatorial space, and a
 * search term is unbounded, so indexing them would offer a crawler an infinite
 * number of near-identical pages. `follow` stays on, so the products linked
 * from a filtered view are still discovered. The one canonical route to every
 * product is `/shop/[slug]`, and the sitemap lists it.
 */
export async function generateMetadata(
  props: PageProps<"/shop">,
): Promise<Metadata> {
  const searchParams = await props.searchParams;
  const query = parseProductQuery(searchParams);

  // One category and nothing else: the page is that collection.
  const isPlainCategory =
    query.categories.length === 1 && activeFilterCount(query) === 1;

  const category =
    isPlainCategory && query.categories[0]
      ? await getCategoryBySlug(query.categories[0])
      : null;

  if (category) {
    return {
      title: category.seoTitle ?? category.name,
      description:
        category.seoDescription ?? (category.tagline || DEFAULT_DESCRIPTION),
      alternates: { canonical: `/shop?category=${category.slug}` },
    };
  }

  const narrowed = activeFilterCount(query) > 0;

  return {
    title: "Shop",
    description: DEFAULT_DESCRIPTION,
    alternates: { canonical: "/shop" },
    ...(narrowed ? { robots: { index: false, follow: true } } : {}),
  };
}

/**
 * The listing.
 *
 * A Server Component. Filters and sorting arrive in the query string, are
 * parsed into a typed query, and the results are rendered on the server. Only
 * the controls are interactive, so the grid itself ships no JavaScript and a
 * filtered listing is a shareable URL rather than a state someone else cannot
 * reproduce.
 *
 * ## Rendering and caching
 *
 * Rendered per request, declared rather than inferred. That is the right
 * answer for a listing: the filters are a combinatorial space, and caching a
 * page per combination would fill a cache with URLs nobody visits twice. The
 * work is three short queries against indexed columns, run together.
 *
 * Data comes from `product-service.ts`, which takes the same `ProductQuery`
 * the mock layer took and returns the same presentation types.
 */
export const dynamic = "force-dynamic";
export default async function ShopPage(props: PageProps<"/shop">) {
  const searchParams = await props.searchParams;
  const query = parseProductQuery(searchParams);

  // The listing, its facets and the category heading do not depend on each
  // other, so they are one round of queries rather than three in sequence.
  const [{ products, total, page, pageCount }, groups, selectedCategory] =
    await Promise.all([
      listProducts(query),
      listFilterGroups(query),
      // A single selected category names the page, so arriving from a category
      // link reads as that category rather than as an unexplained subset. With
      // two or more selected there is no single name to use.
      query.categories.length === 1 && query.categories[0]
        ? getCategoryBySlug(query.categories[0])
        : null,
    ]);

  const filterCount = activeFilterCount(query);

  // One lookup for the whole grid, after the ids are known. Nothing for a
  // visitor who is not signed in: `getWishlistStateFor` returns before it
  // queries, so anonymous browsing does not touch the wishlist tables at all.
  const wishlisted = await getWishlistStateFor(
    products.map((product) => product.id),
  );

  const heading = query.search
    ? `Results for “${query.search}”`
    : (selectedCategory?.name ?? "Everything");

  const intro = query.search
    ? total === 0
      ? "Nothing matched. Try a shorter term, or browse the collections."
      : `${total} ${total === 1 ? "piece" : "pieces"} matching that search.`
    : (selectedCategory?.tagline ||
      "Considered pieces in fabrics that hold up, cut to be worn rather than kept for later.");

  return (
    <Section spacing="sm">
      <Container>
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            ...(selectedCategory
              ? ([
                  { label: "Shop", href: "/shop" as Route },
                  { label: selectedCategory.name },
                ] as const)
              : ([{ label: "Shop" }] as const)),
          ]}
        />

        <div className="mt-6 max-w-2xl">
          <Heading as="h1" level="xl">
            {heading}
          </Heading>
          <Text size="lg" className="mt-4">
            {intro}
          </Text>
        </div>

        <div className="mt-10 lg:flex lg:gap-12">
          {/* Desktop sidebar. The same controls the drawer holds. */}
          <aside
            aria-labelledby="shop-filters"
            className="hidden lg:block lg:w-60 lg:shrink-0"
          >
            <h2
              id="shop-filters"
              className="font-display text-xl font-light text-ink"
            >
              Filter
            </h2>
            <FilterPanel groups={groups} className="mt-6" />
          </aside>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
              <div className="flex items-center gap-3">
                <div className="lg:hidden">
                  <FilterDrawer groups={groups} activeCount={filterCount} />
                </div>

                {/* Announced politely, so a filter change tells a screen
                    reader user how many pieces are left. */}
                <p
                  aria-live="polite"
                  className="font-sans text-sm text-ink-muted"
                >
                  {total === 0
                    ? "No pieces"
                    : `${total} ${total === 1 ? "piece" : "pieces"}`}
                </p>
              </div>

              <SortSelect value={query.sort} />
            </div>

            {filterCount > 0 ? (
              <ActiveFilters query={query} groups={groups} className="mt-4" />
            ) : null}

            {products.length > 0 ? (
              <>
                <ProductGrid
                  products={products}
                  wishlisted={wishlisted}
                  priorityCount={4}
                  className="mt-8"
                />
                <Pagination
                  page={page}
                  pageCount={pageCount}
                  hrefFor={(target) => pageHref(searchParams, target)}
                  className="mt-14"
                />
              </>
            ) : (
              <NoMatches query={query} />
            )}
          </div>
        </div>
      </Container>
    </Section>
  );
}

/**
 * A page link that keeps every other filter in place. Built from the raw
 * parameters rather than the parsed query so nothing unrelated is dropped.
 */
function pageHref(
  searchParams: Awaited<PageProps<"/shop">["searchParams"]>,
  page: number,
): Route {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === productQueryParams.page || value === undefined) {
      continue;
    }

    for (const entry of Array.isArray(value) ? value : [value]) {
      params.append(key, entry);
    }
  }

  if (page > 1) {
    params.set(productQueryParams.page, String(page));
  }

  const queryString = params.toString();
  return (queryString ? `/shop?${queryString}` : "/shop") as Route;
}

/**
 * Nothing matched. Distinguishes "what you asked for is too narrow", which has
 * an obvious fix, from "the catalogue is empty", which does not and which only
 * happens before anything has been published.
 */
function NoMatches({ query }: { query: ProductQuery }) {
  const narrowed = activeFilterCount(query) > 0;

  return (
    <div className="mt-8 rounded-card border border-dashed border-line-strong bg-surface px-6 py-16 sm:py-20">
      <EmptyState
        icon={<CompassIcon />}
        title={
          query.search
            ? "Nothing matched that search"
            : narrowed
              ? "Nothing matches those filters"
              : "Nothing to browse yet"
        }
        description={
          query.search
            ? "Try a shorter term, a colour, or the name of a collection."
            : narrowed
              ? "Try removing a filter or widening the price range."
              : "No pieces have been published yet. They appear here as soon as they are."
        }
        action={
          <ButtonLink href="/shop" variant="secondary">
            {narrowed ? "Clear filters" : "Back to home"}
          </ButtonLink>
        }
      />
    </div>
  );
}
