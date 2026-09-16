import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/current-user";
import { getAdminSize } from "@/lib/services/admin/size-admin-service";
import {
  ActivePill,
  AdminPageHeader,
  formatAdminDate,
} from "@/features/admin/components/admin-ui";
import { SizeForm } from "@/features/admin/components/size-form";

export const metadata: Metadata = { title: "Edit size" };

/**
 * Edit a size.
 *
 * The header states how many variants and products depend on it, because the
 * code is built into every one of their SKUs and changing it is not a cosmetic
 * edit.
 */
export default async function EditSizePage(
  props: PageProps<"/admin/sizes/[id]">,
) {
  await requireAdmin("/admin/sizes");

  const { id } = await props.params;
  const searchParams = await props.searchParams;

  const size = await getAdminSize(id);

  if (!size) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={`${size.code} — ${size.name}`}
        breadcrumb={
          <Link
            href="/admin/sizes"
            className="inline-block py-1.5 font-sans text-xs text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
          >
            ← Sizes
          </Link>
        }
        description={`${size.variantCount} ${size.variantCount === 1 ? "variant" : "variants"} across ${size.productCount} ${size.productCount === 1 ? "product" : "products"} · last changed ${formatAdminDate(size.updatedAt)}`}
        actions={
          <ActivePill
            active={size.isActive}
            activeLabel="Offered"
            inactiveLabel="Not offered"
          />
        }
      />

      {searchParams.created === "1" ? (
        <p
          role="status"
          className="rounded-control border border-line-strong bg-surface px-3.5 py-2.5 font-sans text-sm text-ink"
        >
          Created. Move it into place from the size list — the order is what the
          selector follows, and a new size lands at the end.
        </p>
      ) : null}

      <SizeForm size={size} />
    </div>
  );
}
