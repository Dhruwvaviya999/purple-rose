import "server-only";

import type { ProductCardData } from "@/types/commerce";
import { Prisma } from "@/generated/prisma/client";
import { ProductStatus } from "@/generated/prisma/enums";
import {
  productCardSelect,
  toProductCardData,
} from "@/lib/catalog/product-mapper";
import { prisma } from "@/lib/db/client";

/**
 * The wishlist: reads and writes.
 *
 * Three rules hold throughout, and they are the reason this file exists rather
 * than the queries being spread across actions and pages.
 *
 * **Identity is a `userId` this module was handed by an authenticated caller.**
 * Every function below takes one, and every query is scoped by it. There is no
 * function that takes a `wishlistId`, because a wishlist id that arrived from
 * a browser is not evidence of anything. Customer A cannot reach Customer B's
 * list through this module, whatever they send, because there is no argument
 * that would express the attempt.
 *
 * **Nothing Prisma-shaped leaves.** Callers get `WishlistEntry`, built from the
 * same `ProductCardData` the rest of the storefront renders, mapped by the same
 * `product-mapper.ts`. No component receives a row.
 *
 * **The wishlist sees drafts and archived products; the storefront does not.**
 * This is the one place in the application that reads a product without
 * `status: ACTIVE` in the query, and it is deliberate: an archived product a
 * customer saved stays in their list. What changes is how it is presented —
 * `WishlistEntry.available` is false, and the page shows it as unavailable with
 * no route into buying it. Unpublished work is not *discoverable* through this,
 * because reaching a row needs it to already be in your own wishlist, which
 * needs it to have been ACTIVE when you saved it.
 *
 * **Nothing here reads the request.** There is no `getCurrentUser()` in this
 * file and no Next.js import, so it is a plain data module that a script can
 * exercise directly — which is what `pnpm check:wishlist` does. The helper that
 * resolves the signed-in customer for a page lives next door, in
 * `lib/wishlist/page-state.ts`.
 */

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

/** One saved piece, as the wishlist page renders it. */
export type WishlistEntry = {
  /** The same shape every other product card in the storefront takes. */
  product: ProductCardData;
  /** When it was saved. The list is ordered by this, newest first. */
  addedAt: Date;
  /**
   * False when the product has since been unpublished or archived.
   *
   * The row stays either way — an admin archiving a piece is not a reason to
   * throw away what a customer told us they wanted. The card renders as
   * unavailable and offers no purchase action, and becomes ordinary again by
   * itself if the product is republished.
   */
  available: boolean;
};

/** What a wishlist read returns. */
export type WishlistSummary = {
  entries: readonly WishlistEntry[];
  /** Everything saved, including anything currently unavailable. */
  count: number;
  /** How many of those cannot be bought right now. */
  unavailableCount: number;
};

export type WishlistErrorCode =
  | "product-not-found"
  | "product-unavailable"
  | "already-saved"
  | "not-saved"
  | "limit-reached";

export type WishlistFailure = { ok: false; code: WishlistErrorCode };

export type WishlistChange = {
  ok: true;
  /** The state the product is in now, after the write committed. */
  wishlisted: boolean;
  /** Slug of the product that changed, so the caller can revalidate its page. */
  productSlug: string;
};

export type WishlistResult = WishlistChange | WishlistFailure;

const fail = (code: WishlistErrorCode): WishlistFailure => ({ ok: false, code });

/**
 * A deliberate ceiling, not a guess.
 *
 * Nothing in the product asks for a limit, and a customer with 300 saved pieces
 * is a customer, not an attack. This exists so a scripted client cannot grow
 * one row per product in the catalogue, forever, on an endpoint that needs no
 * payment and no rate limit of its own. It is far above any real list, it is
 * reported as a plain sentence rather than an error, and the page below reads
 * every item in one query because at this size that is cheaper than paging.
 *
 * `getWishlist` also caps its own `take` at this number, so the read stays
 * bounded whatever happens to the table. Adding real pagination later means
 * giving that query a cursor; nothing else here would change.
 */
export const MAX_WISHLIST_ITEMS = 500;

/* ------------------------------------------------------------------ *
 * The list itself
 * ------------------------------------------------------------------ */

