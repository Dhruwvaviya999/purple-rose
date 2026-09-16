import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/current-user";
import { listAdminCategories } from "@/lib/services/admin/category-admin-service";
import { AdminPageHeader } from "@/features/admin/components/admin-ui";
import { CategoryForm } from "@/features/admin/components/category-form";

export const metadata: Metadata = { title: "New collection" };

/**
 * Create a collection.
 *
 * The position field is pre-filled with the end of the current running order,
 * so a new collection appears last rather than silently sharing position 0
 * with whatever is already there.
 */
export default async function NewCategoryPage() {
  await requireAdmin("/admin/categories/new");

  const existing = await listAdminCategories();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="New collection"
        breadcrumb={
          <Link
            href="/admin/categories"
            className="font-sans text-xs text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
          >
            ← Collections
          </Link>
        }
        description="A collection is how the shop is divided up. It appears in the navigation, the footer, the filter panel and the sitemap as soon as it is switched on."
      />

      <CategoryForm nextPosition={existing.length} />
    </div>
  );
}
