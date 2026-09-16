import Link from "next/link";

import { primaryNav } from "@/config/navigation";
import type { StorefrontCategory } from "@/types/commerce";
import { cn } from "@/lib/utils/cn";

/**
 * Desktop navigation.
 *
 * Structural links come from configuration; the category links are passed in
 * by whoever renders the header, so this component does not reach for data.
 * Those categories are database rows, read once in the store layout, so
 * renaming or retiring a collection changes this row without a deployment.
 *
 * A server component. There is no dropdown: with four categories a flat row
 * reads faster than a menu you have to open, and it needs no focus
 * management, no hover intent and no escape handling.
 */
export function MainNav({
  categories,
  className,
}: {
  categories: readonly Pick<StorefrontCategory, "slug" | "name">[];
  className?: string;
}) {
  return (
    <nav aria-label="Main" className={cn("hidden lg:block", className)}>
      <ul className="flex items-center gap-7">
        {primaryNav.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="inline-block py-1 font-sans text-sm font-medium text-ink transition-colors hover:text-brand-strong"
            >
              {item.label}
            </Link>
          </li>
        ))}

        {/* Held back until xl. At the lg breakpoint the wordmark, the
            primary links and the four header controls already fill the row,
            and adding four category links pushed the header wider than the
            viewport. */}
        {categories.map((category) => (
          <li key={category.slug} className="hidden xl:block">
            <Link
              href={{ pathname: "/shop", query: { category: category.slug } }}
              className="inline-block py-1 font-sans text-sm text-ink-muted transition-colors hover:text-brand-strong"
            >
              {category.name}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
