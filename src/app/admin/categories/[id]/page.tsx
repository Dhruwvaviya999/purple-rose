import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/current-user";
import { getAdminCategory } from "@/lib/services/admin/category-admin-service";
import {
  ActivePill,
  AdminPageHeader,
  formatAdminDate,
} from "@/features/admin/components/admin-ui";
import { CategoryForm } from "@/features/admin/components/category-form";

export const metadata: Metadata = { title: "Edit collection" };

/**
 * Edit a collection.
 *
 * Switching it on or off is done from the list, where the confirmation can
 * state how many products are attached. Here the checkbox does the same thing
 * without the dialog, because somebody already in the edit screen has the
 * product count in front of them.
 */
export default async function EditCategoryPage(
  props: PageProps<"/admin/categories/[id]">,
) {
  await requireAdmin("/admin/categories");

  const { id } = await props.params;
  const searchParams = await props.searchParams;

  const category = await getAdminCategory(id);

  if (!category) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={category.name}
        breadcrumb={
          <Link
            href="/admin/categories"
            className="inline-block py-1.5 font-sans text-xs text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
          >
            ← Collections
          </Link>
        }
        description={`${category.productCount} ${category.productCount === 1 ? "product" : "products"} in this collection, drafts and archived included · last changed ${formatAdminDate(category.updatedAt)}`}
        actions={
          <ActivePill
            active={category.isActive}
            activeLabel="Switched on"
            inactiveLabel="Switched off"
          />
        }
      />

      {searchParams.created === "1" ? (
        <p
          role="status"
          className="rounded-control border border-line-strong bg-surface px-3.5 py-2.5 font-sans text-sm text-ink"
        >
          Created. Assign products to it from each product&rsquo;s edit screen.
        </p>
      ) : null}

      <CategoryForm category={category} />
    </div>
  );
}
