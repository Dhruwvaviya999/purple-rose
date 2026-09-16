"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import {
  adminProductHref,
  adminSortOptions,
  merchandisingFilters,
  stockFilters,
  type AdminProductQuery,
} from "@/lib/admin/product-admin-query";
import { ProductStatus } from "@/generated/prisma/enums";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { controlClassName } from "./form-controls";

/**
 * The controls above the admin product list.
 *
 * They write to the query string and the server re-renders the list from it,
 * exactly as the storefront filters do. That is what makes an admin search
 * shareable — "look at this one, here is the link" — and what keeps the list
 * itself a Server Component that ships no JavaScript.
 *
 * Nothing here decides what matches. Every value is parsed and validated again
 * on the server by `parseAdminProductQuery`, because an administrator's URL bar
 * is still a URL bar.
 */

const STATUS_OPTIONS = [
  { value: "", label: "Any status" },
  { value: ProductStatus.ACTIVE, label: "Live" },
  { value: ProductStatus.DRAFT, label: "Draft" },
  { value: ProductStatus.ARCHIVED, label: "Archived" },
] as const;

const STOCK_LABELS: Record<(typeof stockFilters)[number], string> = {
  "in-stock": "In stock",
  low: "Running low",
  out: "Out of stock",
};

const FLAG_LABELS: Record<(typeof merchandisingFilters)[number], string> = {
  featured: "Featured",
  new: "New arrival",
  bestseller: "Purple Rose pick",
  seasonal: "Seasonal",
  sale: "On sale",
};

/** How long to wait after the last keystroke before searching. */
const SEARCH_DEBOUNCE_MS = 350;

export function AdminProductFilters({
  query,
  categories,
  resultCount,
}: {
  query: AdminProductQuery;
  categories: readonly { slug: string; name: string }[];
  resultCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const searchId = useId();

  const urlTerm = query.search ?? "";
  const [term, setTerm] = useState(urlTerm);
  const [syncedTerm, setSyncedTerm] = useState(urlTerm);

  /**
   * Keep the box in step when the URL changes underneath it.
   *
   * A back press, or the clear-filters button, changes the query string
   * without anybody typing. Left alone, the input would still hold the old
   * text and the debounce below would helpfully navigate straight back again.
   *
   * Adjusted during render rather than in an effect. This is React's
   * documented way to reset state when a prop changes: it happens before
   * anything is painted, where an effect would render the stale value first
   * and then correct it.
   */
  if (syncedTerm !== urlTerm) {
    setSyncedTerm(urlTerm);
    setTerm(urlTerm);
  }

  function go(change: Partial<AdminProductQuery>) {
    startTransition(() => {
      router.replace(adminProductHref(query, change) as Route, { scroll: false });
    });
  }

  /**
   * Search as you type, but not on every keystroke.
   *
   * Each character would be a database query and a full re-render for a word
   * nobody has finished typing. A short pause after the last one is the whole
   * mechanism, and it is cancelled cleanly if another arrives.
   *
   * The effect navigates and sets no state of its own; the URL is the state,
   * and the render-time adjustment above brings the input back in line once
   * the navigation lands.
   */
  useEffect(() => {
    const next = term.trim();

    if (next === urlTerm) {
      return;
    }

    const timer = window.setTimeout(() => {
      startTransition(() => {
        router.replace(
          adminProductHref(query, { search: next || undefined }) as Route,
          { scroll: false },
        );
      });
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [term, urlTerm, query, router]);

  const narrowed =
    Boolean(query.search) ||
    Boolean(query.status) ||
    Boolean(query.category) ||
    Boolean(query.merchandising) ||
    Boolean(query.stock);

  return (
    <div
      className="space-y-3"
      // Dims while the next page is prepared, without removing the controls
      // or losing focus.
      data-pending={pending || undefined}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor={searchId}
            className="mb-1.5 block font-sans text-xs font-medium text-ink-muted"
          >
            Search
          </label>
          <Input
            id={searchId}
            type="search"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            placeholder="Name, slug, article number or SKU"
            autoComplete="off"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <FilterSelect
            label="Status"
            value={query.status ?? ""}
            onChange={(value) =>
              go({ status: (value || undefined) as AdminProductQuery["status"] })
            }
            options={STATUS_OPTIONS.map((option) => ({ ...option }))}
          />

          <FilterSelect
            label="Collection"
            value={query.category ?? ""}
            onChange={(value) => go({ category: value || undefined })}
            options={[
              { value: "", label: "Any collection" },
              ...categories.map((category) => ({
                value: category.slug,
                label: category.name,
              })),
            ]}
          />

          <FilterSelect
            label="Stock"
            value={query.stock ?? ""}
            onChange={(value) =>
              go({ stock: (value || undefined) as AdminProductQuery["stock"] })
            }
            options={[
              { value: "", label: "Any stock" },
              ...stockFilters.map((filter) => ({
                value: filter,
                label: STOCK_LABELS[filter],
              })),
            ]}
          />

          <FilterSelect
            label="Flag"
            value={query.merchandising ?? ""}
            onChange={(value) =>
              go({
                merchandising: (value || undefined) as AdminProductQuery["merchandising"],
              })
            }
            options={[
              { value: "", label: "Any flag" },
              ...merchandisingFilters.map((filter) => ({
                value: filter,
                label: FLAG_LABELS[filter],
              })),
            ]}
          />

          <FilterSelect
            label="Sort"
            value={query.sort}
            onChange={(value) =>
              go({ sort: value as AdminProductQuery["sort"] })
            }
            options={adminSortOptions.map((option) => ({ ...option }))}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Announced politely, so a filter change tells a screen reader user
            how many rows are left rather than silently redrawing the table. */}
        <p aria-live="polite" className="font-sans text-sm text-ink-muted">
          {resultCount === 0
            ? "No products match"
            : `${resultCount} ${resultCount === 1 ? "product" : "products"}`}
          {narrowed ? " for these filters" : " in the catalogue"}
        </p>

        {narrowed ? (
          <Button
            variant="link"
            size="sm"
            className="px-0"
            onClick={() =>
              startTransition(() => {
                router.replace("/admin/products", { scroll: false });
              })
            }
          >
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const id = useId();

  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-1.5 block font-sans text-xs font-medium text-ink-muted"
      >
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`${controlClassName} min-w-36 py-2`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
