/**
 * Presentation types for the storefront.
 *
 * These describe what the UI needs to render, not how anything is stored. No
 * component imports a Prisma type, so the database schema can change shape
 * without a single component changing with it.
 *
 * When the catalogue arrives, a service maps a Prisma `Product` into
 * `ProductCardData` or `ProductDetailData` and everything below stays as is.
 * That mapping is the only place the two vocabularies meet.
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
  | "sold-out";

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
};

/** The card data plus what a product page adds. */
export type ProductDetailData = ProductCardData & {
  images: readonly StorefrontImage[];
  description: string;
  /** Short factual lines: fabric, fit, care, origin. */
  details: readonly string[];
  sizes: readonly ProductSize[];
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
