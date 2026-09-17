/**
 * The guest bag cookie name, defined once.
 *
 * In its own module, free of `server-only`, for the same reason
 * `lib/auth/cookie.ts` is: it is needed by the server-side cart code and by
 * anything running in a lighter runtime, and two copies of this string that
 * could drift apart would be a silent way to strand every guest bag.
 *
 * The name is only an identifier. It reveals nothing and carries no value.
 */
export const CART_COOKIE_NAME = "pr_cart";
