import Link from "next/link";
import type { Route } from "next";

import type { ProductCardData } from "@/types/commerce";
import { cn } from "@/lib/utils/cn";
import { AddToBagButton } from "./add-to-bag-button";

/**
 * Quick add, on a product card.
 *
 * A card has no colour control and no size control, so most of the time it
 * cannot know which variant "add to bag" would mean. **It does not guess.**
 * Picking whatever the sort happened to put first is how a shopper receives the
 * wrong garment, discovers it a week later, and never comes back.
 *
 * So there are exactly two behaviours, decided by the data rather than by the
 * component:
 *
 * - **One purchasable combination** — a one-size piece, or one cut in a single
 *   colour and a single size. `soleVariantId` is set, there is nothing to
 *   choose, and the card adds it directly.
 * - **Anything else** — the control is a link to the product page, labelled
 *   "Choose size", which is where the colour and size controls live. One tap
 *   instead of one tap, and it lands somewhere that can answer the question.
 *
 * `soleVariantId` is computed in the product mapper from variant rows the card
 * query was already reading, so this costs no extra query and no per-card
 * lookup. See `lib/catalog/product-mapper.ts`.
 *
 * ## Why it is hidden until hover or focus on a large screen
 *
 * A grid where every card carries a permanent button is a grid of buttons
 * rather than a grid of clothes, which is the wrong first impression for a
 * fashion storefront. On a pointer device it appears on hover; **on focus too**,
 * so it is reachable by keyboard and is never a pointer-only feature. Below the
 * large breakpoint, where there is no hover, it is simply always visible.
 */
export function CardQuickAdd({
  product,
  className,
}: {
  product: ProductCardData;
  className?: string;
}) {
  // Nothing to offer. A sold-out card says so through its badge already, and a
  // second control repeating it would be noise.
  if (!product.inStock) {
    return null;
  }

  const shell = cn(
    "absolute inset-x-2 bottom-2 z-10",
    // Always visible where there is no hover to reveal it.
    "lg:opacity-0 lg:transition-opacity lg:duration-200",
    "lg:group-hover:opacity-100 lg:group-focus-within:opacity-100",
    className,
  );

  if (product.soleVariantId) {
    return (
      <div className={shell}>
        <AddToBagButton
          variantId={product.soleVariantId}
          productName={product.name}
          size="md"
          status="sr-only"
          className="w-full shadow-subtle"
        />
      </div>
    );
  }

  return (
    <div className={shell}>
      <Link
        href={`/shop/${product.slug}` as Route}
        aria-label={`Choose a size for ${product.name}`}
        className={cn(
          "flex h-11 w-full items-center justify-center rounded-control",
          "bg-canvas/95 font-sans text-sm font-medium text-ink shadow-subtle",
          "transition-colors hover:bg-canvas hover:text-brand-strong",
        )}
      >
        Choose size
      </Link>
    </div>
  );
}
