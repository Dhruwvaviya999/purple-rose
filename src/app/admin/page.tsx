import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/current-user";
import {
  getCatalogMetrics,
  listLowStockVariants,
  listRecentlyUpdatedProducts,
} from "@/lib/services/admin/catalog-dashboard-service";
import {
  AdminEmptyState,
  AdminPageHeader,
  AdminPanel,
  MetricTile,
  StatusPill,
  formatAdminDate,
} from "@/features/admin/components/admin-ui";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Overview" };

/**
 * Admin overview.
 *
 * **Every number on this page is a fact about the catalogue**, counted by
 * PostgreSQL when the page renders. There is no revenue, no conversion rate,
 * no units sold and no trend line, because there is no order system: nothing
 * in this application knows what has been bought. A dashboard showing a
 * plausible revenue figure would be the most misleading thing in the
 * repository, and the temptation to add one should be resisted until orders
 * exist.
 *
 * What is here is what somebody opening the admin area actually needs: how
 * much of the catalogue is live, what is still a draft, what is about to run
 * out, and what they were last working on.
 *
 * The role is checked here as well as in the layout. That is not redundant: a
 * layout and the page beneath it render concurrently, so a layout that
 * redirects does not reliably prevent this page from producing output.
 */
export default async function AdminOverviewPage() {
  await requireAdmin("/admin");

  const [metrics, lowStock, recent] = await Promise.all([
    getCatalogMetrics(),
    listLowStockVariants(6),
    listRecentlyUpdatedProducts(6),
  ]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Catalogue overview"
        description="Counts read from the database as this page rendered. There are no sales figures here: no order system exists yet, so nothing in this application knows what has been bought."
        actions={
          <ButtonLink href="/admin/products/new" size="sm">
            Add product
          </ButtonLink>
        }
      />

      <section aria-labelledby="catalogue-metrics">
        <h2 id="catalogue-metrics" className="sr-only">
          Catalogue metrics
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Products"
            value={metrics.products.total}
            detail={`${metrics.products.active} live · ${metrics.products.draft} draft · ${metrics.products.archived} archived`}
          />
          <MetricTile
            label="Collections"
            value={metrics.categories.total}
            detail={`${metrics.categories.active} switched on`}
          />
          <MetricTile
            label="Variants"
            value={metrics.variants.active}
            detail={`${metrics.variants.total} in total, including withdrawn`}
          />
          <MetricTile
            label="Photographs"
            value={metrics.images}
            detail="Across every product"
          />
        </div>

        {/* The shared attribute tables. Separated from the counts above
            because they are infrastructure rather than inventory: every
            product draws from them, and a retired colour changes what can be
            built rather than what is in stock. */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <MetricTile
            label="Colours"
            value={metrics.colors.active}
            detail={`offered for new variants, of ${metrics.colors.total} in the palette`}
            href={
              <Link
                href="/admin/colors"
                className="inline-block py-1.5 font-sans text-xs text-brand underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
              >
                Manage colours
              </Link>
            }
          />
          <MetricTile
            label="Sizes"
            value={metrics.sizes.active}
            detail={`offered for new variants, of ${metrics.sizes.total} in the run`}
            href={
              <Link
                href="/admin/sizes"
                className="inline-block py-1.5 font-sans text-xs text-brand underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
              >
                Manage sizes
              </Link>
            }
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <AdminPanel
          title="Stock needing attention"
          description="Live variants at or below their own low-stock threshold. This is visibility only: changing a quantity is done on the product, and stock movements are a later phase."
          actions={
            <ButtonLink href="/admin/products?stock=low" variant="link" size="sm">
              See all
            </ButtonLink>
          }
        >
          {lowStock.length === 0 ? (
            <AdminEmptyState
              title="All stock levels are healthy"
              description="No live variant is at or below its low-stock threshold. This panel fills up as stock runs down."
            />
          ) : (
            <ul className="divide-y divide-line">
              {lowStock.map((variant) => (
                <li
                  key={variant.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/admin/products/${variant.productId}`}
                      // Padded to clear the 24px minimum: an inline link sits
                      // in a 17px line box, which is not a reliable tap target.
                      className="inline-block py-1 font-sans text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
                    >
                      {variant.productName}
                    </Link>
                    <p className="font-sans text-xs text-ink-subtle">
                      {variant.colour} · {variant.size} · {variant.sku}
                    </p>
                  </div>
                  <p className="shrink-0 font-sans text-xs tabular-nums text-ink-muted">
                    {/* The word carries it; the number is the detail. */}
                    <span className="font-medium text-ink">
                      {variant.quantity === 0
                        ? "Out of stock"
                        : `${variant.quantity} left`}
                    </span>
                    <span className="text-ink-subtle">
                      {" "}
                      · threshold {variant.lowStockThreshold}
                    </span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </AdminPanel>

        <AdminPanel
          title="Recently updated"
          description="Where you left off."
          actions={
            <ButtonLink href="/admin/products" variant="link" size="sm">
              All products
            </ButtonLink>
          }
        >
          {recent.length === 0 ? (
            <AdminEmptyState
              title="Nothing in the catalogue yet"
              description="Products you create appear here, most recently changed first."
              action={
                <ButtonLink href="/admin/products/new" size="sm">
                  Add the first product
                </ButtonLink>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {recent.map((product) => (
                <li
                  key={product.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 first:pt-0 last:pb-0"
                >
                  <Link
                    href={`/admin/products/${product.id}`}
                    className="inline-block min-w-0 py-1 font-sans text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
                  >
                    {product.name}
                  </Link>
                  <span className="flex shrink-0 items-center gap-3">
                    <StatusPill status={product.status} />
                    <span className="font-sans text-xs text-ink-subtle">
                      {formatAdminDate(product.updatedAt)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </AdminPanel>
      </div>

      <AdminPanel title="Not in this phase">
        <ul className="grid gap-2 font-sans text-sm leading-relaxed text-ink-muted sm:grid-cols-2">
          <li>
            <span className="font-medium text-ink">Orders and revenue.</span> No
            order system exists, so no figure here could be real.
          </li>
          <li>
            <span className="font-medium text-ink">Stock movements.</span>{" "}
            Quantities can be corrected; adjustments, reservations and returns
            are the inventory phase.
          </li>
          <li>
            <span className="font-medium text-ink">Image uploads.</span>{" "}
            Photography is managed as URLs on an approved host.
          </li>
          <li>
            <span className="font-medium text-ink">Orders downstream.</span>{" "}
            Cart, wishlist, checkout and everything that follows an order.
          </li>
        </ul>
      </AdminPanel>
    </div>
  );
}
