"use server";

import { resolveOwnerForWrite } from "@/lib/cart/owner";
import {
  addToCart,
  clearCart,
  getCartCount,
  removeFromCart,
  updateCartItemQuantity,
} from "@/lib/services/cart-service";
import {
  addToCartSchema,
  removeCartItemSchema,
  updateCartItemSchema,
} from "@/lib/validations/cart";
import {
  addedMessage,
  cartFailure,
  cartSuccess,
  updatedMessage,
  CART_CLEARED_MESSAGE,
  CART_REMOVED_MESSAGE,
  type CartActionResult,
} from "@/features/cart/cart-state";
import {
  revalidateCartRoutes,
  toCartFailure,
  toUnexpectedFailure,
} from "@/lib/cart/action-support";

/**
 * The bag write path.
 *
 * Four endpoints, one per thing a shopper can do. Each does the same five steps
 * in the same order, written out rather than hidden in a wrapper, because the
 * order is the security property and `pnpm check:cart` asserts it by reading
 * this file:
 *
 * 1. **Resolve the owner.** `resolveOwnerForWrite()` returns the signed-in
 *    shopper, or the guest their cookie names, or mints a guest identity and
 *    sets the cookie. First, before any input is read.
 * 2. **Validate.** Zod, on a payload holding an id and a number and nothing
 *    else.
 * 3. **Act as that owner.** The `CartOwner` handed to the service is the one
 *    resolved in step one. Nothing from the request body reaches it.
 * 4. **Revalidate** the routes that render a bag or its badge.
 * 5. **Return a safe result**, carrying the server's own count.
 *
 * ## Why the bag has no sign-in requirement
 *
 * Unlike the wishlist, which needs an account to belong to, a bag belongs to
 * whoever is carrying it. A shopper who has not signed in still gets a real
 * one, persisted in PostgreSQL against an opaque token in an HttpOnly cookie —
 * not in `localStorage`, which cannot survive a device change and cannot be
 * trusted about prices. Forcing a sign-in before letting somebody put a dress in
 * a bag is the single most reliable way to lose a sale.
 *
 * ## What none of them accept
 *
 * No `userId`, no `cartId`, and no money. A caller says which variant or which
 * line, and how many; the server derives the price, the stock, the availability
 * and the totals from the catalogue. A `cartItemId` is accepted because the
 * interface must name a line, and it is not authority: the service scopes every
 * statement that takes one to the caller's own bag.
 *
 * Only four functions are exported, because every export in a `"use server"`
 * file becomes a callable endpoint. Shared helpers live in
 * `lib/cart/action-support.ts`.
 */

/** Add a variant to the bag, or increase the line that already holds it. */
export async function addToCartAction(
  variantId: string,
  quantity = 1,
): Promise<CartActionResult> {
  // 1. Owner first. This is also what issues a guest their cookie, so a
  //    first-time shopper has somewhere for this to go.
  const owner = await resolveOwnerForWrite();

  // 2. Validate.
  const parsed = addToCartSchema.safeParse({ variantId, quantity });

  if (!parsed.success) {
    return cartFailure("INVALID_INPUT");
  }

  try {
    // 3. Act as that owner.
    const result = await addToCart(
      owner,
      parsed.data.variantId,
      parsed.data.quantity,
    );

    if (!result.ok) {
      return toCartFailure(result.code);
    }

    // 4. Refresh what shows a bag or a badge.
    revalidateCartRoutes();

    // 5. Report what the database now holds.
    return cartSuccess(
      await getCartCount(owner),
      addedMessage(result.capped, result.available),
    );
  } catch (error) {
    return toUnexpectedFailure(error);
  }
}

/**
 * Set a line to an exact quantity.
 *
 * Zero removes the line. That convention is defined once, in the service, so
 * the interface does not have to special-case the last decrement.
 */
export async function updateCartItemAction(
  cartItemId: string,
  quantity: number,
): Promise<CartActionResult> {
  const owner = await resolveOwnerForWrite();

  const parsed = updateCartItemSchema.safeParse({ cartItemId, quantity });

  if (!parsed.success) {
    return cartFailure("INVALID_INPUT");
  }

  try {
    const result = await updateCartItemQuantity(
      owner,
      parsed.data.cartItemId,
      parsed.data.quantity,
    );

    if (!result.ok) {
      return toCartFailure(result.code);
    }

    revalidateCartRoutes();

    return cartSuccess(
      await getCartCount(owner),
      parsed.data.quantity === 0
        ? CART_REMOVED_MESSAGE
        : updatedMessage(result.capped, result.available),
    );
  } catch (error) {
    return toUnexpectedFailure(error);
  }
}

/** Remove a line outright. */
export async function removeCartItemAction(
  cartItemId: string,
): Promise<CartActionResult> {
  const owner = await resolveOwnerForWrite();

  const parsed = removeCartItemSchema.safeParse({ cartItemId });

  if (!parsed.success) {
    return cartFailure("INVALID_INPUT");
  }

  try {
    const result = await removeFromCart(owner, parsed.data.cartItemId);

    if (!result.ok) {
      return toCartFailure(result.code);
    }

    revalidateCartRoutes();

    return cartSuccess(await getCartCount(owner), CART_REMOVED_MESSAGE);
  } catch (error) {
    return toUnexpectedFailure(error);
  }
}

/**
 * Empty the bag.
 *
 * Takes no input at all, which is the point: there is nothing to say but "mine",
 * and who that is comes from the session or the cookie.
 */
export async function clearCartAction(): Promise<CartActionResult> {
  const owner = await resolveOwnerForWrite();

  try {
    await clearCart(owner);
    revalidateCartRoutes();

    return cartSuccess(0, CART_CLEARED_MESSAGE);
  } catch (error) {
    return toUnexpectedFailure(error);
  }
}
