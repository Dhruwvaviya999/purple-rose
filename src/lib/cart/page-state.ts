import "server-only";

import { cache } from "react";

import type { CartData } from "@/types/cart";
import { getCart } from "@/lib/services/cart-service";
import { resolveOwnerForRead } from "./owner";

/**
 * The bag, for whoever is looking, resolved once per request.
 *
 * ## Why the whole bag rather than a count
 *
 * The header needs one integer; the drawer needs every line. Two reads would be
 * the obvious answer and would be the wrong one, because the drawer is in the
 * header on every page: a cheap count plus a lazy fetch when the drawer opens
 * means a spinner every time somebody checks their bag, and a count query plus a
 * cart query on `/cart`.
 *
 * So this reads the bag once, `cache()`d for the request, and everything takes
 * what it needs from the result. A shopper on `/cart` pays for exactly one cart
 * query, not two; a shopper anywhere else pays for one and gets a drawer that
 * opens instantly.
 *
 * **A visitor with no bag pays nothing.** `resolveOwnerForRead` returns null for
 * anyone neither signed in nor carrying a guest cookie, and this returns before
 * touching the database. Browsing does not create a bag and does not query for
 * one.
 *
 * ## Cache isolation
 *
 * `cache()` here is React's **request-scoped** memoisation, not a shared or
 * persistent cache. It lives for one render of one request and is then
 * discarded, so one shopper's bag can never be handed to another — and a bag is
 * the most personal thing in the application, held by people who are not even
 * signed in. That is also why this takes no arguments and reads the owner from
 * the request: within one request there is exactly one shopper, and across
 * requests nothing at all is retained.
 *
 * Every route that renders it is `dynamic = "force-dynamic"`, so none of it is
 * ever written into a prerendered or shared response. See
 * `docs/cart/README.md`.
 */
export const getCartForRequest = cache(async (): Promise<CartData> => {
  const owner = await resolveOwnerForRead();

  if (!owner) {
    return EMPTY_CART;
  }

  return getCart(owner);
});

/** What a visitor with no bag sees. A constant, so it costs nothing to return. */
const EMPTY_CART: CartData = {
  items: [],
  count: 0,
  lineCount: 0,
  subtotal: 0,
  savings: 0,
  hasUnavailableItems: false,
  hasPriceChanges: false,
};
