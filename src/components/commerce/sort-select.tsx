"use client";

import { useId } from "react";

import { sortOptions } from "@/config/storefront";
import { productQueryParams } from "@/features/storefront/product-query";
import { useProductFilters } from "@/features/storefront/use-product-filters";
import type { ProductSortValue } from "@/types/commerce";
import { cn } from "@/lib/utils/cn";

/**
 * Order the listing.
 *
 * A native `<select>`. On a phone that opens the system picker, which is the
 * control people already know and which needs no focus management, no
 * scrolling list and no keyboard handling from us. A custom dropdown here
 * would be more code and worse.
 */
export function SortSelect({
  value,
  className,
}: {
  value: ProductSortValue;
  className?: string;
}) {
  const { setValue, pending } = useProductFilters();
  const selectId = useId();

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label
        htmlFor={selectId}
        className="whitespace-nowrap font-sans text-sm text-ink-muted"
      >
        Sort
      </label>
      <select
        id={selectId}
        value={value}
        disabled={pending}
        onChange={(event) => setValue(productQueryParams.sort, event.target.value)}
        className="min-w-0 rounded-control border border-line-strong bg-canvas py-2 pl-3 pr-8 font-sans text-sm text-ink transition-colors hover:border-ink-400 disabled:opacity-60"
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
