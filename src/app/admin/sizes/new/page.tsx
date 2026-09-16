import type { Metadata } from "next";
import Link from "next/link";

import { requireAdmin } from "@/lib/auth/current-user";
import { nextSizePosition } from "@/lib/services/admin/size-admin-service";
import { AdminPageHeader } from "@/features/admin/components/admin-ui";
import { SizeForm } from "@/features/admin/components/size-form";

export const metadata: Metadata = { title: "New size" };

/**
 * Create a size.
 *
 * The position is pre-filled with the end of the current run. Reorder it into
 * place afterwards from the list — a size added at the end is nearly always
 * wrong, since a run is ordered smallest to largest rather than by when it
 * was added.
 */
export default async function NewSizePage() {
  await requireAdmin("/admin/sizes/new");

  const position = await nextSizePosition();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title="New size"
        breadcrumb={
          <Link
            href="/admin/sizes"
            className="inline-block py-1.5 font-sans text-xs text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
          >
            ← Sizes
          </Link>
        }
        description="It lands at the end of the run. Move it into place from the list afterwards, since the order is what the size selector follows."
      />

      <SizeForm nextPosition={position} />
    </div>
  );
}
