import Link from "next/link";
import type { Route } from "next";

import { cn } from "@/lib/utils/cn";

/**
 * Paging through a listing.
 *
 * Real links, not buttons, so a page can be opened in a new tab, shared and
 * crawled, and so it works before any JavaScript arrives. Every other filter
 * in the query string is carried across, which is why the caller passes a
 * function that builds the href rather than just a page number.
 *
 * The window around the current page is small and always includes the first
 * and last, so the control stays one line wide on a phone however many pages
 * there are.
 */
type PaginationProps = {
  page: number;
  pageCount: number;
  /** Builds a full href for a page, preserving the rest of the query. */
  hrefFor: (page: number) => Route;
  className?: string;
};

/** Pages to show: first, last, the current one and its neighbours. */
function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }

  const pages = new Set([1, pageCount, page, page - 1, page + 1]);
  const sorted = [...pages]
    .filter((value) => value >= 1 && value <= pageCount)
    .sort((a, b) => a - b);

  const output: (number | "gap")[] = [];

  sorted.forEach((value, index) => {
    const previous = sorted[index - 1];

    if (previous !== undefined && value - previous > 1) {
      output.push("gap");
    }

    output.push(value);
  });

  return output;
}

export function Pagination({
  page,
  pageCount,
  hrefFor,
  className,
}: PaginationProps) {
  if (pageCount <= 1) {
    return null;
  }

  const window = pageWindow(page, pageCount);

  return (
    <nav aria-label="Pages" className={className}>
      <ul className="flex flex-wrap items-center justify-center gap-1.5">
        <li>
          <PageLink
            href={hrefFor(page - 1)}
            disabled={page === 1}
            label="Previous page"
          >
            Previous
          </PageLink>
        </li>

        {window.map((entry, index) =>
          entry === "gap" ? (
            <li
              key={`gap-${index}`}
              aria-hidden="true"
              className="px-1 font-sans text-sm text-ink-subtle"
            >
              …
            </li>
          ) : (
            <li key={entry}>
              <PageLink
                href={hrefFor(entry)}
                current={entry === page}
                label={`Page ${entry}`}
              >
                {entry}
              </PageLink>
            </li>
          ),
        )}

        <li>
          <PageLink
            href={hrefFor(page + 1)}
            disabled={page === pageCount}
            label="Next page"
          >
            Next
          </PageLink>
        </li>
      </ul>
    </nav>
  );
}

function PageLink({
  href,
  children,
  label,
  current = false,
  disabled = false,
}: {
  href: Route;
  children: React.ReactNode;
  label: string;
  current?: boolean;
  disabled?: boolean;
}) {
  const classes = cn(
    "inline-flex h-10 min-w-10 items-center justify-center rounded-control border px-3 font-sans text-sm transition-colors",
    current
      ? "border-ink bg-ink text-canvas"
      : "border-line-strong bg-canvas text-ink hover:border-ink-400 hover:bg-surface",
  );

  if (disabled) {
    return (
      <span
        aria-hidden="true"
        className={cn(classes, "cursor-not-allowed border-line text-ink-300")}
      >
        {children}
      </span>
    );
  }

  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={classes}
    >
      {children}
    </Link>
  );
}
