import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/current-user";
import { getProductFormOptions } from "@/lib/services/admin/product-admin-service";
import { AdminEmptyState, AdminPageHeader } from "@/features/admin/components/admin-ui";
import { ProductForm } from "@/features/admin/components/product-form";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "New product" };

/**
 * Create a product.
 *
 * Fields only. Variants and photographs are added on the edit screen once the
 * product exists, which keeps the first save short and means nothing is typed
 * twice if it fails.
 *
 * A product needs a collection to belong to, so if there are none this page
 * says so and sends the admin to make one rather than showing a form whose
 * required select is empty.
 */
export default async function NewProductPage() {
  await requireAdmin("/admin/products/new");

  const options = await getProductFormOptions();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="New product"
        breadcrumb={
          <Link
            href="/admin/products"
            className="inline-block py-1.5 font-sans text-xs text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
          >
            ← Products
          </Link>
        }
        description="It is created as a draft unless you say otherwise, so nothing reaches the shop before you are ready. Variants and photographs come next, on the edit screen."
      />

      {options.categories.length === 0 ? (
        <AdminEmptyState
          title="There are no collections yet"
          description="Every product belongs to a collection, which is what the card line, the breadcrumb and the shop navigation are built from. Create one first."
          action={
            <ButtonLink href="/admin/categories/new" size="sm">
              Create a collection
            </ButtonLink>
          }
        />
      ) : (
        <ProductForm options={options} />
      )}
    </div>
  );
}
