"use client";

import { useId, useState } from "react";

import { productQueryParams } from "@/features/storefront/product-query";
import { useProductFilters } from "@/features/storefront/use-product-filters";
import type { FilterGroup, FilterOption } from "@/types/commerce";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

/**
 * The filter controls.
 *
 * Every control is a real checkbox in a real fieldset, so the browser supplies
 * the roles, the grouping and the announcements. Selecting one writes to the
 * URL; the server re-renders the listing from that URL. Nothing here decides
 * what matches.
 *
 * The same component is the desktop sidebar and the contents of the mobile
 * drawer. One set of controls, two placements, so the two cannot drift apart.
 */
type FilterPanelProps = {
  groups: readonly FilterGroup[];
  className?: string;
};

export function FilterPanel({ groups, className }: FilterPanelProps) {
  const { toggleValue, setValue, isSelected, pending } = useProductFilters();

  return (
    <div
      className={cn("space-y-8", className)}
      // Dims while the next results are being prepared, without removing the
      // controls or losing focus.
      data-pending={pending || undefined}
    >
      <FilterFieldset legend="Availability">
        <CheckboxRow
          label="On sale"
          checked={isSelected(productQueryParams.sale, "true")}
          onChange={(checked) =>
            setValue(productQueryParams.sale, checked ? "true" : null)
          }
        />
        <CheckboxRow
          label="In stock"
          checked={isSelected(productQueryParams.inStock, "true")}
          onChange={(checked) =>
            setValue(productQueryParams.inStock, checked ? "true" : null)
          }
        />
      </FilterFieldset>

      {/* Merchandising, kept in its own group rather than mixed into
          availability: these say what the shop has picked out, not what is on
          the shelf. None of them is a sales figure. */}
      <FilterFieldset legend="Collections">
        <CheckboxRow
          label="New arrivals"
          checked={isSelected(productQueryParams.newArrival, "true")}
          onChange={(checked) =>
            setValue(productQueryParams.newArrival, checked ? "true" : null)
          }
        />
        <CheckboxRow
          label="Featured"
          checked={isSelected(productQueryParams.featured, "true")}
          onChange={(checked) =>
            setValue(productQueryParams.featured, checked ? "true" : null)
          }
        />
        <CheckboxRow
          label="Purple Rose picks"
          checked={isSelected(productQueryParams.bestSeller, "true")}
          onChange={(checked) =>
            setValue(productQueryParams.bestSeller, checked ? "true" : null)
          }
        />
      </FilterFieldset>

      {groups.map((group) => (
        <FilterGroupFieldset
          key={group.param}
          group={group}
          isSelected={isSelected}
          onToggle={toggleValue}
        />
      ))}

      <PriceFilter />
    </div>
  );
}

/** Options shown before a group collapses behind a "show all" control. */
const COLLAPSE_AFTER = 8;

/**
 * One filter group.
 *
 * A long list is truncated, because a colour group with twenty entries pushes
 * the price filter below the fold and makes the sidebar taller than the
 * results it is filtering. Any selected option is always shown, so a filter
 * can never be active and hidden at the same time.
 */
function FilterGroupFieldset({
  group,
  isSelected,
  onToggle,
}: {
  group: FilterGroup;
  isSelected: (param: string, value: string) => boolean;
  onToggle: (param: string, value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const overflows = group.options.length > COLLAPSE_AFTER;

  const visible =
    !overflows || expanded
      ? group.options
      : group.options.filter(
          (option, index) =>
            index < COLLAPSE_AFTER || isSelected(group.param, option.value),
        );

  return (
    <FilterFieldset legend={group.label}>
      {visible.map((option) => (
        <CheckboxRow
          key={option.value}
          label={option.label}
          count={option.count}
          swatch={option.hex}
          checked={isSelected(group.param, option.value)}
          onChange={() => onToggle(group.param, option.value)}
        />
      ))}

      {overflows ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="mt-1 rounded-control px-1 py-1.5 font-sans text-sm text-brand underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
        >
          {expanded
            ? "Show fewer"
            : `Show all ${group.options.length} ${group.label.toLowerCase()}`}
        </button>
      ) : null}
    </FilterFieldset>
  );
}

function FilterFieldset({
  legend,
  children,
}: {
  legend: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle">
        {legend}
      </legend>
      <div className="mt-4 space-y-1">{children}</div>
    </fieldset>
  );
}

/**
 * One option. The whole row is the label, so the tap target is the full width
 * rather than a 16-pixel box.
 */
function CheckboxRow({
  label,
  count,
  swatch,
  checked,
  onChange,
}: {
  label: string;
  count?: FilterOption["count"];
  swatch?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-control py-2 pr-2 font-sans text-sm text-ink transition-colors hover:bg-surface has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand">
      {/* A real checkbox, tinted with `accent-color`. Replacing it with a
          styled box would mean re-implementing the checked state, the
          indeterminate state and the focus ring that the browser already
          gets right. */}
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 shrink-0 cursor-pointer accent-ink"
      />

      {swatch ? (
        <span
          aria-hidden="true"
          style={{ backgroundColor: swatch }}
          className="size-4 shrink-0 rounded-full ring-1 ring-inset ring-ink-950/15"
        />
      ) : null}

      <span className="flex-1">{label}</span>

      {typeof count === "number" ? (
        <span className="font-sans text-xs text-ink-subtle">{count}</span>
      ) : null}
    </label>
  );
}

/**
 * Price bounds as two number fields rather than a drag slider.
 *
 * A two-thumb slider is a poor control on a touch screen and a bad one for
 * keyboard and screen reader users. Typed bounds are exact, reachable and
 * understood by everyone. Values are in whole rupees, which is what the
 * shopper sees.
 */
function PriceFilter() {
  const { setPriceRange, pending } = useProductFilters();
  const minId = useId();
  const maxId = useId();

  function readBound(form: HTMLFormElement, name: string): string | null {
    const raw = new FormData(form).get(name);
    const trimmed = typeof raw === "string" ? raw.trim() : "";

    if (!trimmed) {
      return null;
    }

    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? String(parsed) : null;
  }

  return (
    <fieldset>
      <legend className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle">
        Price
      </legend>

      {/* Applied on submit rather than on every keystroke, so typing "2500"
          does not fire four navigations. Enter and the button do the same
          thing, and both bounds travel together. */}
      <form
        className="mt-4 flex items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          setPriceRange(
            readBound(form, productQueryParams.minPrice),
            readBound(form, productQueryParams.maxPrice),
          );
        }}
      >
        <div className="flex-1">
          <label
            htmlFor={minId}
            className="block font-sans text-xs text-ink-subtle"
          >
            Min
          </label>
          <input
            id={minId}
            name={productQueryParams.minPrice}
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            placeholder="0"
            disabled={pending}
            className="mt-1 block w-full rounded-control border border-line-strong bg-canvas px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-subtle"
          />
        </div>

        <div className="flex-1">
          <label
            htmlFor={maxId}
            className="block font-sans text-xs text-ink-subtle"
          >
            Max
          </label>
          <input
            id={maxId}
            name={productQueryParams.maxPrice}
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            placeholder="Any"
            disabled={pending}
            className="mt-1 block w-full rounded-control border border-line-strong bg-canvas px-3 py-2 font-sans text-sm text-ink placeholder:text-ink-subtle"
          />
        </div>

        <Button type="submit" variant="secondary" size="sm" className="shrink-0">
          Apply
        </Button>
      </form>
    </fieldset>
  );
}
