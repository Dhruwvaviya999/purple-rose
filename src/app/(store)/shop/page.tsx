import type { Metadata } from "next";
import type { Route } from "next";

import {
  listMockCategories,
  listMockFilterGroups,
  listMockProducts,
} from "@/features/storefront/mock/query";
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

export const metadata: Metadata = {
  title: "Shop",
  description:
    "Every Purple Rose piece: cotton dresses, co-ord sets, short tops and semi-party wear.",
};

/**
 * The listing.
 *
 * A Server Component. Filters and sorting arrive in the query string, are
 * parsed into a typed query, and the results are rendered on the server. Only
 * the controls are interactive, so the grid itself ships no JavaScript and a
 * filtered listing is a shareable URL rather than a state someone else cannot
 * reproduce.
 *
 * Data comes from the mock layer. That is the whole of what Phase 5 replaces
 * here: `listMockProducts(query)` becomes a service call taking the same
 * `ProductQuery` and returning the same shape.
 */
export default async function ShopPage(props: PageProps<"/shop">) {
  const searchParams = await props.searchParams;
  const query = parseProductQuery(searchParams);

  const groups = listMockFilterGroups();
  const categories = listMockCategories();
  const { products, total, page, pageCount } = listMockProducts(query);

  const filterCount = activeFilterCount(query);

  // The single selected category names the page, so arriving from a category
  // link reads as that category rather than as an unexplained subset.
  const selectedCategory =
    query.categories.length === 1
      ? categories.find((entry) => entry.slug === query.categories[0])
      : undefined;

  const heading = selectedCategory?.name ?? "Everything";
  const intro =
    selectedCategory?.tagline ??
    "Considered pieces in fabrics that hold up, cut to be worn rather than kept for later.";

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
 * Nothing matched. Distinguishes "your filters are too narrow", which has an
 * obvious fix, from "there is no catalogue yet", which does not.
 */
function NoMatches({ query }: { query: ProductQuery }) {
  const narrowed = activeFilterCount(query) > 0;

  return (
    <div className="mt-8 rounded-card border border-dashed border-line-strong bg-surface px-6 py-16 sm:py-20">
      <EmptyState
        icon={<CompassIcon />}
        title={narrowed ? "Nothing matches those filters" : "Nothing to browse yet"}
        description={
          narrowed
            ? "Try removing a filter or widening the price range."
            : "Categories and pieces load from the store database. Once it is connected, this page becomes the full catalogue."
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
