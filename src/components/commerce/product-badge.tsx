import type { ProductBadgeKind } from "@/types/commerce";
import { cn } from "@/lib/utils/cn";

/**
 * The small label on a product image.
 *
 * Kept quiet on purpose: a grid where every card shouts is a grid where
 * nothing stands out. Most products carry none, and a card shows at most one.
 */
const BADGES: Record<
  ProductBadgeKind,
  { label: string; className: string }
> = {
  new: { label: "New", className: "bg-canvas text-ink" },
  sale: { label: "Sale", className: "bg-brand text-on-brand" },
  bestseller: { label: "Bestseller", className: "bg-canvas text-ink" },
  featured: { label: "Featured", className: "bg-canvas text-ink" },
  "sold-out": { label: "Sold out", className: "bg-ink-900 text-canvas" },
};

/**
 * Which badge to show when a product qualifies for several.
 * Availability first, because it changes whether the card is worth tapping.
 */
const PRIORITY: readonly ProductBadgeKind[] = [
  "sold-out",
  "sale",
  "new",
  "bestseller",
  "featured",
];

export function pickPrimaryBadge(
  badges: readonly ProductBadgeKind[],
  inStock: boolean,
): ProductBadgeKind | null {
  const candidates = inStock ? badges : ([...badges, "sold-out"] as const);
  return PRIORITY.find((kind) => candidates.includes(kind)) ?? null;
}

export function ProductBadge({
  kind,
  className,
}: {
  kind: ProductBadgeKind;
  className?: string;
}) {
  const badge = BADGES[kind];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 font-sans text-[0.6875rem] font-medium uppercase tracking-wider shadow-subtle",
        badge.className,
        className,
      )}
    >
      {badge.label}
    </span>
  );
}
