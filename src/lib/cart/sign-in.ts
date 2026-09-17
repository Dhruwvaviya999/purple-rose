import "server-only";

import { mergeGuestCart } from "@/lib/services/cart-service";
import { clearGuestCookie } from "./owner";
import { hashGuestToken } from "./ownership";

/**
 * What happens to a guest's bag when they sign in.
 *
 * This exists so `actions/auth.ts` stays an authentication module. Sign-in
 * gained one line, not a commerce branch: it calls this and carries on. The
 * knowledge of what a bag is, how it merges and what to do when that fails
 * lives here and in the cart service.
 *
 * ## Why it can never fail the sign-in
 *
 * Everything is inside a `try`. Authentication succeeded — the session row
 * exists and the cookie is set — before this runs, and a bag is not a reason to
 * refuse somebody entry to their own account. If the merge throws, the person
 * is signed in regardless.
 *
 * ## Why a failure loses nothing
 *
 * The cookie is cleared **only after** the merge has committed. The merge itself
 * deletes the guest bag in the same transaction that writes its contents into
 * the account bag, so there are exactly three possible outcomes and none of them
 * loses anything:
 *
 * - **It worked.** The account bag holds everything; the guest bag is gone and
 *   the cookie with it.
 * - **The merge failed.** Nothing was written and nothing was deleted. The
 *   cookie still names the guest bag, which still has everything in it, and the
 *   next sign-in tries again.
 * - **The merge worked but clearing the cookie failed.** The cookie names a bag
 *   that no longer exists, which resolves to nothing; the next add issues a
 *   fresh identity. Harmless.
 *
 * The one ordering that would lose a bag — delete the guest side, then fail to
 * write the account side — is impossible, because those are one transaction.
 *
 * ## Why it is safe to run twice
 *
 * Two tabs signing in at once, or a retried action, both reach `mergeGuestCart`,
 * and the second finds no guest bag because the first deleted it. Quantities
 * cannot double. See the merge itself for the rest of that reasoning.
 */
export async function adoptGuestCart(
  userId: string,
  guestToken: string,
): Promise<void> {
  if (!guestToken) {
    return;
  }

  try {
    await mergeGuestCart(userId, hashGuestToken(guestToken));

    // Only now. While this cookie exists the guest bag is still reachable, and
    // that is the safety net for every failure above.
    await clearGuestCookie();
  } catch (error) {
    // The reason stays on the server. The shopper is signed in and their guest
    // bag is intact; they will see it merged on their next sign-in.
    console.error(
      `Could not merge a guest bag after sign-in: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
