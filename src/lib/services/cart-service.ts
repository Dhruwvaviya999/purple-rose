import "server-only";

import type { CartData, CartItemData, CartLineStatus } from "@/types/cart";
import type { StorefrontImage } from "@/types/commerce";
import { Prisma } from "@/generated/prisma/client";
import { ProductStatus } from "@/generated/prisma/enums";
import { cartConfig } from "@/lib/cart/config";
import { guestCartExpiry, type CartOwner } from "@/lib/cart/ownership";
import { prisma } from "@/lib/db/client";

/**
 * The bag: reads, writes and the merge.
 *
 * Four rules hold throughout, and between them they are the whole of why this
 * file exists rather than the queries being spread across actions and pages.
 *
 * **Ownership is a `CartOwner` handed over by a caller that resolved it.**
 * Every function takes one and every query is scoped by it. There is no
 * function here that takes a `cartId`, and the two that take a `cartItemId`
 * scope the write to the owner's own bag in the same statement. A bag id or a
 * line id that arrived from a browser is not evidence of anything.
 *
 * **The server owns every number.** Prices come from the catalogue on every
 * read and every write. Nothing accepts a price, a subtotal or a stock figure
 * from a caller, and totals are integer arithmetic in paise throughout — there
 * is no float anywhere in this file.
 *
 * **Adding to a bag does not reserve stock.** Nothing here decrements
 * `Inventory`, creates a reservation or writes a movement. Stock is *read*, to
 * refuse a quantity that plainly cannot be met and to tell a shopper what is
 * left. Two people can hold the last dress in two bags, and the phase that
 * turns a bag into an order is where that is settled. See
 * `docs/cart/README.md`.
 *
 * **Nothing is ever silently discarded.** A line whose product was archived, a
 * line that went out of stock, a line whose price moved: all of them stay, and
 * are reported. Removing something from a bag is the shopper's decision.
 */

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

export type CartErrorCode =
  | "variant-not-found"
  | "variant-unavailable"
  | "out-of-stock"
  | "invalid-quantity"
  | "line-not-found"
  | "cart-full";

export type CartFailure = {
  ok: false;
  code: CartErrorCode;
  /** Filled where the message needs it: "Only 3 are available." */
  available?: number;
};

export type CartChange = {
  ok: true;
  /** The quantity the line actually holds now, after any capping. */
  quantity: number;
  /** True when the requested quantity was reduced to what stock allows. */
  capped: boolean;
  /** How many are left, for a message when `capped`. */
  available: number;
};

export type CartResult = CartChange | CartFailure;

const fail = (code: CartErrorCode, available?: number): CartFailure => ({
  ok: false,
  code,
  available,
});

/* ------------------------------------------------------------------ *
 * Owner scoping
 * ------------------------------------------------------------------ */

/**
 * The `where` that turns an owner into their bag, and only theirs.
 *
 * One function, used by every query in this file. It is the reason Customer A
 * cannot reach Customer B's bag and one guest cannot reach another's: there is
 * no code path that builds a cart filter any other way.
 */
function ownerWhere(owner: CartOwner) {
  return owner.kind === "user"
    ? { userId: owner.userId }
    : { guestTokenHash: owner.tokenHash };
}

/**
 * The owner's bag id, or null. Never creates.
 *
 * Reads use this, so opening a page never writes a row. A shopper who has
 * added nothing has no `Cart`, and browsing does not give them one.
 */
async function findCartId(owner: CartOwner): Promise<string | null> {
  const cart = await prisma.cart.findFirst({
    where: ownerWhere(owner),
    select: { id: true },
  });

  return cart?.id ?? null;
}

/**
 * The owner's bag id, creating it on first use.
 *
 * `upsert` against whichever unique column identifies this owner, so the
 * database decides rather than the application. Two simultaneous first adds —
 * two tabs, a double click — both find nothing and both try to insert; one
 * wins, and the loser comes back through the `P2002` branch and reads the row
 * the winner made. Without that, a shopper's bag would split in two and which
 * half they saw would depend on which row a later query happened to find.
 *
 * A guest bag's expiry is pushed forward on every write, so an active shopper's
 * bag never lapses under them.
 */
