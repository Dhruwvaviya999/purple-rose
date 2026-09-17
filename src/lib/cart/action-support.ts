import "server-only";

import { revalidatePath } from "next/cache";

import {
  cartFailure,
  type CartActionResult,
  type CartFailureCode,
} from "@/features/cart/cart-state";
import type { CartErrorCode } from "@/lib/services/cart-service";

/**
 * Plumbing the bag Server Actions share.
 *
 * Kept out of the `"use server"` file on purpose: every export in one of those
 * becomes a callable endpoint, so a helper living there would be a public entry
 * point with no authorisation of its own. Same rule as
 * `lib/admin/action-support.ts` and `lib/wishlist/action-support.ts`.
 */

/**
 * A service refusal, as the browser should hear it.
 *
 * The service names causes precisely because the application needs to tell them
 * apart; the browser gets a smaller vocabulary, and two of them collapse onto
 * one sentence on purpose. See `cart-state.ts`.
 */
const CODES: Record<CartErrorCode, CartFailureCode> = {
  "variant-not-found": "INVALID_INPUT",
  "variant-unavailable": "UNAVAILABLE",
  "out-of-stock": "OUT_OF_STOCK",
  "invalid-quantity": "INVALID_INPUT",
  "line-not-found": "LINE_NOT_FOUND",
  "cart-full": "CART_FULL",
};

export function toCartFailure(code: CartErrorCode): CartActionResult {
  return cartFailure(CODES[code]);
}

/**
 * Anything unexpected, made safe.
 *
 * The reason stays on the server. A Prisma error carries table names, column
 * names, constraint names and sometimes the offending value, and none of that
 * belongs in a drawer.
 */
export function toUnexpectedFailure(error: unknown): CartActionResult {
  console.error(
    `Cart action failed: ${error instanceof Error ? error.message : String(error)}`,
  );

  return cartFailure("UNEXPECTED");
}

/**
 * What to refresh after the bag changes, and why it is this narrow.
 *
 * Every storefront route renders per request, so nothing stale is held on the
 * server. What `revalidatePath` clears is the **client Router Cache**: the RSC
 * payloads a browser keeps for routes it has already visited. Without it, a
 * shopper who adds a piece and then navigates back to a page they have seen is
 * shown the header badge the browser cached a minute ago.
 *
 * `"/" as a layout` is the right call here and the wrong one for the wishlist,
 * which is worth explaining because the two files disagree on purpose. The bag
 * badge lives in the store **layout**, and it is the thing that visibly changes
 * on every add — a shopper who adds from the shop grid watches that number, and
 * a stale one reads as a failed add. The wishlist heart is inside the page, so
 * refreshing the page was enough there.
 *
 * Nothing product-specific is revalidated: adding to a bag changes nothing
 * about a product page, and throwing away cached catalogue payloads on every
 * add would be paying for nothing.
 */
export function revalidateCartRoutes(): void {
  revalidatePath("/cart");
  // The header badge is in the store shell, so the shell is what has to be
  // refreshed for the number to move.
  revalidatePath("/", "layout");
}
