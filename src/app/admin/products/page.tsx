import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

import { requireAdmin } from "@/lib/auth/current-user";
import {
  adminProductHref,
  hasAdminFilters,
  parseAdminProductQuery,
} from "@/lib/admin/product-admin-query";
import { listAdminProducts } from "@/lib/services/admin/product-admin-service";
import { listAdminCategories } from "@/lib/services/admin/category-admin-service";
import { formatPrice } from "@/lib/utils/format-price";
import {
  AdminEmptyState,
  AdminPageHeader,
  MerchandisingFlags,
  StatusPill,
  StockSummary,
  formatAdminDate,
} from "@/features/admin/components/admin-ui";
import { AdminProductFilters } from "@/features/admin/components/product-filters";
import { Pagination } from "@/components/commerce/pagination";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Products" };

/**
 * The product list.
 *
 * A Server Component. Filters and sorting arrive in the query string, are
 * parsed into a typed query, and the rows are rendered on the server — the
 * same arrangement the storefront listing uses, for the same reasons: a
 * filtered view is a shareable URL, and only the controls ship JavaScript.
 *
 * ## Desktop and phone are different layouts, not one squeezed
 *
 * From `lg` up this is a table, because comparing twenty products down a
 * column is what a table is for, and `<th scope>` gives a screen reader the
 * same column headers a sighted user gets. Below that it is a list of cards.
 *
 * A table forced into 360 pixels is either unreadable or a horizontal scroll
 * that hides the actions column, and hiding the actions column on the device
 * where somebody is most likely checking stock on a shop floor is the wrong
 * trade. Both layouts render from the same data and both are always in the
 * markup; CSS chooses.
 */
