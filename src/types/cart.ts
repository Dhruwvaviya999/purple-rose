import type { StorefrontImage } from "./commerce";

/**
 * Presentation types for the bag.
 *
 * Same contract as `commerce.ts`: these describe what the interface renders,
 * not how anything is stored. No component imports a Prisma type, so the cart
 * tables can change shape without a component changing with it.
 *
 * Money is always an integer in paise. Nothing here is a formatted string, and
 * nothing formatted ever goes back into a calculation — see
 * `lib/utils/format-price.ts`.
 */

/**
 * Whether a line can actually be bought right now.
 *
 * Four states rather than a boolean, because "you cannot have this" has
 * genuinely different causes and a shopper can act on some of them:
 *
 * - `available` — offered, and there is enough stock for the quantity asked.
 * - `limited` — offered, but fewer are left than the line holds. The shopper
 *   can reduce the quantity and continue.
 * - `out-of-stock` — offered, none left. Nothing to do but wait or remove it.
 * - `unavailable` — no longer offered at all: the product was archived or
 *   returned to draft, or the variant was retired. The line stays, because it
 *   is the shopper's intent and not ours to discard.
 */
export type CartLineStatus =
  | "available"
  | "limited"
  | "out-of-stock"
  | "unavailable";

/** One line of a bag, and nothing the interface does not render. */
export type CartItemData = {
  /** The line's own id. Usable in the interface, never as authorisation. */
  id: string;
  variantId: string;
  /** Printed on a pick list and shown in the line's detail row. */
  sku: string;

  product: {
    slug: string;
    name: string;
    categoryName: string;
  };

  /** The colour this line is for. Named, never only a swatch. */
  colour: { name: string; slug: string; hex: string };
  /** The size this line is for: "M", "28", "Free". */
  size: { label: string; value: string };

  /** The photograph of this colour, chosen by the same rule the gallery uses. */
  image: StorefrontImage;

  quantity: number;
  /** Current catalogue price for one, in paise. */
  unitPrice: number;
  /** What it was before, when there is a genuine reduction. */
  compareAtPrice?: number;
  /** `unitPrice * quantity`, computed on the server in integer paise. */
  lineSubtotal: number;

  status: CartLineStatus;
  /** How many are actually left. Shown when the line is `limited`. */
  availableStock: number;

  /**
   * The catalogue price moved since this line was last written, and the line
   * now shows the new one. Reported once: the stored snapshot is refreshed at
   * the same time, so the next read is quiet again.
   */
  priceChanged: boolean;

  /** Where the piece lives, for the line's link. */
  href: string;
};

/** A whole bag, as the drawer and the page render it. */
export type CartData = {
  items: readonly CartItemData[];

  /**
   * Total quantity across every line still being offered.
   *
   * This is the number on the header badge. It is a count of garments, not of
   * lines: two of a dress and one of a top is three. Lines whose product has
   * been withdrawn are excluded, because they are not part of what the shopper
   * can buy; an out-of-stock line is still counted, because the piece is still
   * offered and the stock may come back.
   */
  count: number;

  /** Distinct lines, including withdrawn ones. */
  lineCount: number;

  /**
   * Sum of the lines that can be bought, in paise.
   *
   * Excludes withdrawn and out-of-stock lines, so the figure is what the
   * shopper would actually pay for what is actually available. There is no tax,
   * no shipping and no discount in it: none of those exist yet, and inventing
   * a number for them would be worse than leaving them out.
   */
  subtotal: number;

  /** What the reductions on those same lines add up to, in paise. */
  savings: number;

  hasUnavailableItems: boolean;
  hasPriceChanges: boolean;
};

/** The small shape the header needs, without loading a whole bag. */
export type CartCount = {
  count: number;
};
