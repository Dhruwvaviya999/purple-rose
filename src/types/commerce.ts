/**
 * Presentation types for the storefront.
 *
 * These describe what the UI needs to render, not how anything is stored. No
 * component imports a Prisma type, so the database schema can change shape
 * without a single component changing with it.
 *
 * `src/lib/catalog/product-mapper.ts` maps a Prisma `Product` into
 * `ProductCardData` or `ProductDetailData`. That mapping is the only place the
 * two vocabularies meet, which is what let the schema arrive in Phase 5
 * without a single component changing with it.
 *
 * Money is always an integer in the currency minor unit. See
 * `src/lib/utils/format-price.ts`.
 */

/** An image with its intrinsic size, so a box can be reserved before it loads. */
export type StorefrontImage = {
  src: string;
  /** Describes the garment. Never "product image". */
  alt: string;
  width: number;
  height: number;
};

/** The small labels a card may carry. Kept few on purpose. */
export type ProductBadgeKind =
  | "new"
  | "sale"
  | "bestseller"
  | "featured"
  | "sold-out"
  /** Withdrawn from sale. Only the wishlist shows this: it is the one surface
   *  that renders a product the storefront no longer lists. */
  | "unavailable";

export type ProductColour = {
  /** Human name, shown to screen readers and in tooltips. */
  name: string;
  slug: string;
  /** CSS colour for the swatch. The only place a product-specific colour
   *  value is allowed, because it describes the garment, not the interface. */
  hex: string;
  available: boolean;
};

export type ProductSize = {
  /** What the shopper reads: "M", "28", "Free". */
  label: string;
  value: string;
  available: boolean;
};

/**
 * One sellable combination, as the interface refers to it.
 *
 * Added in Phase 9. Colour and size are what a shopper picks; a variant id is
 * what a bag holds. This is the translation between the two, and it exists so
 * the browser can name the exact row it means rather than sending two labels
 * and hoping the server matches them the same way.
 *
 * The id is not authority. The server re-resolves the variant, re-checks that
 * it belongs to an ACTIVE product, is still offered and has stock, and takes
 * the price from the catalogue — see `docs/cart/README.md`. This only saves the
 * server from guessing which combination "Pink, M" meant.
 */
export type ProductVariantOption = {
  id: string;
  sku: string;
  /** Matches `ProductColour.slug`. */
  colourSlug: string;
  /** Matches `ProductSize.value`. */
  sizeValue: string;
  /** Currently in stock. Presentation only; the server checks again. */
  available: boolean;
};

/** Everything a product card renders, and nothing more. */
export type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  category: { slug: string; name: string };
  /** Current selling price, minor units. */
  price: number;
  /** Price it was before, when there is a genuine reduction. */
  compareAtPrice?: number;
  image: StorefrontImage;
  /** Shown on hover and focus where a second shot exists. */
  hoverImage?: StorefrontImage;
  badges: readonly ProductBadgeKind[];
  inStock: boolean;
  /** Preview swatches. Selection happens on the product page. */
  colours: readonly ProductColour[];
  /**
   * The variant to add when a card's quick-add is pressed.
   *
   * Set only when the piece is made in exactly one combination that is
   * currently offered and in stock — a single colour in a single size, or a
   * one-size garment. In every other case it is undefined and the card links to
   * the product page instead, because a card has no colour or size control and
   * guessing one from whatever the sort happened to put first is how a shopper
   * receives the wrong garment. See `docs/cart/README.md`.
   */
  soleVariantId?: string;
};

/**
 * A colour, plus everything that is true only while that colour is selected.
 *
 * Added in Phase 5. The mock catalogue had one flat list of photographs and
 * one flat list of sizes per product, which cannot express the two facts a
 * real catalogue has: a garment is photographed separately in each colour, and
 * it is cut in different sizes in each colour. Both come from variant rows, so
 * the shape had to grow to carry them.
 *
 * `ProductDetailData` keeps its flat `images` and `sizes` as the union across
 * every colour. Those are what a card shows and what the page falls back to
 * before a colour is chosen, so nothing built in Phase 4 had to change.
 */
export type ProductColourOption = ProductColour & {
  /** Photographs of this colour, then any shot shared by every colour. */
  images: readonly StorefrontImage[];
  /**
   * Every size the product is made in, marked available only where a variant
   * in this colour is orderable. The list is the full size run rather than
   * only the stocked sizes, so a shopper sees that L exists and is gone.
   */
  sizes: readonly ProductSize[];
};

/** The card data plus what a product page adds. */
export type ProductDetailData = ProductCardData & {
  /** Every photograph, across every colour. The gallery's starting state. */
  images: readonly StorefrontImage[];
  description: string;
  /** Short factual lines: fabric, fit, care, origin. */
  details: readonly string[];
  /** The size run, available where any colour has it in stock. */
  sizes: readonly ProductSize[];
  /** Per-colour photographs and size availability. */
  colourOptions: readonly ProductColourOption[];
  /**
   * Every combination the piece is made in, so a chosen colour and size can be
   * turned into the one variant they name.
   */
  variants: readonly ProductVariantOption[];
  /** Product-level identity, shown in the details and in product metadata. */
  articleNumber: string;
  /**
   * Copy written for a search result rather than for the page.
   *
   * Null when nobody has written any, in which case the page falls back to the
   * product's own description. Nothing here is generated from the name: an
   * invented meta description is worse than a truncated real one.
   */
  seoTitle: string | null;
  seoDescription: string | null;
};

export type StorefrontCategory = {
  slug: string;
  name: string;
  /** One line, used on the category tile. */
  tagline: string;
  image: StorefrontImage;
};

/** How a listing may be ordered. Values travel in the URL. */
export type ProductSortValue =
  | "featured"
  | "newest"
  | "price-asc"
  | "price-desc"
  | "name-asc";

/** One selectable value inside a filter group. */
export type FilterOption = {
  value: string;
  label: string;
  /** How many products match, when that is known. */
  count?: number;
  /** Optional swatch, for colour groups. */
  hex?: string;
};

export type FilterGroup = {
  /** The URL parameter this group writes to. */
  param: string;
  label: string;
  options: readonly FilterOption[];
};
