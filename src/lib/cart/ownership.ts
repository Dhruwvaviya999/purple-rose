import "server-only";

import { createHash, randomBytes } from "node:crypto";

import { cartConfig } from "./config";

/**
 * What it means to own a bag, with nothing that reads a request.
 *
 * Deliberately free of `next/headers`, `next/navigation` and the session, so
 * `cart-service.ts` can depend on it and remain a plain data module that
 * `pnpm check:cart` exercises directly. The half that reads cookies and
 * resolves the signed-in shopper lives in `owner.ts` next door and builds these
 * values; everything below the service boundary only ever sees the result.
 *
 * The same split as the wishlist's `wishlist-service.ts` and
 * `lib/wishlist/page-state.ts`, for the same reason: a module that imports the
 * Next runtime cannot be run outside it, and the verification suites are worth
 * more than the one import they would cost.
 */

/**
 * Who a bag belongs to.
 *
 * Exactly one of two things, mirroring the CHECK constraint on the table. There
 * is no third case and no case where both are set, which is what makes every
 * ownership question in the service a single `switch` with no ambiguous branch.
 */
export type CartOwner =
  | { kind: "user"; userId: string }
  | { kind: "guest"; tokenHash: string };

/** How many bytes of entropy a guest token carries. 32 is 256 bits. */
const TOKEN_BYTES = 32;

/**
 * The digest stored in the database.
 *
 * A plain SHA-256, as for session tokens and for the same reason: the token has
 * 256 bits of entropy and cannot be brute forced from its hash, so the key
 * stretching that a six-digit code needs would buy nothing here. Reading the
 * `Cart` table hands nobody a usable bag.
 */
export function hashGuestToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A fresh guest token. Returned once, to be put in a cookie and forgotten. */
export function mintGuestToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/**
 * Is this string shaped like a token we issued?
 *
 * 32 random bytes in base64url is exactly 43 characters. Anything else was not
 * minted here, so it is discarded without a query rather than hashed and looked
 * up: a tampered cookie must not become a database round trip, and it must not
 * produce an error a shopper has to read either. They simply have no bag, and
 * the next thing they add issues them a fresh identity.
 */
export function looksLikeGuestToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** When a guest bag, and its cookie, stop being valid. */
export function guestCartExpiry(): Date {
  return new Date(Date.now() + cartConfig.guestTtlDays * 24 * 60 * 60 * 1000);
}