async function resolveCartId(owner: CartOwner): Promise<string> {
  const create =
    owner.kind === "user"
      ? { userId: owner.userId }
      : { guestTokenHash: owner.tokenHash, expiresAt: guestCartExpiry() };

  const update =
    owner.kind === "user" ? {} : { expiresAt: guestCartExpiry() };

  try {
    const cart = await prisma.cart.upsert({
      where:
        owner.kind === "user"
          ? { userId: owner.userId }
          : { guestTokenHash: owner.tokenHash },
      create,
      update,
      select: { id: true },
    });

    return cart.id;
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const existing = await prisma.cart.findFirstOrThrow({
        where: ownerWhere(owner),
        select: { id: true },
      });

      return existing.id;
    }

    throw error;
  }
}

/* ------------------------------------------------------------------ *
 * Reading a bag
 * ------------------------------------------------------------------ */

/**
 * Everything a line needs, joined in one statement.
 *
 * The whole bag is one query: lines, their variants, each variant's product,
 * colour, size, stock and photographs. Nothing here reads a list of ids and
 * then loops, which on a ten-line bag would be sixty round trips.
 *
 * Images are selected for the variant's own colour **and** for no colour at
 * all, in the same order the product gallery uses, so the picture on a bag line
 * is the picture the shopper was looking at when they added it. There is one
 * image-selection rule in the application and this follows it rather than
 * inventing a second that could disagree.
 */
const cartLineSelect = {
  id: true,
  quantity: true,
  unitPrice: true,
  createdAt: true,
  variant: {
    select: {
      id: true,
      sku: true,
      isActive: true,
      colorId: true,
      color: { select: { name: true, slug: true, hex: true } },
      size: { select: { name: true, code: true } },
      inventory: { select: { quantity: true } },
      product: {
        select: {
          slug: true,
          name: true,
          status: true,
          price: true,
          compareAtPrice: true,
          primaryCategory: { select: { name: true } },
          images: {
            orderBy: [{ isPrimary: "desc" }, { position: "asc" }],
            select: {
              url: true,
              alt: true,
              width: true,
              height: true,
              colorId: true,
            },
          },
        },
      },
    },
  },
} as const satisfies Prisma.CartItemSelect;

type CartLineRow = Prisma.CartItemGetPayload<{ select: typeof cartLineSelect }>;

/** Same placeholder the product mapper uses, so a bad row degrades identically. */
const MISSING_IMAGE_SRC =
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27800%27%20height%3D%271000%27%3E%3Crect%20width%3D%27800%27%20height%3D%271000%27%20fill%3D%27%23e7e3dd%27%2F%3E%3C%2Fsvg%3E";

/**
 * The photograph for this line's colour.
 *
 * The colour's own shots first, then any shot shared by every colour, which is
 * exactly the order `toProductDetailData` builds a colour's gallery in. Picking
 * the first of that list means the bag shows the plum dress for a plum line and
 * the ivory one for an ivory line, without a second query and without a second
 * algorithm that could drift from the product page's.
 */
function lineImage(row: CartLineRow): StorefrontImage {
  const images = row.variant.product.images;
  const own = images.find((image) => image.colorId === row.variant.colorId);
  const shared = images.find((image) => image.colorId === null);
  const chosen = own ?? shared ?? images[0];

  if (!chosen) {
    return {
      src: MISSING_IMAGE_SRC,
      alt: `No photograph of ${row.variant.product.name} has been uploaded yet`,
      width: 800,
      height: 1000,
    };
  }

  return {
    src: chosen.url,
    alt: chosen.alt,
    width: chosen.width,
    height: chosen.height,
  };
}

/**
 * Whether this line can be bought, and why not when it cannot.
 *
 * Four states rather than a boolean, because the causes are different and a
 * shopper can act on some of them. See `CartLineStatus`.
 */
