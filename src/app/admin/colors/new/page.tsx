import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/current-user";
import { nextColorPosition } from "@/lib/services/admin/color-admin-service";
import { AdminPageHeader } from "@/features/admin/components/admin-ui";
import { ColorForm } from "@/features/admin/components/color-form";

export const metadata: Metadata = { title: "New colour" };

/**
 * Create a colour.
 *
 * The position is pre-filled with the end of the current palette, so a new
 * colour appears last rather than silently sharing position 0 with whatever
 * is already there.
 */
export default async function NewColorPage() {
  await requireAdmin("/admin/colors/new");

  const position = await nextColorPosition();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="New colour"
        breadcrumb={
          <Link
            href="/admin/colors"
            className="inline-block py-1.5 font-sans text-xs text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
          >
            ← Colours
          </Link>
        }
        description="It is available when building variants as soon as it is saved, and appears in the shop colour filter once a product is actually cut in it."
      />

      <ColorForm nextPosition={position} />
    </div>
  );
}
