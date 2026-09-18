import Link from "next/link";
import type { Route } from "next";

import { cn } from "@/lib/utils/cn";

/**
 * Navigation inside the account area.
 *
 * A Server Component, so it ships no JavaScript. The current page is decided by
 * the page that renders it rather than by reading the pathname in the browser:
 * every account page already knows which one it is, and passing that down is
 * cheaper than making this interactive to discover something the server knew.
 *
 * **Every entry goes somewhere real.** There is no Orders link, because there
 * are no orders — a navigation full of things that apologise when you reach them
 * is worse than a short one. It grows when the pages behind it exist.
 *
 * A row of links on a phone, a column on a wide screen, so it sits above the
 * content where a thumb reaches and beside it where there is room.
 */
export type AccountSection =
  | "overview"
  | "profile"
  | "addresses"
  | "wishlist"
  | "bag";

const SECTIONS: readonly {
  id: AccountSection;
  label: string;
  href: Route;
}[] = [
  { id: "overview", label: "Overview", href: "/account" as Route },
  { id: "profile", label: "Your details", href: "/account/profile" as Route },
  { id: "addresses", label: "Addresses", href: "/account/addresses" as Route },
  { id: "wishlist", label: "Wishlist", href: "/wishlist" as Route },
  { id: "bag", label: "Bag", href: "/cart" as Route },
];

export function AccountNav({ current }: { current: AccountSection }) {
  return (
    // "Your account", not "Account": the site footer already has a link group
    // called Account, and two navigation landmarks with the same name on one
    // page is a choice a screen-reader user cannot make. `pnpm check:account:ui`
    // found the collision.
    <nav aria-label="Your account" className="lg:w-56 lg:shrink-0">
      <ul
        className={cn(
          // Scrolls sideways on a narrow phone rather than wrapping into an
          // uneven block or squeezing the labels.
          "flex gap-1 overflow-x-auto pb-1",
          "lg:flex-col lg:gap-0.5 lg:overflow-visible lg:pb-0",
        )}
      >
        {SECTIONS.map((section) => {
          const active = section.id === current;

          return (
            <li key={section.id} className="shrink-0">
              <Link
                href={section.href}
                // Announced as the current page, not merely coloured like one.
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center whitespace-nowrap rounded-control px-3.5",
                  "font-sans text-sm transition-colors",
                  active
                    ? "bg-surface-strong font-medium text-ink"
                    : "text-ink-muted hover:bg-surface hover:text-ink",
                )}
              >
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
