import type { ReactNode } from "react";

import { ProductStatus } from "@/generated/prisma/enums";
import { cn } from "@/lib/utils/cn";

/**
 * The small, repeated pieces of the admin interface.
 *
 * Server Components: none of them holds state, and keeping them off the client
 * means a table of fifty status pills ships no JavaScript.
 *
 * The admin area shares Purple Rose's tokens but not its manner. The storefront
 * is editorial — display type, generous space, photography carrying the page.
 * This is a workspace: dense rows, plain sans type, borders doing the
 * separating rather than shadows, and no decoration that is not telling
 * somebody something.
 */

/* ------------------------------------------------------------------ *
 * Page furniture
 * ------------------------------------------------------------------ */

export function AdminPageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="border-b border-line pb-5">
      {breadcrumb ? <div className="mb-3">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-sans text-xl font-medium tracking-tight text-ink">
            {title}
          </h1>
          {description ? (
            <p className="mt-1.5 max-w-2xl font-sans text-sm leading-relaxed text-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

/** A bordered panel. The admin equivalent of a card, without the softness. */
export function AdminPanel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn("rounded-card border border-line bg-canvas", className)}
    >
      {title ? (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-sans text-sm font-medium text-ink">{title}</h2>
            {description ? (
              <p className="mt-1 max-w-xl font-sans text-sm leading-relaxed text-ink-muted">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      ) : null}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}

/**
 * One section of a long form.
 *
 * Product editing is a lot of fields. Grouping them under headings with their
 * own explanation is what makes the difference between a form and a wall, and
 * each `fieldset`/`legend` pair also gives a screen reader the same grouping a
 * sighted user gets from the heading.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset
      className={cn(
        "rounded-card border border-line bg-canvas px-5 py-5 sm:px-6",
        className,
      )}
    >
      <legend className="px-1 font-sans text-sm font-medium text-ink">
        {title}
      </legend>
      {description ? (
        <p className="mb-5 mt-1 max-w-2xl font-sans text-sm leading-relaxed text-ink-muted">
          {description}
        </p>
      ) : (
        <div className="mb-5" />
      )}
      <div className="space-y-5">{children}</div>
    </fieldset>
  );
}

/* ------------------------------------------------------------------ *
 * Status
 * ------------------------------------------------------------------ */

/**
 * A product's publication state.
 *
 * **The word is the status.** Colour is a second channel carrying the same
 * information, never the only one, so it reads correctly in greyscale, to
 * anyone with any form of colour vision, and to a screen reader. The shape
 * differs too: live is filled, draft is outlined, archived is struck through
 * with a muted fill.
 */
const statusStyles: Record<ProductStatus, { label: string; className: string }> = {
  ACTIVE: {
    label: "Live",
    className: "bg-brand-soft text-brand-strong ring-1 ring-inset ring-brand/30",
  },
  DRAFT: {
    label: "Draft",
    className: "bg-canvas text-ink-muted ring-1 ring-inset ring-line-strong",
  },
  ARCHIVED: {
    label: "Archived",
    className: "bg-surface-strong text-ink-subtle ring-1 ring-inset ring-line",
  },
};

export function StatusPill({
  status,
  className,
}: {
  status: ProductStatus;
  className?: string;
}) {
  const style = statusStyles[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 font-sans text-xs font-medium",
        style.className,
        className,
      )}
    >
      {style.label}
    </span>
  );
}

/** On or off, for collections, variants and anything else with a switch. */
export function ActivePill({
  active,
  activeLabel = "Active",
  inactiveLabel = "Hidden",
}: {
  active: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 font-sans text-xs font-medium",
        active
          ? "bg-brand-soft text-brand-strong ring-1 ring-inset ring-brand/30"
          : "bg-surface-strong text-ink-subtle ring-1 ring-inset ring-line",
      )}
    >
      {active ? activeLabel : inactiveLabel}
    </span>
  );
}

/**
 * Stock health for a product row.
 *
 * Three states, each stated in words: everything gone, something running low,
 * or fine. The number is always shown, because "12 in stock" is what somebody
 * actually wants to know and "Low" on its own is not actionable.
 */
export function StockSummary({
  variants,
  inStock,
  units,
  low,
}: {
  variants: number;
  inStock: number;
  units: number;
  low: number;
}) {
  if (variants === 0) {
    return (
      <span className="font-sans text-xs text-ink-subtle">
        No variants yet
      </span>
    );
  }

  const state =
    inStock === 0 ? "out" : low > 0 ? "low" : ("ok" as const);

  const label =
    state === "out"
      ? "Out of stock"
      : state === "low"
        ? `${low} running low`
        : "In stock";

  return (
    <span className="flex flex-col gap-0.5">
      <span
        className={cn(
          "font-sans text-xs font-medium",
          state === "out"
            ? "text-ink"
            : state === "low"
              ? "text-brand-strong"
              : "text-ink-muted",
        )}
      >
        {label}
      </span>
      <span className="font-sans text-xs text-ink-subtle">
        {units} {units === 1 ? "unit" : "units"} across {inStock}/{variants}{" "}
        {variants === 1 ? "variant" : "variants"}
      </span>
    </span>
  );
}

/** The merchandising flags a product carries, as words. */
export function MerchandisingFlags({
  featured,
  newArrival,
  bestSeller,
  seasonal,
  onSale,
}: {
  featured: boolean;
  newArrival: boolean;
  bestSeller: boolean;
  seasonal: boolean;
  onSale: boolean;
}) {
  const flags = [
    onSale && "Sale",
    newArrival && "New",
    featured && "Featured",
    bestSeller && "Pick",
    seasonal && "Seasonal",
  ].filter((flag): flag is string => typeof flag === "string");

  if (flags.length === 0) {
    return <span className="font-sans text-xs text-ink-subtle">—</span>;
  }

  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((flag) => (
        <span
          key={flag}
          className="inline-flex items-center rounded border border-line-strong px-1.5 py-0.5 font-sans text-[0.6875rem] text-ink-muted"
        >
          {flag}
        </span>
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Empty states
 * ------------------------------------------------------------------ */

/**
 * Nothing here, and that is fine.
 *
 * Deliberately not styled as an error: an empty catalogue is a new shop, not a
 * fault. Each one says what to do next, and the action is the next thing the
 * admin would have gone looking for.
 */
export function AdminEmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
      <p className="font-sans text-sm font-medium text-ink">{title}</p>
      <p className="mx-auto mt-2 max-w-md font-sans text-sm leading-relaxed text-ink-muted">
        {description}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** A number and what it counts. The dashboard is made of these. */
export function MetricTile({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: number | string;
  detail?: string;
  href?: ReactNode;
}) {
  return (
    <div className="rounded-card border border-line bg-canvas px-4 py-4">
      <p className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle">
        {label}
      </p>
      <p className="mt-2 font-sans text-2xl font-medium tabular-nums text-ink">
        {value}
      </p>
      {detail ? (
        <p className="mt-1 font-sans text-xs leading-relaxed text-ink-muted">
          {detail}
        </p>
      ) : null}
      {href ? <div className="mt-2">{href}</div> : null}
    </div>
  );
}

/** A date, written the way a person reads one. */
export function formatAdminDate(value: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(value);
}