/**
 * The customer's wishlist id, creating the row if this is their first save.
 *
 * `upsert` on the unique `userId`, so the database decides rather than the
 * application. Two simultaneous first saves — two tabs, two devices, a double
 * click — both find nothing and both try to insert; one wins, and the other
 * comes back through the `P2002` branch and reads the row the winner created.
 * Without that, the second would either crash or create a second wishlist, and
 * the customer's saved pieces would split across two lists depending on which
 * one a later query happened to find.
 *
 * The `update: {}` is not a no-op by accident: it is what makes the upsert a
 * lookup when the row already exists, without touching `updatedAt`, which
 * should mean "when the contents last changed".
 */
async function resolveWishlistId(userId: string): Promise<string> {
  try {
    const wishlist = await prisma.wishlist.upsert({
      where: { userId },
      create: { userId },
      update: {},
      select: { id: true },
    });

    return wishlist.id;
  } catch (error) {
    // Lost the race. The winner's row is there now, so read it.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.wishlist.findUniqueOrThrow({
        where: { userId },
        select: { id: true },
      });

      return existing.id;
    }

    throw error;
  }
}

/**
 * The wishlist id, if one exists. Never creates.
 *
 * Reads use this rather than `resolveWishlistId`, so opening `/wishlist` or
 * loading a product grid never writes. A customer who has saved nothing has no
 * `Wishlist` row, and browsing does not give them one.
 */
async function findWishlistId(userId: string): Promise<string | null> {
  const wishlist = await prisma.wishlist.findUnique({
    where: { userId },
    select: { id: true },
  });

  return wishlist?.id ?? null;
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/**
 * Everything one customer has saved, newest first.
 *
 * **One query, not one per item.** The products come back joined to their
 * items, with the card's columns, images and variants selected in the same
 * statement, and are mapped by the same mapper the shop grid uses. Nothing here
 * reads a list of ids and then loops.
 *
 * Ordered by `WishlistItem.createdAt DESC`: what the customer saved most
 * recently is what they came back for. Explicitly *not* the product's own
 * dates, which would reorder somebody's list every time an admin saved an edit.
 */
export async function getWishlist(userId: string): Promise<WishlistSummary> {
  const wishlistId = await findWishlistId(userId);

  if (!wishlistId) {
    return { entries: [], count: 0, unavailableCount: 0 };
  }

  const rows = await prisma.wishlistItem.findMany({
    where: { wishlistId },
    orderBy: { createdAt: "desc" },
    // Bounded, so one enormous list cannot become one enormous response. See
    // MAX_WISHLIST_ITEMS.
    take: MAX_WISHLIST_ITEMS,
    select: {
      createdAt: true,
      product: { select: { ...productCardSelect, status: true } },
    },
  });

  const entries = rows.map((row) => ({
    product: toProductCardData(row.product),
    addedAt: row.createdAt,
    available: row.product.status === ProductStatus.ACTIVE,
  }));

  return {
    entries,
    count: entries.length,
    unavailableCount: entries.filter((entry) => !entry.available).length,
  };
}

/**
 * Which of these products this customer has saved.
 *
 * The batch read that keeps a product grid to one query. A page resolves the
 * user once, asks this for the ids it is about to render, and hands each card a
 * boolean. The alternative — `isProductWishlisted` inside each card — is one
 * round trip per card, which is twenty-four on a full shop page.
 *
 * Only the ids are selected, and the `IN` list is bounded by however many cards
 * the page is rendering.
 */
export async function getWishlistedProductIds(
  userId: string,
  productIds: readonly string[],
): Promise<ReadonlySet<string>> {
  if (productIds.length === 0) {
    return new Set();
  }

  const wishlistId = await findWishlistId(userId);

  if (!wishlistId) {
    return new Set();
  }

  const rows = await prisma.wishlistItem.findMany({
    where: { wishlistId, productId: { in: [...productIds] } },
    select: { productId: true },
  });

  return new Set(rows.map((row) => row.productId));
}

/**
 * Whether one product is saved.
 *
 * For a single product — the product page. **Not for a grid**: calling this in
 * a loop is the N+1 that `getWishlistedProductIds` exists to prevent.
 */
export async function isProductWishlisted(
  userId: string,
  productId: string,
): Promise<boolean> {
  const wishlistId = await findWishlistId(userId);

  if (!wishlistId) {
    return false;
  }

  const item = await prisma.wishlistItem.findUnique({
    where: { wishlistId_productId: { wishlistId, productId } },
    select: { id: true },
  });

  return item !== null;
}

/** How many pieces are saved. One `COUNT`, for the header. */
export async function countWishlistItems(userId: string): Promise<number> {
  const wishlistId = await findWishlistId(userId);

  if (!wishlistId) {
    return 0;
  }

  return prisma.wishlistItem.count({ where: { wishlistId } });
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

/**
 * The product a mutation names, checked before anything is written.
 *
 * Returns the slug, which the caller needs in order to revalidate the product
 * page, and the status, which decides whether saving is allowed at all.
 */
async function findProduct(productId: string) {
  return prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, slug: true, status: true },
  });
}

