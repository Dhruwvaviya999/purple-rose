import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";

import { requireAdmin } from "@/lib/auth/current-user";
import { listAdminSizes } from "@/lib/services/admin/size-admin-service";
import {
  ActivePill,
  AdminEmptyState,
  AdminPageHeader,
  formatAdminDate,
} from "@/features/admin/components/admin-ui";
import { AttributeRowActions } from "@/features/admin/components/attribute-row-actions";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Sizes" };

/**
 * The size run.
 *
 * The order of this list is what puts XS before XXL in the size selector and
 * in the shop filter. Reading sizes in discovery order is what once listed XS
 * after XXL, which is why `position` exists and why the arrows are here.
 *
 * Measurements are summarised where they exist and said to be absent where
 * they do not, rather than shown as zeros. Nothing renders them yet; they are
 * stored so a future size guide can be built from real numbers.
 */
export default async function AdminSizesPage() {
  await requireAdmin("/admin/sizes");

  const sizes = await listAdminSizes();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Sizes"
        description="The run every product is cut in. Shared across the catalogue, and ordered here — this list is what the size selector and the shop filter follow."
        actions={
          <ButtonLink href="/admin/sizes/new" size="sm">
            New size
          </ButtonLink>
        }
      />

      {sizes.length === 0 ? (
        <AdminEmptyState
          title="No sizes yet"
          description="A variant is a colour and a size. Create the first size and it becomes available when building them."
          action={
            <ButtonLink href="/admin/sizes/new" size="sm">
              Create a size
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-3">
          {sizes.map((size, index) => (
            <li
              key={size.id}
              className="rounded-card border border-line bg-canvas p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="flex min-w-0 items-start gap-3">
                  {/* The code, as it appears on the selector a shopper uses. */}
                  <span
                    aria-hidden="true"
                    className="mt-0.5 inline-flex min-w-11 shrink-0 items-center justify-center rounded-control border border-line-strong bg-surface px-2 py-1.5 font-sans text-sm font-medium text-ink"
                  >
                    {size.code}
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/sizes/${size.id}` as Route}
                        className="inline-block py-1 font-sans text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
                      >
                        {size.code}
                        <span className="font-normal text-ink-muted">
                          {" "}
                          — {size.name}
                        </span>
                      </Link>
                      <ActivePill
                        active={size.isActive}
                        activeLabel="Offered"
                        inactiveLabel="Not offered"
                      />
                    </div>

                    <p className="mt-0.5 font-sans text-xs text-ink-subtle">
                      <Measurements
                        bust={size.bustCm}
                        waist={size.waistCm}
                        hip={size.hipCm}
                      />
                    </p>

                    <p className="mt-1.5 font-sans text-xs text-ink-subtle">
                      <span className="font-medium text-ink-muted">
                        {size.variantCount}{" "}
                        {size.variantCount === 1 ? "variant" : "variants"}
                      </span>{" "}
                      cut in it · position {size.position} · changed{" "}
                      {formatAdminDate(size.updatedAt)}
                    </p>
                  </div>
                </div>

                <AttributeRowActions
                  kind="size"
                  id={size.id}
                  label={size.code}
                  isActive={size.isActive}
                  usageCount={size.variantCount}
                  first={index === 0}
                  last={index === sizes.length - 1}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The measurements, or an honest statement that there are none.
 *
 * A partially measured size shows what it has rather than padding the rest
 * with zeros, because a zero here would read as a measurement.
 */
function Measurements({
  bust,
  waist,
  hip,
}: {
  bust: number | null;
  waist: number | null;
  hip: number | null;
}) {
  const parts = [
    bust !== null ? `bust ${bust}cm` : null,
    waist !== null ? `waist ${waist}cm` : null,
    hip !== null ? `hip ${hip}cm` : null,
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) {
    return <>Not measured</>;
  }

  return <>{parts.join(" · ")}</>;
}
