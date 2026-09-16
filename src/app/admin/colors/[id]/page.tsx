import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/current-user";
import { getAdminColor } from "@/lib/services/admin/color-admin-service";
import {
  ActivePill,
  AdminPageHeader,
  formatAdminDate,
} from "@/features/admin/components/admin-ui";
import { ColorForm } from "@/features/admin/components/color-form";

export const metadata: Metadata = { title: "Edit colour" };

/**
 * Edit a colour.
 *
 * The header states what is riding on it — how many variants, across how many
 * products, and how many photographs — because this is shared infrastructure.
 * A hex change here repaints a swatch on every one of them, and an
 * administrator should see that before making it.
 */
export default async function EditColorPage(
  props: PageProps<"/admin/colors/[id]">,
) {
  await requireAdmin("/admin/colors");

  const { id } = await props.params;
  const searchParams = await props.searchParams;

  const color = await getAdminColor(id);

  if (!color) {
    notFound();
  }

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={color.name}
        breadcrumb={
          <Link
            href="/admin/colors"
            className="inline-block py-1.5 font-sans text-xs text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
          >
            ← Colours
          </Link>
        }
        description={`${color.variantCount} ${color.variantCount === 1 ? "variant" : "variants"} across ${color.productCount} ${color.productCount === 1 ? "product" : "products"} · ${color.imageCount} ${color.imageCount === 1 ? "photograph" : "photographs"} · last changed ${formatAdminDate(color.updatedAt)}`}
        actions={
          <span className="flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                style={{ backgroundColor: color.hex }}
                className="size-6 rounded-full ring-1 ring-inset ring-ink-950/15"
              />
              <span className="font-mono text-xs text-ink-muted">{color.hex}</span>
            </span>
            <ActivePill
              active={color.isActive}
              activeLabel="Offered"
              inactiveLabel="Not offered"
            />
          </span>
        }
      />

      {searchParams.created === "1" ? (
        <p
          role="status"
          className="rounded-control border border-line-strong bg-surface px-3.5 py-2.5 font-sans text-sm text-ink"
        >
          Created. It is now offered when building variants on any product.
        </p>
      ) : null}

      <ColorForm color={color} />
    </div>
  );
}
