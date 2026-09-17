import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";

import { getCurrentUser } from "@/lib/auth/current-user";
import { cartConfig } from "./config";
import {
  guestCartExpiry,
  hashGuestToken,
  looksLikeGuestToken,
  mintGuestToken,
  type CartOwner,
} from "./ownership";

/**
 * Who the bag in front of us belongs to.
 *
 * The one place that answers that question, so no page, action or component
 * carries its own copy of "if signed in, otherwise…". Everything downstream
 * takes a `CartOwner` and never looks at a cookie or a session again.
 *
 * This is the half that reads the request. The primitives it builds on — the
 * type, the hashing, the expiry — are in `ownership.ts`, which imports no Next
 * runtime so the cart service can stay testable outside one.
 *
 * ## Two kinds of owner
 *
 * **A signed-in shopper** owns a bag through `Cart.userId`, resolved from the
 * session exactly as everything else in the application is. Nothing from the
 * request body contributes to it.
 *
 * **A guest** owns a bag through an opaque random token in an HttpOnly cookie.
 * The database stores only its digest, so the table holds no usable bag key.
 * The browser never sees a `Cart.id`, and nothing anywhere accepts one as
 * authority.
 *
 * The cookie carries the token and nothing else: no product, no price, no
 * quantity, no user id, no bag id. It is a bearer credential for one row and is
 * useless for anything else.
 *
 * ## Reads and writes are deliberately different
 *
 * A cookie can only be written from a Server Action or a Route Handler; a
 * Server Component may read one. That is not an inconvenience to work around,
 * it is the right shape: **browsing must never mint a guest bag.** Somebody who
 * looks at ten pages and adds nothing should leave no row and no cookie behind.
 * So `resolveOwnerForRead` returns null when there is no cookie yet, and
 * `resolveOwnerForWrite` — reachable only from an action — is the only thing
 * that creates an identity.
 */

/** The raw guest token in the cookie, or empty when there is none to trust. */
async function readGuestToken(): Promise<string> {
  const store = await cookies();
  const value = store.get(cartConfig.cookieName)?.value ?? "";

  return looksLikeGuestToken(value) ? value : "";
}

/**
 * Who owns the bag, without creating anything.
 *
 * Returns null for a visitor who is neither signed in nor carrying a guest
 * cookie, which is every first-time visitor. Callers treat null as an empty
 * bag; it is not an error and not a reason to write a row.
 *
 * Wrapped in React's request-scoped `cache`, so the header, the drawer and the
 * page share one session lookup and one cookie read per request rather than
 * three. That memoisation lives and dies inside a single request; see
 * `docs/cart/README.md` on why that matters for a value this personal.
 */
export const resolveOwnerForRead = cache(
  async (): Promise<CartOwner | null> => {
    const user = await getCurrentUser();

    if (user) {
      return { kind: "user", userId: user.id };
    }

    const token = await readGuestToken();

    return token ? { kind: "guest", tokenHash: hashGuestToken(token) } : null;
  },
);

/**
 * Who owns the bag, creating a guest identity if there is not one yet.
 *
 * **Only callable from a Server Action or a Route Handler**, because it may
 * write a cookie. Every mutation goes through it, which is what guarantees a
 * guest who adds something has somewhere to put it.
 *
 * A signed-in shopper never gets a guest cookie from this: their bag is their
 * account's, and issuing them a second identity would be exactly the ambiguous
 * ownership the table's CHECK constraint exists to forbid.
 */
export async function resolveOwnerForWrite(): Promise<CartOwner> {
  const user = await getCurrentUser();

  if (user) {
    return { kind: "user", userId: user.id };
  }

  const existing = await readGuestToken();

  if (existing) {
    return { kind: "guest", tokenHash: hashGuestToken(existing) };
  }

  const token = mintGuestToken();
  await writeGuestCookie(token);

  return { kind: "guest", tokenHash: hashGuestToken(token) };
}

/**
 * Attach a guest token to the response.
 *
 * `httpOnly` so no script can read it, which is the difference between a bag
 * and an XSS-stealable one. `secure` in production only, so the flow still works
 * on http://localhost. `lax` keeps it on the top-level navigation back from
 * sign-in while withholding it from cross-site posts. The same options the
 * session cookie uses, for the same reasons.
 */
async function writeGuestCookie(token: string): Promise<void> {
  const store = await cookies();

  store.set(cartConfig.cookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: guestCartExpiry(),
  });
}

/**
 * Forget the guest identity this browser is carrying.
 *
 * Called after a successful merge into an account bag. It removes the cookie
 * only — the row it pointed at is dealt with separately and deliberately,
 * because deleting a bag before its contents have safely arrived somewhere else
 * is how a shopper loses one.
 */
export async function clearGuestCookie(): Promise<void> {
  const store = await cookies();
  store.delete(cartConfig.cookieName);
}

/**
 * The raw guest token, for the one caller that needs it: the merge.
 *
 * Sign-in has to find the guest bag before the new session changes who
 * `resolveOwnerForWrite` would answer with, so it reads the token directly.
 * Nothing else should.
 */
export async function peekGuestToken(): Promise<string> {
  return readGuestToken();
}

export { hashGuestToken, guestCartExpiry };
export type { CartOwner };
