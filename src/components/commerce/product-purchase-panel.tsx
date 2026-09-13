"use client";

import { useState } from "react";

import type { ProductDetailData } from "@/types/commerce";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/typography";
import { ColourSelector } from "./colour-selector";
import { SizeSelector } from "./size-selector";
import { WishlistButton } from "./wishlist-button";

/**
 * The part of a product page that needs state: which colour, which size, and
 * what happens when you try to buy.
 *
 * Kept to its own client component so the rest of the page, which is the
 * majority of it, stays server-rendered. The gallery is separate for the same
 * reason.
 *
 * Adding to a bag has nowhere to go yet: there is no cart table and no action.
 * So the button says what it is waiting for instead of appearing to work.
 * Everything around it, including the requirement to choose a size first, is
 * the real behaviour and stays when checkout arrives.
 */
export function ProductPurchasePanel({ product }: { product: ProductDetailData }) {
  const firstAvailableColour =
    product.colours.find((colour) => colour.available)?.slug ?? null;

  const [colour, setColour] = useState<string | null>(firstAvailableColour);
  const [size, setSize] = useState<string | null>(null);

  const selectedColour = product.colours.find((entry) => entry.slug === colour);
  const hasSizes = product.sizes.length > 0;
  const anySizeAvailable = product.sizes.some((entry) => entry.available);

  return (
    <div className="space-y-7">
      {product.colours.length > 0 ? (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-sans text-sm font-medium text-ink">Colour</h2>
            {/* The chosen colour is named in text, so the swatch ring is never
                the only thing carrying the information. */}
            <p className="font-sans text-sm text-ink-muted">
              {selectedColour?.name ?? "Choose one"}
            </p>
          </div>
          <ColourSelector
            colours={product.colours}
            value={colour}
            onChange={setColour}
            name={`colour-${product.id}`}
            className="mt-3"
          />
        </div>
      ) : null}

      {hasSizes ? (
        <div>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-sans text-sm font-medium text-ink">Size</h2>
            <span
              title="The size guide is published with the catalogue"
              className="font-sans text-sm text-ink-subtle"
            >
              Size guide
              <span className="sr-only">
                {" "}
                — published with the catalogue
              </span>
            </span>
          </div>

          <SizeSelector
            sizes={product.sizes}
            value={size}
            onChange={setSize}
            name={`size-${product.id}`}
            className="mt-3"
          />

          {!anySizeAvailable ? (
            <Text size="sm" className="mt-3">
              Every size is between production runs.
            </Text>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-3">
        <Button
          size="lg"
          className="flex-1"
          aria-disabled="true"
          title="Adding to a bag opens with checkout"
          aria-describedby={`purchase-note-${product.id}`}
        >
          {product.inStock ? "Add to bag" : "Sold out"}
        </Button>

        <WishlistButton
          productName={product.name}
          className="shrink-0 rounded-control border border-line-strong shadow-none"
        />
      </div>

      <p
        id={`purchase-note-${product.id}`}
        className="rounded-control border border-line bg-surface px-4 py-3 font-sans text-sm leading-relaxed text-ink-muted"
      >
        Ordering opens with checkout. Choosing a colour and size works now so
        the flow can be checked, but nothing is added or reserved.
      </p>
    </div>
  );
}
