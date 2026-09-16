"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

import type {
  ProductColourOption,
  ProductDetailData,
  ProductSize,
  StorefrontImage,
} from "@/types/commerce";
import { ProductGallery } from "./product-gallery";

/**
 * Which colour and which size are currently chosen.
 *
 * The gallery and the purchase panel are two separate client components on
 * opposite sides of a two-column layout, with server-rendered copy between
 * them. Choosing a colour has to change both. A small context is what lets
 * that happen without lifting the whole product page into the browser: the
 * description, the details, the delivery notes and the related rail stay
 * server-rendered and are passed straight through this provider as children.
 *
 * **The data is not held here.** Every colour, every size and every
 * photograph arrives from the server inside `ProductDetailData`, built from
 * variant rows. This only remembers which of them is selected, and enforces
 * one rule that the database is the source of truth for: a combination that
 * does not exist cannot be selected.
 */

type VariantSelection = {
  /** Slug of the chosen colour, or null when a product has no colours. */
  colour: string | null;
  /** The chosen size code, or null until one is picked. */
  size: string | null;
  setColour: (slug: string) => void;
  setSize: (value: string) => void;
  /** The chosen colour, when one is chosen and known. */
  option: ProductColourOption | undefined;
  /** Photographs for the chosen colour, or every photograph. */
  images: readonly StorefrontImage[];
  /** The size run, marked available for the chosen colour. */
  sizes: readonly ProductSize[];
};

const SelectionContext = createContext<VariantSelection | null>(null);

function useSelection(): VariantSelection {
  const value = useContext(SelectionContext);

  if (!value) {
    throw new Error(
      "Product variant controls must be rendered inside <ProductVariantProvider>.",
    );
  }

  return value;
}

export function ProductVariantProvider({
  product,
  children,
}: {
  product: ProductDetailData;
  children: ReactNode;
}) {
  // Open on something buyable. Landing on a sold-out colour would show a
  // struck-through swatch and an empty size row before anything was touched.
  const initialColour =
    product.colourOptions.find((option) => option.available)?.slug ??
    product.colourOptions[0]?.slug ??
    null;

  const [colour, setColourState] = useState<string | null>(initialColour);
  const [size, setSize] = useState<string | null>(null);

  const option = useMemo(
    () => product.colourOptions.find((entry) => entry.slug === colour),
    [product.colourOptions, colour],
  );

  const setColour = useCallback(
    (next: string) => {
      setColourState(next);

      // A size chosen in the old colour may not be cut in the new one. Rather
      // than leave a combination selected that cannot be bought, the size is
      // cleared and has to be chosen again from what this colour has.
      setSize((current) => {
        if (current === null) {
          return null;
        }

        const target = product.colourOptions.find((entry) => entry.slug === next);
        const stillAvailable = target?.sizes.some(
          (entry) => entry.value === current && entry.available,
        );

        return stillAvailable ? current : null;
      });
    },
    [product.colourOptions],
  );

  const value = useMemo<VariantSelection>(
    () => ({
      colour,
      size,
      setColour,
      setSize,
      option,
      // A colour with no photography of its own falls back to the full set,
      // so the gallery is never empty.
      images: option && option.images.length > 0 ? option.images : product.images,
      sizes: option ? option.sizes : product.sizes,
    }),
    [colour, size, setColour, option, product.images, product.sizes],
  );

  return (
    <SelectionContext.Provider value={value}>
      {children}
    </SelectionContext.Provider>
  );
}

/**
 * The gallery, showing whichever colour is selected.
 *
 * `key` remounts it when the colour changes, which resets the thumbnail strip
 * to the first photograph of the new colour. Without that, switching from the
 * fourth ivory shot to a colour with two photographs would leave the selection
 * pointing past the end.
 */
export function ProductColourGallery({ productName }: { productName: string }) {
  const { colour, images } = useSelection();

  return (
    <ProductGallery
      key={colour ?? "default"}
      images={images}
      productName={productName}
    />
  );
}

export { useSelection as useProductVariantSelection };
