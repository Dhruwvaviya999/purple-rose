import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

import type { ProductCardData } from "@/types/commerce";
import { cn } from "@/lib/utils/cn";
import { Price } from "./price";
import { ProductBadge, pickPrimaryBadge } from "./product-badge";
import { WishlistButton } from "./wishlist-button";

/**
 * A product in a listing.
 *
 * A Server Component. It takes typed data through props, runs no query and
 * knows nothing about where the data came from, so the same card renders mock
 * data today and database rows in Phase 5 without changing.
 *
 * The whole card is one link, with the image and the name inside it, so the
 * tap target on a phone is the card rather than a line of text. The wishlist
 * control sits outside that link, because a button nested in an anchor is not
 * valid and behaves unpredictably.
 */
type ProductCardProps = {
  product: ProductCardData;
  /**
   * Set on the first few cards above the fold. Everything else stays lazy,
   * which is the default.
   */
  priority?: boolean;
  /**
   * Describes how much width the card gets at each breakpoint so the browser
   * can pick a sensible source. Defaults to the shop grid.
   */
  sizes?: string;
  className?: string;
};

const DEFAULT_SIZES =
  "(min-width: 1280px) 22vw, (min-width: 768px) 30vw, 45vw";

export function ProductCard({
  product,
  priority = false,
  sizes = DEFAULT_SIZES,
  className,
}: ProductCardProps) {
  const badge = pickPrimaryBadge(product.badges, product.inStock);
  const href = `/shop/${product.slug}` as Route;

  return (
    <article className={cn("group relative flex flex-col", className)}>
      <div className="relative overflow-hidden rounded-card bg-surface">
        <Link href={href} className="block">
          {/* The ratio is fixed, so the row never reflows as images arrive. */}
          <div className="relative aspect-[4/5] w-full">
            <Image
              src={product.image.src}
              alt={product.image.alt}
              fill
              sizes={sizes}
              priority={priority}
              className={cn(
                "object-cover transition-opacity duration-500",
                // The second shot fades in on hover, and on keyboard focus
                // too, so it is not a pointer-only flourish.
                product.hoverImage &&
                  "group-hover:opacity-0 group-focus-within:opacity-0",
                !product.inStock && "opacity-75",
              )}
            />

            {product.hoverImage ? (
              <Image
                src={product.hoverImage.src}
                alt=""
                aria-hidden="true"
                fill
                sizes={sizes}
                className="object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100 group-focus-within:opacity-100"
              />
            ) : null}
          </div>

          <span className="sr-only">View {product.name}</span>
        </Link>

        {badge ? (
          <ProductBadge kind={badge} className="absolute left-3 top-3" />
        ) : null}

        <WishlistButton
          productName={product.name}
          size="sm"
          className="absolute right-3 top-3"
        />
      </div>

      <div className="mt-3.5 flex flex-col gap-1.5">
        <h3 className="font-sans text-sm font-medium leading-snug text-ink">
          {/* Stretched over the image block above, so the name is the
              accessible link text while the whole tile stays tappable. */}
          <Link href={href} className="after:absolute after:inset-0">
            {product.name}
          </Link>
        </h3>

        <p className="font-sans text-xs text-ink-subtle">
          {product.category.name}
        </p>

        <Price price={product.price} compareAtPrice={product.compareAtPrice} />

        {product.colours.length > 1 ? (
          <ColourPreview colours={product.colours} />
        ) : null}
      </div>
    </article>
  );
}

/**
 * Swatches shown under the price. Decorative: the real selector is on the
 * product page, so the colour names are given once as text for screen readers
 * instead of six unlabelled dots.
 */
function ColourPreview({
  colours,
}: {
  colours: ProductCardData["colours"];
}) {
  const shown = colours.slice(0, 4);
  const extra = colours.length - shown.length;

  return (
    <p className="mt-0.5 flex items-center gap-1.5">
      <span className="sr-only">
        Available in {colours.map((colour) => colour.name).join(", ")}
      </span>

      {shown.map((colour) => (
        <span
          key={colour.slug}
          aria-hidden="true"
          style={{ backgroundColor: colour.hex }}
          className="size-3 rounded-full ring-1 ring-inset ring-ink-950/15"
        />
      ))}

      {extra > 0 ? (
        <span aria-hidden="true" className="font-sans text-xs text-ink-subtle">
          +{extra}
        </span>
      ) : null}
    </p>
  );
}

/** The card's shape while data is loading. Mirrors the layout above exactly. */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col">
      <div className="aspect-[4/5] w-full animate-pulse rounded-card bg-surface-strong" />
      <div className="mt-3.5 space-y-2">
        <div className="h-4 w-3/4 animate-pulse rounded bg-surface-strong" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-surface-strong" />
        <div className="h-4 w-1/4 animate-pulse rounded bg-surface-strong" />
      </div>
    </div>
  );
}
