import Link from "next/link";
import type { Route } from "next";

import { cn } from "@/lib/utils/cn";

/**
 * The trail back up the site.
 *
 * A nav landmark containing an ordered list, because the order is the meaning.
 * The current page is the last item and is not a link: `aria-current="page"`
 * says so, rather than leaving it to look different and nothing more.
 *
 * Separators are decorative and hidden, so the trail is not read as
 * "Home slash Shop slash Dresses".
 *
 * Callers pass the trail; no page hardcodes markup.
 */
export type Crumb = {
  label: string;
  /** Omitted on the final item, which is the page you are on. */
  href?: Route;
};

export function Breadcrumbs({
  items,
  className,
}: {
  items: readonly Crumb[];
  className?: string;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 font-sans text-xs text-ink-subtle sm:text-sm">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;

          return (
            <li key={item.label} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="inline-block py-1.5 transition-colors hover:text-brand-strong"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? "page" : undefined}
                  className={cn("inline-block py-1.5", isLast && "text-ink")}
                >
                  {item.label}
                </span>
              )}

              {!isLast ? (
                <span aria-hidden="true" className="text-ink-300">
                  /
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
