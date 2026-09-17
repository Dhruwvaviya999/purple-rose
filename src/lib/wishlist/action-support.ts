import "server-only";

import { revalidatePath } from "next/cache";

/**
 * Plumbing the wishlist Server Actions share.
 *
 * Kept out of the `"use server"` file on purpose: every export in one of those
 * becomes a callable endpoint, so a helper living there would be a public entry
 * point with no authorisation of its own. Same rule as
 * `lib/admin/action-support.ts`.
 */

/**
 * What to refresh after a save or a removal, and why it is this narrow.
 *
 * Every storefront route renders per request, so nothing is holding a stale
 * page on the server. What `revalidatePath` clears is the **client Router
 * Cache**: the RSC payloads the browser keeps for routes it has already
 * visited. Without it, a shopper who saves a piece from the shop grid, opens
 * the wishlist and comes back would be shown the grid the browser cached a
 * minute ago, with the heart still empty, and would reasonably conclude the
 * save failed.
 *
 * So these are aimed at the routes that actually render a heart or a count, and
 * nowhere else:
 *
 * - `/wishlist` — the list itself, which has just changed.
 * - `/shop` — the grid, where the same product carries a heart.
 * - `/shop/[slug]` — the product's own page, only the one that changed.
 * - `/` — the home rails, which are product cards with hearts on them.
 *
 * Not the whole application, and not `"/", "layout"`: the header count sits in
 * the store layout, and re-rendering every page's shell on every heart click to
 * keep one number fresh is the wrong trade. The count is correct on the next
 * navigation, which is when it is next read.
 *
 * `productSlug` is empty when a removal names a product that no longer exists;
 * there is no page to refresh in that case.
 */
export function revalidateWishlistRoutes(productSlug: string): void {
  revalidatePath("/wishlist");
  revalidatePath("/shop");
  revalidatePath("/");

  if (productSlug) {
    revalidatePath(`/shop/${productSlug}`);
  }
}
