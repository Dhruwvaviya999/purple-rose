import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/current-user";
import { listAdminCategories } from "@/lib/services/admin/category-admin-service";
import {
  AdminEmptyState,
  AdminPageHeader,
  ActivePill,
  formatAdminDate,
} from "@/features/admin/components/admin-ui";
import { CategoryRowActions } from "@/features/admin/components/category-row-actions";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Collections" };

/**
 * The collection list.
 *
 * Short by nature — a shop has a handful of collections, not a catalogue of
 * them — so there is no paging and no filtering, only an optional search for
 * when the handful grows.
 *
 * **The product count is every product**, draft and archived included, and the
 * column says so. Somebody about to switch a collection off needs to know what
 * is attached to it, and a draft counts for that. The live figure sits beside
 * it so the two are never confused.
 *
 * Reordering is a pair of arrows rather than drag and drop: keyboard and
 * screen-reader users get the same control without a parallel implementation,
 * and each press persists immediately rather than waiting for a save nobody
 * remembers to press.
 */
export default async function AdminCategoriesPage() {
  await requireAdmin("/admin/categories");

  const categories = await listAdminCategories();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Collections"
        description="How the shop is divided up. These drive the navigation, the footer links, the home page tiles, the category filter and the sitemap."
        actions={
          <ButtonLink href="/admin/categories/new" size="sm">
            New collection
          </ButtonLink>
        }
      />

      {categories.length === 0 ? (
        <AdminEmptyState
          title="No collections yet"
          description="Every product belongs to a collection. Create the first one and the shop navigation builds itself from it."
          action={
            <ButtonLink href="/admin/categories/new" size="sm">
              Create a collection
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-3">
          {categories.map((category, index) => (
            <li
              key={category.id}
              className="rounded-card border border-line bg-canvas p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/admin/categories/${category.id}`}
                      className="font-sans text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
                    >
                      {category.name}
                    </Link>
                    <ActivePill
                      active={category.isActive}
                      activeLabel="Switched on"
                      inactiveLabel="Switched off"
                    />
                  </div>

                  <p className="mt-0.5 font-sans text-xs text-ink-subtle">
                    /shop?category={category.slug}
                  </p>

                  {category.description ? (
                    <p className="mt-1 max-w-xl font-sans text-sm leading-relaxed text-ink-muted">
                      {category.description}
                    </p>
                  ) : null}

                  <p className="mt-2 font-sans text-xs text-ink-subtle">
                    {/* Labelled precisely: this is the whole catalogue, not
                        what a shopper would find here. */}
                    <span className="font-medium text-ink-muted">
                      {category.productCount}{" "}
                      {category.productCount === 1 ? "product" : "products"}
                    </span>{" "}
                    in total, {category.activeProductCount} of them live with
                    this as their primary collection · position{" "}
                    {category.position} · changed{" "}
                    {formatAdminDate(category.updatedAt)}
                  </p>
                </div>

                <CategoryRowActions
                  id={category.id}
                  name={category.name}
                  isActive={category.isActive}
                  productCount={category.productCount}
                  first={index === 0}
                  last={index === categories.length - 1}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
