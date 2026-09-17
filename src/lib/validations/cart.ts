import { z } from "zod";

/**
 * Input schemas for the bag.
 *
 * Short, and the shortness is the design. A bag mutation says **which variant**
 * or **which line**, and **how many**. Everything else — the price, the sale
 * price, the product name, the colour label, the size label, the stock figure,
 * the subtotal — is derived on the server from the catalogue, so none of it has
 * a field here to arrive in.
 *
 * What is deliberately absent:
 *
 * - **`userId`.** Who is asking is decided by the session cookie. A field for
 *   it would be an authorisation input the caller controls.
 * - **`cartId`.** The bag is resolved from the owner, so an id naming somebody
 *   else's has nowhere to go.
 * - **any money.** A client-supplied price is not a price, it is a discount
 *   request. Totals are computed from `Product.price` every time.
 *
 * `cartItemId` *is* accepted, because the interface has to say which line the
 * `−` was pressed on. It is not authorisation: every write that takes one
 * scopes the statement to the caller's own bag as well, so a line id belonging
 * to another shopper matches nothing. See `cart-service.ts`.
 *
 * Free of `server-only`, like `auth.ts`, so a client component may reuse the
 * shapes for inline feedback. The boundary is the Server Action, which parses
 * from scratch — a form is not a boundary, because the request can be sent
 * without ever loading the page that would have rendered it.
 */

/** Every id in this schema is a UUIDv7, so junk is refused before any query. */
export const variantIdSchema = z.uuid();
export const cartItemIdSchema = z.uuid();

/**
 * How many of something.
 *
 * A whole number, at least one, and not absurd. `z.int()` rejects decimals,
 * `NaN` and both infinities outright rather than coercing them, which is what
 * keeps a quantity of `1.5` or `Infinity` from ever reaching arithmetic.
 *
 * The ceiling here is the schema's sanity limit, matching the database CHECK.
 * The real per-line maximum is business policy in `lib/cart/config.ts` and is
 * applied by the service, which caps and explains rather than refusing — a
 * shopper who asks for too many should be told what they can have.
 */
export const quantitySchema = z.int().min(1).max(999);

/** Quantity on an update, where zero is meaningful: it means remove the line. */
export const updateQuantitySchema = z.int().min(0).max(999);

export const addToCartSchema = z.object({
  variantId: variantIdSchema,
  quantity: quantitySchema,
});

export const updateCartItemSchema = z.object({
  cartItemId: cartItemIdSchema,
  quantity: updateQuantitySchema,
});

export const removeCartItemSchema = z.object({
  cartItemId: cartItemIdSchema,
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