function lineStatus(row: CartLineRow, stock: number): CartLineStatus {
  const offered =
    row.variant.isActive &&
    row.variant.product.status === ProductStatus.ACTIVE;

  if (!offered) {
    return "unavailable";
  }

  if (stock <= 0) {
    return "out-of-stock";
  }

  return stock < row.quantity ? "limited" : "available";
}

/**
 * One bag, current as of this moment.
 *
 * Reading a bag is where the catalogue and the shopper's intent are reconciled.
 * Three things can have moved since a line was written, and all three are
 * handled here rather than pretended away:
 *
 * - **The price changed.** The line shows the current one, the stored snapshot
 *   is refreshed to match, and the change is reported once. See
 *   `refreshPriceSnapshots`.
 * - **The stock changed.** The line reports what is actually left.
 * - **The product was withdrawn.** The line stays and is marked unavailable.
 *
 * Ordered newest first, by when the line was added, so what a shopper just put
 * in is at the top of the drawer where they expect it.
 */
export async function getCart(owner: CartOwner): Promise<CartData> {
  const cartId = await findCartId(owner);

  if (!cartId) {
    return emptyCart();
  }

  const rows = await prisma.cartItem.findMany({
    where: { cartId },
    orderBy: { createdAt: "desc" },
    // Bounded, so one enormous bag cannot become one enormous response.
    take: cartConfig.maxLines,
    select: cartLineSelect,
  });

  if (rows.length === 0) {
    return emptyCart();
  }

  // Which lines the catalogue has repriced since they were written. Computed
  // before the rows are mapped, because mapping uses the current price.
  const moved = rows.filter(
    (row) => row.unitPrice !== row.variant.product.price,
  );

  if (moved.length > 0) {
    await refreshPriceSnapshots(moved);
  }

  const movedIds = new Set(moved.map((row) => row.id));
  const items = rows.map((row) => toCartItemData(row, movedIds.has(row.id)));

  return summarise(items);
}

/**
 * Write the current catalogue price onto the lines whose price has moved.
 *
 * A write during a read, which deserves an explanation. The snapshot exists for
 * exactly one purpose: to notice that the price is not what it was when the
 * shopper added the piece. Once that has been noticed and said, the snapshot
 * has done its job and must be brought up to date, or the notice would repeat
 * on every page view forever.
 *
 * Failure here is deliberately swallowed. The bag renders from the *current*
 * catalogue price either way, so a failed refresh costs a repeated notice and
 * nothing else — far better than a read path that can fail and show a shopper
 * nothing.
 */
