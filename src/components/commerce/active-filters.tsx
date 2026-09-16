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

  if (query.search) {
    chips.push({
      key: "search",
      group: "search",
      label: `“${query.search}”`,
      remove: () => setValue(productQueryParams.search, null),
    });
  }

  // Every multi-select group, in the order the panel lists them. Adding a
  // group to the panel adds its chips here by adding one line, rather than by
  // remembering to write a second block.
  for (const [param, values, group] of [
    [productQueryParams.category, query.categories, "category"],
    [productQueryParams.size, query.sizes, "size"],
    [productQueryParams.colour, query.colours, "colour"],
    [productQueryParams.fabric, query.fabrics, "fabric"],
    [productQueryParams.pattern, query.patterns, "pattern"],
    [productQueryParams.fit, query.fits, "fit"],
    [productQueryParams.occasion, query.occasions, "occasion"],
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

  for (const [param, active, group, label] of [
    [productQueryParams.sale, query.onSale, "availability", "On sale"],
    [productQueryParams.inStock, query.inStockOnly, "availability", "In stock"],
    [
      productQueryParams.newArrival,
      query.newArrivalsOnly,
      "collection",
      "New arrivals",
    ],
    [productQueryParams.featured, query.featuredOnly, "collection", "Featured"],
    [
      productQueryParams.bestSeller,
      query.bestSellersOnly,
      "collection",
      "Purple Rose picks",
    ],
  ] as const) {
    if (active) {
      chips.push({
        key: param,
        group,
        label,
        remove: () => setValue(param, null),
      });
    }
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
