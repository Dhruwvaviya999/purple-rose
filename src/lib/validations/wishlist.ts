import { z } from "zod";

/**
 * Input schemas for the wishlist.
 *
 * There is exactly one input: which product. That is deliberate, and it is the
 * security model as much as the validation model.
 *
 * **No `userId`.** A wishlist belongs to whoever is signed in, and the signed-in
 * user comes from the session cookie resolved against the database. A `userId`
 * field here would be an authorisation input controlled by the caller, which is
 * the whole of the "Customer A edits Customer B's list" bug. There is nowhere
 * to put one because nothing accepts one.
 *
 * **No `wishlistId`.** Same reasoning. The list is resolved from the user, so
 * an id naming somebody else's list has no path into a query.
 *
 * Kept free of `server-only`: these schemas import no secrets and touch no
 * database, so a client component may reuse the shapes for inline feedback.
 * Reusing them there is convenience. The boundary is the Server Action, which
 * parses from scratch, because a request can be sent without ever loading the
 * page that would have rendered the control.
 */

/**
 * A product id as the catalogue issues them.
 *
 * Every id in this schema is a UUIDv7, so anything that is not a UUID cannot
 * name a row and is refused before a query is built. That keeps a junk string
 * from the browser out of the database entirely, rather than relying on it
 * matching nothing.
 */
export const productIdSchema = z.uuid();

/** What every wishlist mutation takes, in full. */
export const wishlistMutationSchema = z.object({
  productId: productIdSchema,
});

export type WishlistMutationInput = z.infer<typeof wishlistMutationSchema>;
