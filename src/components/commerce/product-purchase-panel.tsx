"use client";

import type { ProductDetailData } from "@/types/commerce";
import { Text } from "@/components/ui/typography";
import { AddToBagButton } from "./add-to-bag-button";
import { ColourSelector } from "./colour-selector";
import { SizeSelector } from "./size-selector";
import { useProductVariantSelection } from "./product-variant-selection";
import { WishlistButton } from "./wishlist-button";

/**
 * The part of a product page that needs state: which colour, which size, and
 * what happens when you try to buy.
 *
 * Kept to its own client component so the rest of the page, which is the
 * majority of it, stays server-rendered. The gallery is separate for the same
 * reason, and the two share one selection through
 * `ProductVariantProvider` so that choosing a colour changes both.
 *
 * **Which sizes are offered depends on the colour.** The size row is rebuilt
 * from the selected colour's variants, so a piece cut XS to M in ivory and M
 * to L in plum offers exactly that and strikes through the rest. The database
 * decides; this only renders the answer.
 *
 * **Adding to a bag is real as of Phase 9.** The colour and size chosen above
 * are turned into the one `ProductVariant` they name, and that id — and nothing
 * else — is what goes to the server. No price, no labels, no stock figure: the
 * server re-resolves the variant, checks it is still offered and in stock, and
 * takes the price from the catalogue. The lookup here only saves it from having
 * to guess which combination "Plum, M" meant.
 *
 * Until a size is chosen there is no variant, so the button says so rather than
 * disappearing or guessing one.
 *
 * **Saving, by contrast, is real.** The heart beside it writes to the database
 * through `WishlistButton`, which owns the whole of that behaviour — this panel
 * only hands it the product, the state the page read, and where to return to
 * after signing in. Deliberately no second copy of the toggle logic here: the
 * card on the shop grid and the control on this page are the same component,
 * so they cannot disagree about what a heart means.
 *
 * The wishlist is product-level, so the colour and size chosen above have
 * nothing to do with it. A shopper saves the piece; choosing "plum, M" is a
 * decision Cart will ask for against `ProductVariant`.
 */
export function ProductPurchasePanel({
  product,
  wishlisted,
}: {
  product: ProductDetailData;
  /** Whether the signed-in customer saved this. `null` when signed out. */
  wishlisted: boolean | null;
}) {
  const { colour, setColour, size, setSize, sizes } =
    useProductVariantSelection();

  const selectedColour = product.colours.find((entry) => entry.slug === colour);
  const hasSizes = sizes.length > 0;
  const anySizeAvailable = sizes.some((entry) => entry.available);

  // The one combination the two controls currently name. Null until both are
  // chosen, and null for a combination the product is not cut in — which the
  // size row already prevents, but this does not rely on it.
  const selectedVariant =
    colour !== null && size !== null
      ? product.variants.find(
          (entry) => entry.colourSlug === colour && entry.sizeValue === size,
        )
      : undefined;

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
            sizes={sizes}
            value={size}
            onChange={setSize}
            name={`size-${product.id}`}
            className="mt-3"
          />

          {!anySizeAvailable ? (
            <Text size="sm" className="mt-3">
              {selectedColour
                ? `Every size in ${selectedColour.name.toLowerCase()} is between production runs.`
                : "Every size is between production runs."}
            </Text>
          ) : null}
        </div>
      ) : null}

      {/* Wrapping, because both controls put their outcome message on a line of
          their own inside this row rather than in a box around themselves. */}
      <div className="flex flex-wrap items-start gap-3">
        <AddToBagButton
          variantId={selectedVariant?.id ?? null}
          productName={product.name}
          soldOut={!product.inStock}
          incompleteLabel={hasSizes ? "Select a size" : "Select an option"}
          className="min-w-40 flex-1"
        />

        <WishlistButton
          productId={product.id}
          productName={product.name}
          wishlisted={wishlisted}
          returnTo={`/shop/${product.slug}`}
          status="inline"
          className="size-12 shrink-0 rounded-control border border-line-strong shadow-none"
        />
      </div>

      <p
        id={`purchase-note-${product.id}`}
        className="rounded-control border border-line bg-surface px-4 py-3 font-sans text-sm leading-relaxed text-ink-muted"
      >
        Adding to your bag works now and your bag is kept, signed in or not.
        Checkout and payment open in a later release, and nothing is reserved
        until an order is placed.
      </p>
    </div>
  );
}