export default async function AdminProductsPage(
  props: PageProps<"/admin/products">,
) {
  await requireAdmin("/admin/products");

  const searchParams = await props.searchParams;
  const query = parseAdminProductQuery(searchParams);

  const [{ products, total, page, pageCount }, categories] = await Promise.all([
    listAdminProducts(query),
    listAdminCategories(),
  ]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Products"
        description="Everything in the catalogue, including drafts and archived pieces. The shop only ever shows the live ones."
        actions={
          <ButtonLink href="/admin/products/new" size="sm">
            Add product
          </ButtonLink>
        }
      />

      <AdminProductFilters
        query={query}
        categories={categories.map((category) => ({
          slug: category.slug,
          name: category.name,
        }))}
        resultCount={total}
      />

      {products.length === 0 ? (
        <AdminEmptyState
          title={
            hasAdminFilters(query)
              ? "No products match those filters"
              : "The catalogue is empty"
          }
          description={
            hasAdminFilters(query)
              ? "Try a shorter search, a different status, or clear the filters to see everything."
              : "Products you create appear here. Each one starts as a draft, so nothing reaches the shop before you publish it."
          }
          action={
            hasAdminFilters(query) ? (
              <ButtonLink href="/admin/products" variant="secondary" size="sm">
                Clear filters
              </ButtonLink>
            ) : (
              <ButtonLink href="/admin/products/new" size="sm">
                Add the first product
              </ButtonLink>
            )
          }
        />
      ) : (
        <>
          {/* Phone and tablet: one card per product. */}
          <ul className="space-y-3 lg:hidden">
            {products.map((product) => (
              <li
                key={product.id}
                className="rounded-card border border-line bg-canvas p-4"
              >
                <div className="flex gap-3">
                  <ProductThumbnail product={product} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <Link
                        href={`/admin/products/${product.id}`}
                        className="inline-block py-1 font-sans text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
                      >
                        {product.name}
                      </Link>
                      <StatusPill status={product.status} />
                    </div>
                    <p className="mt-0.5 font-sans text-xs text-ink-subtle">
                      {product.articleNumber} · {product.category.name}
                    </p>
                    <p className="mt-1.5 font-sans text-sm text-ink">
                      <ProductPrice product={product} />
                    </p>
                    <div className="mt-2">
                      <StockSummary {...product.stock} />
                    </div>
                    <div className="mt-2">
                      <MerchandisingFlags
                        featured={product.featured}
                        newArrival={product.newArrival}
                        bestSeller={product.bestSeller}
                        seasonal={product.seasonal}
                        onSale={isOnSale(product)}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
                  <span className="font-sans text-xs text-ink-subtle">
                    Updated {formatAdminDate(product.updatedAt)}
                  </span>
                  <ButtonLink
                    href={`/admin/products/${product.id}` as Route}
                    variant="secondary"
                    size="sm"
                  >
                    Edit
                  </ButtonLink>
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: a real table, with real column headers. */}
          <div className="hidden overflow-hidden rounded-card border border-line bg-canvas lg:block">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">
                Catalogue products, {total} in total
              </caption>
              <thead>
                <tr className="border-b border-line bg-surface">
                  <Th className="w-[34%]">Product</Th>
                  <Th>Status</Th>
                  <Th>Price</Th>
                  <Th>Stock</Th>
                  <Th>Flags</Th>
                  <Th>Updated</Th>
                  <Th>
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {products.map((product) => (
                  <tr key={product.id} className="align-top hover:bg-surface/60">
                    <th scope="row" className="px-4 py-3 font-normal">
                      <div className="flex gap-3">
                        <ProductThumbnail product={product} />
                        <div className="min-w-0">
                          <Link
                            href={`/admin/products/${product.id}`}
                            className="inline-block py-1 font-sans text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
                          >
                            {product.name}
                          </Link>
                          <p className="mt-0.5 font-sans text-xs text-ink-subtle">
                            {product.articleNumber}
                          </p>
                          <p className="font-sans text-xs text-ink-subtle">
                            {product.category.name}
                          </p>
                        </div>
                      </div>
                    </th>
                    <Td>
                      <StatusPill status={product.status} />
                    </Td>
                    <Td>
                      <span className="font-sans text-sm text-ink">
                        <ProductPrice product={product} />
                      </span>
                    </Td>
                    <Td>
                      <StockSummary {...product.stock} />
                    </Td>
                    <Td>
                      <MerchandisingFlags
                        featured={product.featured}
                        newArrival={product.newArrival}
                        bestSeller={product.bestSeller}
                        seasonal={product.seasonal}
                        onSale={isOnSale(product)}
                      />
                    </Td>
                    <Td>
                      <span className="whitespace-nowrap font-sans text-xs text-ink-subtle">
                        {formatAdminDate(product.updatedAt)}
                      </span>
                    </Td>
                    <Td>
                      <ButtonLink
                        href={`/admin/products/${product.id}` as Route}
                        variant="secondary"
                        size="sm"
                      >
                        Edit
                        <span className="sr-only"> {product.name}</span>
                      </ButtonLink>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageCount={pageCount}
            hrefFor={(target) =>
              adminProductHref(query, { page: target }) as Route
            }
            className="pt-2"
          />
        </>
      )}
    </div>
  );
}

type Row = Awaited<ReturnType<typeof listAdminProducts>>["products"][number];

function isOnSale(product: Row): boolean {
  return product.compareAtPrice !== null && product.compareAtPrice > product.price;
}

/**
 * The card image, or a placeholder box.
 *
 * A product with no photograph is a real state in the admin area — it is what
 * a half-finished draft looks like — so the cell says so rather than rendering
 * a broken image.
 */
function ProductThumbnail({ product }: { product: Row }) {
  if (!product.image) {
    return (
      <span className="flex size-12 shrink-0 items-center justify-center rounded-control border border-dashed border-line-strong bg-surface text-center font-sans text-[0.625rem] leading-tight text-ink-subtle">
        No photo
      </span>
    );
  }

  return (
    <span className="relative size-12 shrink-0 overflow-hidden rounded-control bg-surface">
      <Image
        src={product.image.url}
        alt=""
        aria-hidden="true"
        fill
        sizes="48px"
        className="object-cover"
      />
    </span>
  );
}

/** The price, with the previous one struck through when it is a reduction. */
function ProductPrice({ product }: { product: Row }) {
  if (!isOnSale(product) || product.compareAtPrice === null) {
    return <>{formatPrice(product.price)}</>;
  }

  return (
    <>
      {formatPrice(product.price)}{" "}
      <span className="text-ink-subtle">
        <span className="sr-only">was </span>
        <s>{formatPrice(product.compareAtPrice)}</s>
      </span>
    </>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={`px-4 py-2.5 font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3">{children}</td>;
}
