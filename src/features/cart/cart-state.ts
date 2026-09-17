/**
 * What every bag Server Action gives back.
 *
 * In an ordinary module rather than beside the actions, because a `"use server"`
 * file may only export async functions — every export there becomes a callable
 * endpoint. Same reason `features/admin/action-state.ts` and
 * `features/wishlist/wishlist-state.ts` exist.
 *
 * Three things about the shape are deliberate.
 *
 * **`count` is what the database holds**, read back after the write committed.
 * The header badge renders from it, so the number a shopper sees is never one
 * the browser worked out for itself. On a failure there is no count and the
 * previous one stands.
 *
 * **`message` is written for a person**, and the complete set of things it can
 * say is the table below. No Prisma error, SQL string, constraint name, Neon
 * detail or stack ever reaches it; those are logged on the server.
 *
 * **A capped quantity is a success, not a failure.** Somebody who asks for
 * seven of the five that exist gets five, and is told so in the same breath.
 * Refusing outright would leave them with nothing and nothing to do about it.
 */

export type CartFailureCode =
  | "INVALID_INPUT"
  | "UNAVAILABLE"
  | "OUT_OF_STOCK"
  | "LINE_NOT_FOUND"
  | "CART_FULL"
  | "UNEXPECTED";

const FAILURE_MESSAGES: Record<CartFailureCode, string> = {
  // Deliberately the same sentence as UNAVAILABLE. A malformed id and an id
  // naming a draft must not be distinguishable, or the reply becomes a way to
  // ask whether an unpublished piece exists.
  INVALID_INPUT: "That piece is no longer available.",
  UNAVAILABLE: "That piece is no longer available.",
  OUT_OF_STOCK: "That size has just sold out.",
  LINE_NOT_FOUND: "That item is no longer in your bag.",
  CART_FULL:
    "Your bag is full. Remove something to make room for another piece.",
  UNEXPECTED: "Unable to update your bag. Please try again.",
};

export function cartFailureMessage(code: CartFailureCode): string {
  return FAILURE_MESSAGES[code];
}

export type CartActionResult =
  | {
      ok: true;
      /** Total garments in the bag now, straight from the database. */
      count: number;
      message: string;
    }
  | {
      ok: false;
      code: CartFailureCode;
      message: string;
    };

export function cartSuccess(count: number, message: string): CartActionResult {
  return { ok: true, count, message };
}

export function cartFailure(code: CartFailureCode): CartActionResult {
  return { ok: false, code, message: cartFailureMessage(code) };
}

/**
 * What to say after something was added.
 *
 * Capping gets its own sentence, with the number in it, because "only five are
 * available" is actionable and "we changed your quantity" is not.
 */
export function addedMessage(capped: boolean, available: number): string {
  return capped
    ? `Only ${available} available, so that is what is in your bag.`
    : "Added to your bag.";
}

export function updatedMessage(capped: boolean, available: number): string {
  return capped
    ? `Only ${available} available, so that is what is in your bag.`
    : "Bag updated.";
}

export const CART_REMOVED_MESSAGE = "Removed from your bag.";
export const CART_CLEARED_MESSAGE = "Your bag is empty.";
