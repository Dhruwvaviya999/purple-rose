import "server-only";

import { cache } from "react";

import { getCurrentUser } from "@/lib/auth/current-user";
import { getWishlistedProductIds } from "@/lib/services/wishlist-service";

/**
 * Wishlist state for a page, resolved from the request.
 *
 * The one piece of wishlist code that knows there is a signed-in visitor. It is
 * deliberately **not** in `wishlist-service.ts`: that module is plain data
 * access, takes a `userId` it was handed and imports nothing from Next, which
 * is what lets `pnpm check:wishlist` exercise it directly. Request state
 * belongs a layer up, here.
 */

/**
 * Which of these products the signed-in customer has saved, or `null` when
 * nobody is signed in.
 *
 * What a storefront page calls, once, for every card it is about to render. The
 * alternative — each card asking about itself — is one round trip per card.
 *
 * `null` rather than an empty set for an anonymous visitor, because the two
 * mean different things to the control: "not saved, tap to save" against "sign
 * in to save".
 *
 * **Anonymous browsing costs nothing.** No signed-in user means no query: this
 * returns before it touches the database. `getCurrentUser` is itself
 * request-cached and the header has already called it, so there is no extra
 * session lookup either.
 *
 * ## Cache isolation
 *
 * `cache()` is React's **request-scoped** memoisation, not a shared or
 * persistent one. It lives for a single render of a single request and is then
 * discarded, so one customer's state can never be handed to another. That is
 * also why the signature takes product ids and reads the user from the request
 * rather than taking a `userId`: within one request there is exactly one
 * signed-in user, and across requests nothing at all is retained.
 *
 * Every page that calls this is `dynamic = "force-dynamic"`, so none of it is
 * written into a prerendered or shared response. See `docs/wishlist/README.md`.
 */
export const getWishlistStateFor = cache(
  async (productIds: readonly string[]): Promise<ReadonlySet<string> | null> => {
    const user = await getCurrentUser();

    if (!user) {
      return null;
    }

    return getWishlistedProductIds(user.id, productIds);
  },
);
