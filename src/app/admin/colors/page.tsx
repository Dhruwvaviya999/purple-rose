import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";

import { requireAdmin } from "@/lib/auth/current-user";
import { listAdminColors } from "@/lib/services/admin/color-admin-service";
import {
  ActivePill,
  AdminEmptyState,
  AdminPageHeader,
  formatAdminDate,
} from "@/features/admin/components/admin-ui";
import { AttributeRowActions } from "@/features/admin/components/attribute-row-actions";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Colours" };

/**
 * The colour palette.
 *
 * Short by nature — a shop has a palette, not a catalogue of colours — so
 * there is no paging and no filtering, matching the collections screen.
 *
 * **The swatch is never the only thing carrying the colour.** Each row shows
 * the name, the fill and the hex value together, so it reads correctly in
 * greyscale, to anyone with any form of colour vision, and to a screen reader.
 * A square of colour with nothing to announce would be the one place in this
 * application where colour was the sole channel.
 *
 * Usage counts come from `_count` aggregations in the query that fetched the
 * rows, so a colour used by two hundred variants costs the same as one used by
 * none.
 */
export default async function AdminColorsPage() {
  await requireAdmin("/admin/colors");

  const colors = await listAdminColors();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="Colours"
        description="The palette every product draws from. One row per colour, shared across the catalogue, so a name is spelled once and a swatch is defined once."
        actions={
          <ButtonLink href="/admin/colors/new" size="sm">
            New colour
          </ButtonLink>
        }
      />

      {colors.length === 0 ? (
        <AdminEmptyState
          title="No colours yet"
          description="A variant is a colour and a size. Create the first colour and it becomes available when building them."
          action={
            <ButtonLink href="/admin/colors/new" size="sm">
              Create a colour
            </ButtonLink>
          }
        />
      ) : (
        <ul className="space-y-3">
          {colors.map((color, index) => (
            <li
              key={color.id}
              className="rounded-card border border-line bg-canvas p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                <div className="flex min-w-0 items-start gap-3">
                  {/* Decorative: everything it conveys is in the text beside it. */}
                  <span
                    aria-hidden="true"
                    style={{ backgroundColor: color.hex }}
                    className="mt-0.5 size-9 shrink-0 rounded-full ring-1 ring-inset ring-ink-950/15"
                  />

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/colors/${color.id}` as Route}
                        className="inline-block py-1 font-sans text-sm font-medium text-ink underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
                      >
                        {color.name}
                      </Link>
                      <ActivePill
                        active={color.isActive}
                        activeLabel="Offered"
                        inactiveLabel="Not offered"
                      />
                    </div>

                    <p className="mt-0.5 font-sans text-xs text-ink-subtle">
                      <span className="font-mono">{color.hex}</span> · filter
                      value {color.slug}
                    </p>

                    <p className="mt-1.5 font-sans text-xs text-ink-subtle">
                      <span className="font-medium text-ink-muted">
                        {color.variantCount}{" "}
                        {color.variantCount === 1 ? "variant" : "variants"}
                      </span>{" "}
                      cut in it · {color.imageCount}{" "}
                      {color.imageCount === 1 ? "photograph" : "photographs"} ·
                      position {color.position} · changed{" "}
                      {formatAdminDate(color.updatedAt)}
                    </p>
                  </div>
                </div>

                <AttributeRowActions
                  kind="color"
                  id={color.id}
                  label={color.name}
                  isActive={color.isActive}
                  usageCount={color.variantCount}
                  first={index === 0}
                  last={index === colors.length - 1}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
