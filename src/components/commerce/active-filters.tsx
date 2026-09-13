"use client";

import {
  productQueryParams,
  type ProductQuery,
} from "@/features/storefront/product-query";
import { useProductFilters } from "@/features/storefront/use-product-filters";
import type { FilterGroup } from "@/types/commerce";
import { CloseIcon } from "@/components/shared/icons";
import { formatPrice } from "@/lib/utils/format-price";
import { cn } from "@/lib/utils/cn";

/**
 * What is currently narrowing the listing, as removable chips.
 *
 * Without this the only record of an active filter is a tick somewhere in a
 * panel that is closed on a phone. Each chip states the group it belongs to,
 * so "Ivory" is announced as "Remove colour Ivory" rather than just "Ivory".
 */
type ActiveFiltersProps = {
  query: ProductQuery;
  groups: readonly FilterGroup[];
  className?: string;
};

type Chip = {
  key: string;
  /** What the chip removes, spoken as part of the button name. */
  group: string;
  label: string;
  remove: () => void;
};

export function ActiveFilters({ query, groups, className }: ActiveFiltersProps) {
  const { toggleValue, setValue, setPriceRange, clearFilters } =
    useProductFilters();

  const labelFor = (param: string, value: string) =>
    groups
      .find((group) => group.param === param)
      ?.options.find((option) => option.value === value)?.label ?? value;

  const chips: Chip[] = [];

  for (const [param, values, group] of [
    [productQueryParams.category, query.categories, "category"],
    [productQueryParams.size, query.sizes, "size"],
    [productQueryParams.colour, query.colours, "colour"],
  ] as const) {
    for (const value of values) {
      chips.push({
        key: `${param}:${value}`,
        group,
        label: labelFor(param, value),
        remove: () => toggleValue(param, value),
      });
    }
  }

  if (query.onSale) {
    chips.push({
      key: "sale",
      group: "availability",
      label: "On sale",
      remove: () => setValue(productQueryParams.sale, null),
    });
  }

  if (query.inStockOnly) {
    chips.push({
      key: "in-stock",
      group: "availability",
      label: "In stock",
      remove: () => setValue(productQueryParams.inStock, null),
    });
  }

  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    const from = query.minPrice === undefined ? null : formatPrice(query.minPrice);
    const to = query.maxPrice === undefined ? null : formatPrice(query.maxPrice);

    chips.push({
      key: "price",
      group: "price",
      label:
        from && to
          ? `${from} to ${to}`
          : from
            ? `From ${from}`
            : `Up to ${to}`,
      remove: () => setPriceRange(null, null),
    });
  }

  if (chips.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <h2 className="sr-only">Active filters</h2>

      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.remove}
          aria-label={`Remove ${chip.group} ${chip.label}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-canvas py-1.5 pl-3 pr-2 font-sans text-sm text-ink transition-colors hover:border-ink-400 hover:bg-surface"
        >
          <span aria-hidden="true">{chip.label}</span>
          <CloseIcon aria-hidden="true" className="size-3.5 text-ink-subtle" />
        </button>
      ))}

      <button
        type="button"
        onClick={clearFilters}
        className="rounded-control px-2 py-1.5 font-sans text-sm text-brand underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
      >
        Clear all
      </button>
    </div>
  );
}
