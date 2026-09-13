import type { ReactNode } from "react";

import type { ProductCardData } from "@/types/commerce";
import { cn } from "@/lib/utils/cn";
import { ProductCard, ProductCardSkeleton } from "./product-card";

/**
 * The listing grid.
 *
 * Two columns on a phone, three from the tablet breakpoint and four on a wide
 * screen. Two on a phone rather than one because fashion shopping is
 * comparative: a single column makes scanning a collection tedious, and the
 * 4:5 image still reads clearly at half a phone width.
 *
 * Column counts step at the same breakpoints the rest of the site uses, so a
 * card never lands at an awkward intermediate width.
 */
type ProductGridProps = {
  products: readonly ProductCardData[];
  /** Cards to mark as priority; the rest load lazily. */
  priorityCount?: number;
  /** How much width a card gets, passed through to the image. */
  sizes?: string;
  className?: string;
};

const GRID =
  "grid grid-cols-2 gap-x-4 gap-y-9 sm:gap-x-5 md:grid-cols-3 lg:gap-x-6 lg:gap-y-12 xl:grid-cols-4";

export function ProductGrid({
  products,
  priorityCount = 0,
  sizes,
  className,
}: ProductGridProps) {
  return (
    <ul className={cn(GRID, className)}>
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard
            product={product}
            priority={index < priorityCount}
            sizes={sizes}
          />
        </li>
      ))}
    </ul>
  );
}

/**
 * The grid while data loads.
 *
 * The status is announced once, politely, and the boxes themselves are hidden
 * from assistive technology, so a screen reader hears "Loading products"
 * rather than a run of empty list items.
 */
export function ProductGridSkeleton({
  count = 8,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={className}>
      <p role="status" className="sr-only">
        Loading products
      </p>
      <div aria-hidden="true" className={GRID}>
        {Array.from({ length: count }, (_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}

/**
 * A titled row of products, used on the home and product pages.
 * The heading level is chosen by the caller so page outlines stay correct.
 */
export function ProductRail({
  title,
  action,
  products,
  headingId,
  priorityCount = 0,
}: {
  title: string;
  action?: ReactNode;
  products: readonly ProductCardData[];
  headingId: string;
  priorityCount?: number;
}) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby={headingId}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2
          id={headingId}
          className="font-display text-2xl font-light tracking-tight text-ink sm:text-3xl"
        >
          {title}
        </h2>
        {action}
      </div>

      <ProductGrid
        products={products}
        priorityCount={priorityCount}
        className="mt-8 sm:mt-10"
      />
    </section>
  );
}
