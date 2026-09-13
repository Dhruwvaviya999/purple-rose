"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";

import { productQueryParams } from "./product-query";

/**
 * Reads and writes the listing filters, which live in the URL.
 *
 * Putting them there rather than in component state is what makes a filtered
 * listing shareable, bookmarkable and correct when someone presses back. It is
 * also what lets the page stay a Server Component: only these small controls
 * are interactive, and the results are rendered on the server from the query
 * string.
 *
 * Navigation runs inside a transition, so the current results stay on screen
 * and interactive while the next set is prepared, and `pending` can drive a
 * quiet busy state instead of the page blanking.
 */
export function useProductFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const commit = useCallback(
    (next: URLSearchParams) => {
      // Any change to what is being shown puts the reader back on page one;
      // staying on page four of a narrower result set usually shows nothing.
      next.delete(productQueryParams.page);

      const queryString = next.toString();
      const href = (queryString ? `${pathname}?${queryString}` : pathname) as Route;

      startTransition(() => {
        // The listing is replaced rather than pushed, so ticking four filter
        // boxes does not leave four entries to press back through.
        router.replace(href, { scroll: false });
      });
    },
    [pathname, router],
  );

  /** Add or remove one value in a multi-select group. */
  const toggleValue = useCallback(
    (param: string, value: string) => {
      const next = new URLSearchParams(searchParams.toString());
      const current = next.getAll(param);

      next.delete(param);
      for (const existing of current.filter((entry) => entry !== value)) {
        next.append(param, existing);
      }

      if (!current.includes(value)) {
        next.append(param, value);
      }

      commit(next);
    },
    [commit, searchParams],
  );

  /** Set or clear a single-value parameter such as sort or a price bound. */
  const setValue = useCallback(
    (param: string, value: string | null) => {
      const next = new URLSearchParams(searchParams.toString());

      if (value === null || value === "") {
        next.delete(param);
      } else {
        next.set(param, value);
      }

      commit(next);
    },
    [commit, searchParams],
  );

  /** Set both price bounds in one navigation. */
  const setPriceRange = useCallback(
    (min: string | null, max: string | null) => {
      const next = new URLSearchParams(searchParams.toString());

      for (const [param, value] of [
        [productQueryParams.minPrice, min],
        [productQueryParams.maxPrice, max],
      ] as const) {
        if (value === null) {
          next.delete(param);
        } else {
          next.set(param, value);
        }
      }

      commit(next);
    },
    [commit, searchParams],
  );

  /** Drop every filter but keep the sort order, which is a preference. */
  const clearFilters = useCallback(() => {
    const next = new URLSearchParams();
    const sort = searchParams.get(productQueryParams.sort);

    if (sort) {
      next.set(productQueryParams.sort, sort);
    }

    commit(next);
  }, [commit, searchParams]);

  const isSelected = useCallback(
    (param: string, value: string) => searchParams.getAll(param).includes(value),
    [searchParams],
  );

  return {
    toggleValue,
    setValue,
    setPriceRange,
    clearFilters,
    isSelected,
    pending,
  };
}
