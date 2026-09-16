"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";

import { cn } from "@/lib/utils/cn";

/**
 * The admin sections.
 *
 * A client component only because it marks the current one, which needs the
 * pathname. Everything else about it is static.
 *
 * **Only sections that exist are listed.** Phase 4 filled this out with
 * greyed-out labels for Orders, Customers, Coupons and Reviews to fix the
 * information architecture; now that some of them are real, the rest are gone.
 * A menu that mostly does not work teaches people not to trust the menu.
 *
 * Colours and sizes joined in Phase 7. Before that they were seed-only, which
 * was recorded as a limitation rather than papered over with a link to a page
 * that did not exist.
 *
 * The row scrolls horizontally below `lg` rather than wrapping, so five
 * sections do not push the page content down a phone screen; each one keeps a
 * full-size tap target while it does.
 */
const sections: readonly { href: Route; label: string; description: string }[] = [
  { href: "/admin", label: "Overview", description: "Catalogue at a glance" },
  { href: "/admin/products", label: "Products", description: "Create, edit and publish" },
  { href: "/admin/categories", label: "Collections", description: "Order and visibility" },
  { href: "/admin/colors", label: "Colours", description: "The shared palette" },
  { href: "/admin/sizes", label: "Sizes", description: "The shared size run" },
];

export function AdminNav() {
  const pathname = usePathname();

  /**
   * Which section owns this page.
   *
   * Prefix matching, so `/admin/products/new` and `/admin/products/<id>` both
   * keep Products marked. `/admin` is matched exactly, or it would own every
   * page in the area.
   */
  function isCurrent(href: string): boolean {
    return href === "/admin"
      ? pathname === "/admin"
      : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav aria-label="Admin sections" className="lg:w-56 lg:shrink-0">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {sections.map((section) => {
          const current = isCurrent(section.href);

          return (
            <li key={section.href} className="shrink-0 lg:shrink">
              <Link
                href={section.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "block rounded-control px-3 py-2 font-sans text-sm transition-colors",
                  // The current section is named by `aria-current` as well as
                  // shown, so it does not rely on the tint alone.
                  current
                    ? "bg-canvas font-medium text-ink ring-1 ring-inset ring-line-strong"
                    : "text-ink-muted hover:bg-canvas hover:text-ink",
                )}
              >
                {section.label}
                <span className="hidden font-sans text-xs text-ink-subtle lg:mt-0.5 lg:block">
                  {section.description}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