async function refreshPriceSnapshots(rows: readonly CartLineRow[]): Promise<void> {
  try {
    await prisma.$transaction(
      rows.map((row) =>
        prisma.cartItem.update({
          where: { id: row.id },
          data: { unitPrice: row.variant.product.price },
          select: { id: true },
        }),
      ),
    );
  } catch (error) {
    console.error(
      `Could not refresh cart price snapshots: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function toCartItemData(row: CartLineRow, priceChanged: boolean): CartItemData {
  const product = row.variant.product;
  const stock = row.variant.inventory?.quantity ?? 0;
  const status = lineStatus(row, stock);

  // Always the catalogue's number, never the stored snapshot. Integer paise,
  // multiplied by an integer quantity: no float touches a total in this file.
  const unitPrice = product.price;
  const onSale =
    product.compareAtPrice !== null && product.compareAtPrice > unitPrice;

  return {
    id: row.id,
    variantId: row.variant.id,
    sku: row.variant.sku,
    product: {
      slug: product.slug,
      name: product.name,
      categoryName: product.primaryCategory.name,
    },
    colour: row.variant.color,
    size: { label: row.variant.size.code, value: row.variant.size.code },
    image: lineImage(row),
    quantity: row.quantity,
    unitPrice,
    compareAtPrice: onSale ? (product.compareAtPrice ?? undefined) : undefined,
    lineSubtotal: unitPrice * row.quantity,
    status,
    availableStock: stock,
    priceChanged,
    href: `/shop/${product.slug}`,
  };
}

function emptyCart(): CartData {
  return {
    items: [],
    count: 0,
    lineCount: 0,
    subtotal: 0,
    savings: 0,
    hasUnavailableItems: false,
    hasPriceChanges: false,
  };
}

/**
 * The totals, computed once over the mapped lines.
 *
 * **The subtotal counts only what can be bought.** A withdrawn line and an
 * out-of-stock line are shown, and are not added up, because a total that
 * includes things the shopper cannot have is a number that will change at
 * checkout for reasons nobody explained.
 *
 * The count is more generous: it includes out-of-stock lines, because the piece
 * is still offered and the stock may come back, and excludes withdrawn ones,
 * because they are not part of the shop any more.
 */
function summarise(items: readonly CartItemData[]): CartData {
  let count = 0;
  let subtotal = 0;
  let savings = 0;

  for (const item of items) {
    if (item.status !== "unavailable") {
      count += item.quantity;
    }

    if (item.status === "available" || item.status === "limited") {
      subtotal += item.lineSubtotal;

      if (item.compareAtPrice) {
        savings += (item.compareAtPrice - item.unitPrice) * item.quantity;
      }
    }
  }

  return {
    items,
    count,
    lineCount: items.length,
    subtotal,
    savings,
    hasUnavailableItems: items.some((item) => item.status === "unavailable"),
    hasPriceChanges: items.some((item) => item.priceChanged),
  };
}

/**
 * How many garments are in the bag.
 *
 * What the header badge reads. One aggregate query against indexed columns,
 * with the "still offered" rule pushed into the `where` so nothing is counted
 * in JavaScript and no line rows travel back.
 *
 * Deliberately **not** `getCart(...).count`: the header renders on every page,
 * and loading a whole bag with its products and photographs to produce one
 * integer would be the most expensive number on the site. The two agree because
 * they apply the same rule, one in SQL and one over the mapped lines.
 */
export async function getCartCount(owner: CartOwner): Promise<number> {
  const cartId = await findCartId(owner);

  if (!cartId) {
    return 0;
  }

  const result = await prisma.cartItem.aggregate({
    _sum: { quantity: true },
    where: {
      cartId,
      variant: { isActive: true, product: { status: ProductStatus.ACTIVE } },
    },
  });

  return result._sum.quantity ?? 0;
}

/* ------------------------------------------------------------------ *
 * The variant a mutation names
 * ------------------------------------------------------------------ */

type ResolvedVariant = {
  id: string;
  price: number;
  stock: number;
};

/**
 * Turn a variant id from a browser into a variant that may actually be bought.
 *
 * Every one of these checks matters, and "the UUID exists" is not among them:
 *
 * - the variant exists at all;
 * - it is still offered — `isActive`, so a retired combination cannot be added;
 * - **its product is ACTIVE** — a draft that has never been published and an
 *   archived piece are equally not for sale, and the id of either is guessable
 *   by nobody but must not work if it were;
 * - there is stock.
 *
 * The product is reached *through* the variant rather than taken as a second
 * argument, which is what makes "does this variant belong to this product?"
 * unanswerable rather than merely answered — there is no pair to disagree.
 *
 * The price comes back with it, from the product row, so the caller never has a
 * reason to look at anything the browser sent.
 */
async function resolvePurchasableVariant(
  variantId: string,
): Promise<ResolvedVariant | CartFailure> {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    select: {
      id: true,
      isActive: true,
      inventory: { select: { quantity: true } },
      product: { select: { status: true, price: true } },
    },
  });

  if (!variant) {
    return fail("variant-not-found");
  }

  if (!variant.isActive || variant.product.status !== ProductStatus.ACTIVE) {
    return fail("variant-unavailable");
  }

  const stock = variant.inventory?.quantity ?? 0;

  if (stock <= 0) {
    return fail("out-of-stock", 0);
  }

  return { id: variant.id, price: variant.product.price, stock };
}

function isFailure(value: ResolvedVariant | CartFailure): value is CartFailure {
  return "ok" in value && value.ok === false;
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

/**
 * Add to the bag, or increase a line that is already there.
 *
 * **Adding is relative, not absolute.** "Add two" on a line that holds one
 * makes three. That is what a shopper means by adding, and it is also what
 * makes the operation safe against a second tab: the increment is computed from
 * the row the database holds, not from a quantity the browser believed.
 *
 * Over-asking is **capped, not refused**. Somebody asking for seven of the five
 * that exist gets five and is told so, because refusing outright would leave
 * them with nothing and no obvious next step. The cap is reported on the result
 * so the message is specific.
 *
 * The write is an upsert on `(cartId, variantId)`, so two requests for the same
 * variant arriving together produce one line with the right quantity rather
 * than two lines or a crash.
 */
export async function addToCart(
  owner: CartOwner,
  variantId: string,
  quantity: number,
): Promise<CartResult> {
  if (!Number.isInteger(quantity) || quantity < cartConfig.minQuantityPerLine) {
    return fail("invalid-quantity");
  }

  const variant = await resolvePurchasableVariant(variantId);

  if (isFailure(variant)) {
    return variant;
  }

  const cartId = await resolveCartId(owner);

  const existing = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId, variantId } },
    select: { quantity: true },
  });

  if (!existing) {
    const lines = await prisma.cartItem.count({ where: { cartId } });

    if (lines >= cartConfig.maxLines) {
      return fail("cart-full");
    }
  }

  const ceiling = Math.min(variant.stock, cartConfig.maxQuantityPerLine);
  const wanted = (existing?.quantity ?? 0) + quantity;
  const final = Math.min(wanted, ceiling);

  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId, variantId } },
    create: { cartId, variantId, quantity: final, unitPrice: variant.price },
    update: { quantity: final, unitPrice: variant.price },
    select: { id: true },
  });

  await touchCart(cartId);

  return {
    ok: true,
    quantity: final,
    capped: final < wanted,
    available: variant.stock,
  };
}

/**
 * Set a line to an exact quantity.
 *
 * What the `−` and `+` controls and a typed quantity all go through. Absolute
 * rather than relative, because the control shows a number and the shopper is
 * setting it.
 *
 * **Zero means remove.** A line holding none of something is a removal that did
 * not finish, and the database refuses it; rather than make the interface
 * special-case the last decrement, the convention is defined here once.
 *
 * Scoped by `cartItemId` **and** the owner's own bag in the same statement, so
 * a line id belonging to somebody else matches nothing. That is the whole of
 * why a line id is safe to put in the interface.
 */
export async function updateCartItemQuantity(
  owner: CartOwner,
  cartItemId: string,
  quantity: number,
): Promise<CartResult> {
  if (!Number.isInteger(quantity) || quantity < 0) {
    return fail("invalid-quantity");
  }

  if (quantity === 0) {
    return removeFromCart(owner, cartItemId);
  }

  if (quantity > cartConfig.maxQuantityPerLine) {
    return fail("invalid-quantity");
  }

  const line = await prisma.cartItem.findFirst({
    where: { id: cartItemId, cart: ownerWhere(owner) },
    select: { id: true, cartId: true, variantId: true },
  });

  if (!line) {
    return fail("line-not-found");
  }

  const variant = await resolvePurchasableVariant(line.variantId);

  if (isFailure(variant)) {
    return variant;
  }

  const ceiling = Math.min(variant.stock, cartConfig.maxQuantityPerLine);
  const final = Math.min(quantity, ceiling);

  await prisma.cartItem.update({
    where: { id: line.id },
    data: { quantity: final, unitPrice: variant.price },
    select: { id: true },
  });

  await touchCart(line.cartId);

  return {
    ok: true,
    quantity: final,
    capped: final < quantity,
    available: variant.stock,
  };
}

/**
 * Remove a line.
 *
 * `deleteMany` scoped to the owner's own bag, so a line id naming somebody
 * else's matches nothing and deletes nothing. The count is how the caller
 * learns whether anything actually changed.
 *
 * A withdrawn or out-of-stock line is removable like any other — the row is
 * keyed on the line, not on the piece still being for sale — which is what lets
 * a shopper clear something the catalogue has abandoned.
 */
export async function removeFromCart(
  owner: CartOwner,
  cartItemId: string,
): Promise<CartResult> {
  const cartId = await findCartId(owner);

  if (!cartId) {
    return fail("line-not-found");
  }

  const { count } = await prisma.cartItem.deleteMany({
    where: { id: cartItemId, cartId },
  });

  if (count === 0) {
    return fail("line-not-found");
  }

  await touchCart(cartId);

  return { ok: true, quantity: 0, capped: false, available: 0 };
}

/**
 * Empty the bag.
 *
 * Only ever the caller's own: for a guest, the one bag their cookie names; for
 * a signed-in shopper, the one their account owns. The `Cart` row itself stays,
 * so the next add reuses it rather than racing to create another.
 */
export async function clearCart(owner: CartOwner): Promise<number> {
  const cartId = await findCartId(owner);

  if (!cartId) {
    return 0;
  }

  const { count } = await prisma.cartItem.deleteMany({ where: { cartId } });

  if (count > 0) {
    await touchCart(cartId);
  }

  return count;
}

/**
 * Record that the contents changed, and push a guest bag's expiry back.
 *
 * Separate from the write rather than wrapped in a transaction with it. The
 * item rows are the source of truth and each is one statement guarded by a
 * unique index; `updatedAt` is a convenience, and `expiresAt` moving a moment
 * later than the write it belongs to costs nothing. Wrapping every add in a
 * transaction to make a housekeeping column exact would be paying for a
 * guarantee nothing reads.
 */
async function touchCart(cartId: string): Promise<void> {
  await prisma.cart.update({
    where: { id: cartId },
    data: { updatedAt: new Date() },
    select: { id: true },
  });

  await prisma.cart
    .updateMany({
      // Only guest bags carry an expiry; the CHECK constraint guarantees an
      // account bag has none, and `updateMany` with this filter is a no-op for
      // one rather than a second round trip to find out.
      where: { id: cartId, guestTokenHash: { not: null } },
      data: { expiresAt: guestCartExpiry() },
    })
    .catch(() => undefined);
}

/* ------------------------------------------------------------------ *
 * The merge
 * ------------------------------------------------------------------ */

export type MergeOutcome = {
  /** Lines that moved across, or added to an existing line. */
  merged: number;
  /** True when there was a guest bag at all. */
  hadGuestCart: boolean;
};

/**
 * Fold a guest bag into the account bag it should have belonged to.
 *
 * Run once, immediately after a successful sign-in. Everything about it is
 * built around one requirement: **a shopper must not lose anything.**
 *
 * ## What it does
 *
 * Quantities for the same variant are added together and then capped by what
 * the catalogue currently allows, so a guest's two and an account's one become
 * three unless only two exist, in which case it is two. Variants only one side
 * had move across untouched. Prices are taken from the catalogue, never from
 * either bag's snapshot, so a week-old guest price cannot survive a sign-in.
 *
 * Lines whose product has since been withdrawn are **still moved**. They are
 * the shopper's intent, they will show as unavailable in the bag, and dropping
 * them here would be exactly the silent loss this whole design is avoiding —
 * their quantity is carried over unchanged, since there is no stock figure to
 * cap it against.
 *
 * ## Why it is one transaction
 *
 * The guest bag is deleted in the same transaction that writes the merged
 * lines. If any part fails, nothing happened: the account bag is untouched and
 * the guest bag is still there, cookie and all, for the next attempt. The one
 * ordering that must never happen — delete the guest bag, then fail to write
 * its contents — is impossible by construction rather than by care.
 *
 * ## Why it is idempotent
 *
 * The guest bag is gone when it succeeds, so a second call finds nothing and
 * returns `hadGuestCart: false` without writing. Two tabs signing in at once,
 * or a retried action, cannot double a quantity. The unique index on
 * `(cartId, variantId)` is the backstop underneath that.
 */
export async function mergeGuestCart(
  userId: string,
  guestTokenHash: string,
): Promise<MergeOutcome> {
  const guestCart = await prisma.cart.findUnique({
    where: { guestTokenHash },
    select: {
      id: true,
      items: {
        select: { variantId: true, quantity: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!guestCart) {
    return { merged: 0, hadGuestCart: false };
  }

  if (guestCart.items.length === 0) {
    await prisma.cart.delete({ where: { id: guestCart.id } });
    return { merged: 0, hadGuestCart: true };
  }

  const userCartId = await resolveCartId({ kind: "user", userId });

  const [existingLines, catalogue] = await Promise.all([
    prisma.cartItem.findMany({
      where: { cartId: userCartId },
      select: { variantId: true, quantity: true },
    }),
    prisma.productVariant.findMany({
      where: { id: { in: guestCart.items.map((item) => item.variantId) } },
      select: {
        id: true,
        isActive: true,
        inventory: { select: { quantity: true } },
        product: { select: { status: true, price: true } },
      },
    }),
  ]);

  const held = new Map(
    existingLines.map((line) => [line.variantId, line.quantity]),
  );
  const current = new Map(catalogue.map((variant) => [variant.id, variant]));

  type Write = { variantId: string; quantity: number; unitPrice: number };
  const writes: Write[] = [];

  for (const item of guestCart.items) {
    const variant = current.get(item.variantId);

    // The variant row itself is gone, which the catalogue's archive-rather-
    // than-delete policy makes vanishingly unlikely. Nothing to write against.
    if (!variant) {
      continue;
    }

    const combined = (held.get(item.variantId) ?? 0) + item.quantity;
    const offered =
      variant.isActive && variant.product.status === ProductStatus.ACTIVE;
    const stock = variant.inventory?.quantity ?? 0;

    // A withdrawn piece has no meaningful stock figure to cap against, so its
    // quantity crosses unchanged and the bag will show it as unavailable.
    const ceiling = offered
      ? Math.min(stock, cartConfig.maxQuantityPerLine)
      : cartConfig.maxQuantityPerLine;

    const quantity = Math.max(1, Math.min(combined, ceiling));

    writes.push({
      variantId: item.variantId,
      quantity,
      unitPrice: variant.product.price,
    });
  }

  await prisma.$transaction([
    ...writes.map((write) =>
      prisma.cartItem.upsert({
        where: {
          cartId_variantId: {
            cartId: userCartId,
            variantId: write.variantId,
          },
        },
        create: {
          cartId: userCartId,
          variantId: write.variantId,
          quantity: write.quantity,
          unitPrice: write.unitPrice,
        },
        update: { quantity: write.quantity, unitPrice: write.unitPrice },
        select: { id: true },
      }),
    ),
    // Last, and in the same transaction. The guest bag only disappears once
    // everything it held has landed.
    prisma.cart.delete({ where: { id: guestCart.id } }),
  ]);

  return { merged: writes.length, hadGuestCart: true };
}

/* ------------------------------------------------------------------ *
 * Housekeeping
 * ------------------------------------------------------------------ */

/**
 * Delete guest bags nobody came back to.
 *
 * Not called during a request, and deliberately not wired to a page view: a
 * shopper loading the home page should not be paying for a sweep of somebody
 * else's abandoned bag. It exists so the scheduled job that will call it has
 * something correct to call, in the same spirit as
 * `deleteExpiredSessions`.
 *
 * Account bags are untouched by construction: they have no `expiresAt`, and the
 * CHECK constraint guarantees it.
 */
export async function deleteExpiredGuestCarts(): Promise<number> {
  const { count } = await prisma.cart.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  return count;
}
