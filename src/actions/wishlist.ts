"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import {
  addToWishlist,
  removeFromWishlist,
  toggleWishlistItem,
  type WishlistResult,
} from "@/lib/services/wishlist-service";
import { wishlistMutationSchema } from "@/lib/validations/wishlist";
import {
  wishlistFailure,
  wishlistSuccess,
  type WishlistActionResult,
} from "@/features/wishlist/wishlist-state";
import { revalidateWishlistRoutes } from "@/lib/wishlist/action-support";

/**
 * The wishlist write path.
 *
 * Three endpoints, one per thing a customer can do. Each one does the same five
 * steps in the same order, written out rather than hidden in a wrapper, because
 * the order is the security property and `pnpm check:wishlist` asserts it by
 * reading this file:
 *
 * 1. **Authenticate.** `getCurrentUser()` resolves the session cookie against
 *    the database. First, before any input is read.
 * 2. **Validate.** Zod, on a payload that contains a product id and nothing
 *    else.
 * 3. **Act as that user.** The `userId` handed to the service is the one from
 *    the session. Nothing from the request reaches it.
 * 4. **Revalidate** the routes that render a heart.
 * 5. **Return a safe result** — a sentence a person can read, never a database
 *    error.
 *
 * ## Why no `userId` argument, anywhere
 *
 * A Server Action is a public endpoint. The form that renders the button is not
 * a boundary: the request can be sent without ever loading the page. So the
 * only thing these accept is *which product*, and who is asking is decided
 * entirely by the session. There is no argument by which Customer A could name
 * Customer B, and no wishlist id is accepted either — the list is resolved from
 * the user inside the service.
 *
 * ## Why these refuse instead of redirecting
 *
 * An anonymous caller gets `SIGNED_OUT` back, not `redirect("/login")`. A
 * redirect from a Server Action reads as success to anything that is not a
 * browser following it. The *interface* handles the sign-in journey: the
 * control renders as a link to `/login?next=…` when nobody is signed in, and
 * the client component navigates there if it ever receives this code anyway.
 * See `docs/wishlist/README.md`.
 *
 * Only three functions are exported, because every export in a `"use server"`
 * file becomes a callable endpoint. Shared helpers live in
 * `lib/wishlist/action-support.ts`.
 */

/**
 * The shared body of all three actions.
 *
 * Private — not exported — so it is not itself an endpoint. It takes the
 * operation as a function rather than as a string, so there is no "which
 * action" value travelling from the browser to be mis-parsed.
 */
async function runWishlistMutation(
  productId: unknown,
  operate: (userId: string, productId: string) => Promise<WishlistResult>,
): Promise<WishlistActionResult> {
  // 1. Authenticate. Before anything else is touched.
  const user = await getCurrentUser();

  if (!user) {
    return wishlistFailure("SIGNED_OUT");
  }

  // 2. Validate.
  const parsed = wishlistMutationSchema.safeParse({ productId });

  if (!parsed.success) {
    return wishlistFailure("INVALID_INPUT");
  }

  try {
    // 3. Act as the authenticated user. `user.id` comes from the session row.
    const result = await operate(user.id, parsed.data.productId);

    if (!result.ok) {
      switch (result.code) {
        // The customer's intent is satisfied either way: the product is in the
        // list. Reporting a duplicate add as a failure would make a double
        // click look broken when it did exactly what was asked.
        case "already-saved":
          return wishlistSuccess(true);
        case "not-saved":
          return wishlistSuccess(false);
        case "limit-reached":
          return wishlistFailure("LIMIT_REACHED");
        default:
          return wishlistFailure("PRODUCT_UNAVAILABLE");
      }
    }

    // 4. Refresh what shows a heart. Narrow on purpose; see the helper.
    revalidateWishlistRoutes(result.productSlug);

    // 5. Report what the database now holds.
    return wishlistSuccess(result.wishlisted);
  } catch (error) {
    // The reason stays on the server. Prisma messages carry table names,
    // column names and sometimes the offending value.
    console.error(
      `Wishlist mutation failed: ${error instanceof Error ? error.message : String(error)}`,
    );

    return wishlistFailure("UNEXPECTED");
  }
}

/** Save a product. Already saved is reported as saved, not as an error. */
export async function addToWishlistAction(
  productId: string,
): Promise<WishlistActionResult> {
  return runWishlistMutation(productId, addToWishlist);
}

/** Remove a product. Not saved is reported as not saved. */
export async function removeFromWishlistAction(
  productId: string,
): Promise<WishlistActionResult> {
  return runWishlistMutation(productId, removeFromWishlist);
}

/** What the heart does: save it if it is not saved, remove it if it is. */
export async function toggleWishlistAction(
  productId: string,
): Promise<WishlistActionResult> {
  return runWishlistMutation(productId, toggleWishlistItem);
}
