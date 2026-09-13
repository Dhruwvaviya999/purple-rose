import type { ProductSortValue } from "@/types/commerce";

/**
 * Storefront configuration.
 *
 * Values the interface needs but the catalogue does not own: how a listing is
 * ordered, how many items a page holds, what the announcement bar says. None
 * of this is product data, so none of it moves to the database in Phase 5.
 */

/** The announcement bar. One line, store-wide. */
export const announcement = {
  message: "Free shipping on orders over ₹1,999",
  /** Shown after the message, quieter. Leave empty for none. */
  detail: "Dispatched in 2 working days",
} as const;

export const sortOptions: readonly {
  value: ProductSortValue;
  label: string;
}[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price-asc", label: "Price: low to high" },
  { value: "price-desc", label: "Price: high to low" },
  { value: "name-asc", label: "Name: A to Z" },
] as const;

export const defaultSort: ProductSortValue = "featured";

/** Items per listing page. A multiple of 4 so the last row is never ragged. */
export const productsPerPage = 12;
