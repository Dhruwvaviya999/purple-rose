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
 * knows nothing about where the data came from. That is why connecting the real
 * catalogue in Phase 5 did not change a line of it, and why connecting the
 * wishlist in Phase 8 added two props rather than a database call: `wishlisted`
 * arrives from the page, which read the state for every card on it in one
 * query. **A card must never look its own state up.** Twenty-four cards doing
 * that is twenty-four round trips.
 *
 * The whole card is one link, with the image and the name inside it, so the tap
 * target on a phone is the card rather than a line of text. The wishlist
 * control sits outside that link, because a button nested in an anchor is not
 * valid and behaves unpredictably.
 */
type ProductCardProps = {
  product: ProductCardData;
  /**
   * Whether the signed-in customer has saved this piece. `null` — the default —
   * means nobody is signed in, and the heart becomes a link to sign in.
   */
  wishlisted?: boolean | null;
  /**
   * The product has been unpublished or archived since it was saved.
   *
   * Only the wishlist passes this: it is the one surface that shows a product
   * the storefront would not. The card keeps the photograph and the name, so
   * the customer can see what they saved, and loses the link and the price,
   * because there is nothing to open and nothing being offered. The heart stays
   * so the entry can be cleared.
   */
  unavailable?: boolean;
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
  wishlisted = null,
  unavailable = false,
  priority = false,
  sizes = DEFAULT_SIZES,
  className,
}: ProductCardProps) {
  const badge = unavailable
    ? "unavailable"
    : pickPrimaryBadge(product.badges, product.inStock);
  const href = `/shop/${product.slug}` as Route;

  const media = (
    /* The ratio is fixed, so the row never reflows as images arrive. */
    <div className="relative aspect-[4/5] w-full">
      <Image
        src={product.image.src}
        alt={product.image.alt}
        fill
        sizes={sizes}
        priority={priority}
        className={cn(
          "object-cover transition-opacity duration-500",
          // The second shot fades in on hover, and on keyboard focus too, so it
          // is not a pointer-only flourish. An unavailable card has nothing to
          // reveal, so it does not swap.
          product.hoverImage &&
            !unavailable &&
            "group-hover:opacity-0 group-focus-within:opacity-0",
          (!product.inStock || unavailable) && "opacity-75",
          // Enough to read as withdrawn at a glance, not so much that the piece
          // stops being recognisable.
          unavailable && "grayscale",
        )}
      />

      {product.hoverImage && !unavailable ? (
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
  );

  return (
    <article className={cn("group relative flex flex-col", className)}>
      <div className="relative overflow-hidden rounded-card bg-surface">
        {unavailable ? (
          // Deliberately not a link. The product page answers 404 for anything
          // that is not ACTIVE, so linking would send somebody who saved a
          // piece to a not-found page and make it look like the fault was
          // theirs.
          media
        ) : (
          <Link href={href} className="block">
            {media}
            <span className="sr-only">View {product.name}</span>
          </Link>
        )}

        {badge ? (
          <ProductBadge kind={badge} className="absolute left-3 top-3" />
        ) : null}

        {/*
          `z-10` is load-bearing. The product name below is a stretched link —
          `after:absolute after:inset-0` — which lays a transparent layer over
          the whole card so the entire tile is tappable. Without a stacking
          order the heart sits underneath it, and every click on it opens the
          product instead of saving it. It looked fine for four phases because
          the control did nothing.
        */}
        <WishlistButton
          productId={product.id}
          productName={product.name}
          wishlisted={wishlisted}
          returnTo={href}
          size="sm"
          className="absolute right-3 top-3 z-10"
        />
      </div>

      <div className="mt-3.5 flex flex-col gap-1.5">
        <h3 className="font-sans text-sm font-medium leading-snug text-ink">
          {unavailable ? (
            product.name
          ) : (
            /* Stretched over the image block above, so the name is the
               accessible link text while the whole tile stays tappable. */
            <Link href={href} className="after:absolute after:inset-0">
              {product.name}
            </Link>
          )}
        </h3>

        <p className="font-sans text-xs text-ink-subtle">
          {product.category.name}
        </p>

        {unavailable ? (
          // No price, because nothing is being offered at it. The sentence says
          // what is true and what may change, rather than only "Unavailable".
          <p className="font-sans text-sm text-ink-muted">
            Currently unavailable
            <span className="mt-0.5 block text-xs text-ink-subtle">
              Saved — it returns here if this piece comes back.
            </span>
          </p>
        ) : (
          <>
            <Price
              price={product.price}
              compareAtPrice={product.compareAtPrice}
            />

            {product.colours.length > 1 ? (
              <ColourPreview colours={product.colours} />
            ) : null}
          </>
        )}
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