/**
 * Save a product.
 *
 * Refuses a product that does not exist, and refuses one that is not ACTIVE:
 * a draft has not been published and an archived piece has been withdrawn, so
 * neither is something a shopper can be browsing and choosing to save. The
 * asymmetry with reads is the point — **you cannot add an unavailable product,
 * but one you already saved stays** if it becomes unavailable later.
 *
 * `P2002` is caught rather than pre-checked. A `findFirst` followed by a
 * `create` has a window between them, and a double click lands squarely in it;
 * the unique index does not have a window. A duplicate is reported as
 * `already-saved`, which the caller turns into the same "it is saved" state the
 * first request produced, because from the customer's side it is.
 */
export async function addToWishlist(
  userId: string,
  productId: string,
): Promise<WishlistResult> {
  const product = await findProduct(productId);

  if (!product) {
    return fail("product-not-found");
  }

  if (product.status !== ProductStatus.ACTIVE) {
    return fail("product-unavailable");
  }

  const wishlistId = await resolveWishlistId(userId);

  const total = await prisma.wishlistItem.count({ where: { wishlistId } });

  if (total >= MAX_WISHLIST_ITEMS) {
    // Already saved counts as success even at the ceiling: refusing to
    // acknowledge something that is in the list would be nonsense.
    const existing = await prisma.wishlistItem.findUnique({
      where: { wishlistId_productId: { wishlistId, productId } },
      select: { id: true },
    });

    if (!existing) {
      return fail("limit-reached");
    }

    return { ok: true, wishlisted: true, productSlug: product.slug };
  }

  try {
    await prisma.wishlistItem.create({
      data: { wishlistId, productId },
      select: { id: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return fail("already-saved");
    }

    throw error;
  }

  await touchWishlist(wishlistId);

  return { ok: true, wishlisted: true, productSlug: product.slug };
}

/**
 * Remove a product.
 *
 * `deleteMany` scoped to this customer's own wishlist, so a product id naming
 * something in somebody else's list matches nothing and deletes nothing. The
 * count is how the caller learns whether anything actually changed.
 *
 * A product that no longer exists is still removable — the row is keyed on the
 * pair, not on the product being readable — which is what lets a customer clear
 * a stale entry. The slug lookup is best-effort for revalidation only.
 */
export async function removeFromWishlist(
  userId: string,
  productId: string,
): Promise<WishlistResult> {
  const wishlistId = await findWishlistId(userId);

  if (!wishlistId) {
    return fail("not-saved");
  }

  const { count } = await prisma.wishlistItem.deleteMany({
    where: { wishlistId, productId },
  });

  if (count === 0) {
    return fail("not-saved");
  }

  await touchWishlist(wishlistId);

  const product = await findProduct(productId);

  return { ok: true, wishlisted: false, productSlug: product?.slug ?? "" };
}

/**
 * Save it if it is not saved, remove it if it is.
 *
 * What the heart on a card does. The read and the write are not atomic, and
 * they do not need to be: whichever branch is taken, the write underneath is
 * the same constraint-guarded operation, and the two ways of losing the race
 * both end somewhere correct. Two simultaneous adds produce one row and one
 * `already-saved`; two simultaneous removes produce one deletion and one
 * `not-saved`. Neither leaves a duplicate, and neither leaves the customer
 * looking at a state the database does not hold, because the caller reports
 * what the database says rather than what the click implied.
 */
export async function toggleWishlistItem(
  userId: string,
  productId: string,
): Promise<WishlistResult> {
  const saved = await isProductWishlisted(userId, productId);

  return saved
    ? removeFromWishlist(userId, productId)
    : addToWishlist(userId, productId);
}

/**
 * Record that the contents changed.
 *
 * Separate from the write itself rather than wrapped in a transaction with it.
 * `updatedAt` is a convenience for a later "recently changed" view; if it is
 * ever a moment stale, nothing is wrong, and a transaction around every save
 * would buy a stricter guarantee on a column nothing depends on. The item rows
 * are the source of truth, and each of those is one statement protected by a
 * unique index.
 */
async function touchWishlist(wishlistId: string): Promise<void> {
  await prisma.wishlist.update({
    where: { id: wishlistId },
    data: { updatedAt: new Date() },
    select: { id: true },
  });
}
