/**
 * What every wishlist Server Action gives back.
 *
 * In an ordinary module rather than beside the actions because a `"use server"`
 * file may only export async functions — every export there becomes a callable
 * endpoint, so a shared type or constant is rejected. Same reason
 * `features/admin/action-state.ts` exists.
 *
 * The shape is small and serialisable, and two things about it are deliberate.
 *
 * **`wishlisted` is what the database holds**, read back after the write
 * committed, not what the click implied. The button renders from it, so a
 * failed mutation cannot leave a filled heart over a product that was never
 * saved. That is the whole of the error-recovery story: on `ok: false` the
 * caller keeps the state it already had and shows `message`.
 *
 * **`message` is written for a person.** It never carries a Prisma error, a SQL
 * string, a constraint name or a stack; those go to the server log. The full
 * set of things it can say is the table below, so nothing downstream can
 * improvise wording that leaks what went wrong internally.
 */

/** Why a wishlist mutation was refused, as far as the browser is told. */
export type WishlistFailureCode =
  | "SIGNED_OUT"
  | "INVALID_INPUT"
  | "PRODUCT_UNAVAILABLE"
  | "LIMIT_REACHED"
  | "UNEXPECTED";

const FAILURE_MESSAGES: Record<WishlistFailureCode, string> = {
  SIGNED_OUT: "Sign in to save pieces to your wishlist.",
  // Deliberately the same sentence as PRODUCT_UNAVAILABLE. A malformed id and
  // an id naming a draft must not be distinguishable, or the reply becomes a
  // way to ask whether an unpublished product exists.
  INVALID_INPUT: "That product is no longer available.",
  PRODUCT_UNAVAILABLE: "That product is no longer available.",
  // Says what to do about it. A customer who has hit a ceiling nobody told them
  // about should not be shown a generic failure and left to guess.
  LIMIT_REACHED:
    "Your wishlist is full. Remove a piece to make room for another.",
  UNEXPECTED: "Unable to update your wishlist. Please try again.",
};

export function wishlistFailureMessage(code: WishlistFailureCode): string {
  return FAILURE_MESSAGES[code];
}

export const WISHLIST_ADDED_MESSAGE = "Added to your wishlist.";
export const WISHLIST_REMOVED_MESSAGE = "Removed from your wishlist.";

export type WishlistActionResult =
  | {
      ok: true;
      /** The state the database holds now. The control renders from this. */
      wishlisted: boolean;
      message: string;
    }
  | {
      ok: false;
      code: WishlistFailureCode;
      message: string;
    };

export function wishlistSuccess(wishlisted: boolean): WishlistActionResult {
  return {
    ok: true,
    wishlisted,
    message: wishlisted ? WISHLIST_ADDED_MESSAGE : WISHLIST_REMOVED_MESSAGE,
  };
}

export function wishlistFailure(
  code: WishlistFailureCode,
): WishlistActionResult {
  return { ok: false, code, message: wishlistFailureMessage(code) };
}
