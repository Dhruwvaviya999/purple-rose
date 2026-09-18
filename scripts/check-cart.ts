/**
 * The bag, end to end.
 *
 * Run with `pnpm check:cart`. It needs `DATABASE_URL` in `.env.local` (or
 * `.env`), the migrations applied and `pnpm db:seed` run. Without a connection
 * it exits cleanly and says what is missing rather than pretending to have
 * passed.
 *
 * Three sections, in order of how much they need.
 *
 * **Offline.** Reads the source of `src/actions/cart.ts` and asserts the shape
 * of the endpoints mechanically: that every exported action resolves its owner
 * before it parses anything, that nothing accepts a `userId`, a `cartId` or a
 * price, and that every reply is built by one of two constructors. A rule that
 * lives only in a comment is a rule that gets broken.
 *
 * **Database.** Exercises the real service against real rows: guest bags,
 * account bags, quantity rules, stock capping, the merge in every shape it
 * comes in, ownership isolation between two guests and two customers, and what
 * archiving, restocking and repricing a product does to a bag that holds it.
 *
 * **Constraints.** Pushes the things the application refuses straight at
 * PostgreSQL, to prove the CHECK constraints in the migration actually hold —
 * a bag owned by nobody, a bag owned by two people, a line with none in it.
 *
 * **Expect `prisma:error` lines.** Several checks deliberately violate a
 * constraint; that is the point of them, and the Prisma client logs errors
 * outside production. A `PASS` under one is the constraint doing its job.
 *
 * **It writes**, and everything it writes is marked. Test accounts use numbers
 * in the reserved `+1555…` range and are deleted by exact match, never by a
 * pattern. Test products carry the `zzzcart` marker. Everything is removed in a
 * `finally`, including when a check throws part way through. Seeded rows are
 * read, never modified — the archive, restock and reprice checks operate on a
 * product this script created.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ProductStatus, Role } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/db/client";
import { cartConfig } from "../src/lib/cart/limits";
import type { CartOwner } from "../src/lib/cart/ownership";
import {
  addToCart,
  clearCart,
  getCart,
  getCartCount,
  mergeGuestCart,
  removeFromCart,
  updateCartItemQuantity,
} from "../src/lib/services/cart-service";
import {
  addToCartSchema,
  updateCartItemSchema,
} from "../src/lib/validations/cart";

const MARK = "zzzcart";

/**
 * Reserved test numbers, distinct from every other suite's, so two run back to
 * back without colliding. Clean-up deletes only these, by exact match.
 */
const NUMBERS = {
  customerA: "+15550107701",
  customerB: "+15550107702",
  admin: "+15550107703",
} as const;

/** A well-formed UUID that names nothing. */
const ABSENT_ID = "00000000-0000-7000-8000-000000000000";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

function readSource(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8");
}

/**
 * The code, without the prose.
 *
 * These modules explain at length what they refuse to accept — "no `userId`, no
 * `cartId`, and no money" — and an assertion that the string `cartId` never
 * appears would fail on the sentence promising it never appears. Stripping
 * comments first means the check is about what the module *does*.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

type GuestOwner = Extract<CartOwner, { kind: "guest" }>;

/**
 * A guest owner, the way the cookie would produce one.
 *
 * The same shape `resolveOwnerForWrite` builds: a fresh 32-byte token, hashed.
 * The token itself is discarded, because nothing below needs it — which is the
 * point of the design, and why these checks can exercise the service without a
 * browser.
 */
function guest(): GuestOwner {
  const token = randomBytes(32).toString("base64url");
  return {
    kind: "guest",
    tokenHash: createHash("sha256").update(token).digest("hex"),
  };
}

/* ------------------------------------------------------------------ *
 * Offline: the shape of the endpoints
 * ------------------------------------------------------------------ */

function checkActionShape(): void {
  console.log("\n== the endpoints, read as source ==");

  const source = readSource("src", "actions", "cart.ts");

  check('the action module is marked "use server"', source.startsWith('"use server"'));

  const exported = [...source.matchAll(/export async function (\w+)/g)].map(
    (match) => match[1],
  );

  check(
    "exactly the four intended actions are exported",
    exported.length === 4 &&
      [
        "addToCartAction",
        "updateCartItemAction",
        "removeCartItemAction",
        "clearCartAction",
      ].every((name) => exported.includes(name)),
    exported.join(", "),
  );

  // Each action is checked on its own here, rather than through a shared
  // helper, because each is written out in full. The order is the security
  // property: an action that parses before it knows who is asking is doing work
  // on behalf of an unresolved caller.
  for (const name of exported) {
    const start = source.indexOf(`export async function ${name}`);
    const next = exported
      .map((other) => source.indexOf(`export async function ${other}`))
      .filter((index) => index > start)
      .sort((a, b) => a - b)[0];
    const body = source.slice(start, next === undefined ? undefined : next);

    const ownerAt = body.indexOf("resolveOwnerForWrite()");
    const parseAt = body.indexOf(".safeParse(");

    check(`${name} resolves the bag's owner`, ownerAt >= 0);
    check(
      `${name} resolves the owner before it parses anything`,
      ownerAt >= 0 && (parseAt < 0 || ownerAt < parseAt),
      `owner at ${ownerAt}, parse at ${parseAt}`,
    );
  }

  const returned = [...source.matchAll(/return (\w+)\(/g)].map(
    (match) => match[1],
  );
  check(
    "every reply is a cartSuccess or a cartFailure",
    returned.length > 0 &&
      returned.every((name) =>
        ["cartSuccess", "cartFailure", "toCartFailure", "toUnexpectedFailure"].includes(
          name,
        ),
      ),
    [...new Set(returned)].join(", "),
  );

  console.log("\n== nothing accepts an identity or a price ==");

  const validation = withoutComments(
    readSource("src", "lib", "validations", "cart.ts"),
  );
  const service = withoutComments(
    readSource("src", "lib", "services", "cart-service.ts"),
  );
  const actions = withoutComments(source);

  check(
    "no schema accepts a userId",
    !/userId:\s*z\./.test(validation),
  );
  check("no schema accepts a cartId", !/cartId:\s*z\./.test(validation));
  check(
    "no schema accepts a price of any kind",
    !/(price|subtotal|total|compareAt)\w*:\s*z\./i.test(validation),
  );
  check(
    "no exported service function takes a cartId",
    !/export (async )?function \w+\(\s*cartId/.test(service),
  );
  check(
    "the actions never mention a client-supplied cart id",
    !/\bcartId\b/.test(actions),
  );
  check("and never mention a user id", !/\buserId\b/.test(actions));

  console.log("\n== sign-in adopts the guest bag ==");

  const auth = withoutComments(readSource("src", "actions", "auth.ts"));
  const signIn = withoutComments(readSource("src", "lib", "cart", "sign-in.ts"));

  check("the sign-in action reads the guest token", /peekGuestToken\(\)/.test(auth));
  check(
    "and hands it to the bag, after the session is created",
    auth.indexOf("adoptGuestCart(") > auth.indexOf("startSession("),
    `session at ${auth.indexOf("startSession(")}, adopt at ${auth.indexOf("adoptGuestCart(")}`,
  );
  check(
    "the merge is wrapped so it can never fail the sign-in",
    /try \{[\s\S]*mergeGuestCart\([\s\S]*\} catch/.test(signIn),
  );
  check(
    "and the guest cookie is cleared only AFTER the merge commits",
    signIn.indexOf("clearGuestCookie()") > signIn.indexOf("mergeGuestCart("),
    `merge at ${signIn.indexOf("mergeGuestCart(")}, clear at ${signIn.indexOf("clearGuestCookie()")}`,
  );
  check(
    "the merge deletes the guest bag inside a transaction, not before it",
    /\$transaction\(\[[\s\S]*cart\.delete/.test(service),
  );

  console.log("\n== the bag never touches stock ==");

  check(
    "the service never writes to Inventory",
    !/prisma\.inventory\.(update|create|delete|upsert)/.test(service),
  );
  check(
    "and never decrements a quantity anywhere in the catalogue",
    !/decrement:/.test(service),
  );
  check(
    "it reads inventory, which is the whole of its interest in stock",
    /inventory: \{ select: \{ quantity: true \} \}/.test(service),
  );

  console.log("\n== input validation ==");

  check(
    "a well-formed add is accepted",
    addToCartSchema.safeParse({ variantId: ABSENT_ID, quantity: 1 }).success,
  );
  check(
    "a non-uuid variant is refused before any query",
    !addToCartSchema.safeParse({ variantId: "nope", quantity: 1 }).success,
  );
  check(
    "a fractional quantity is refused",
    !addToCartSchema.safeParse({ variantId: ABSENT_ID, quantity: 1.5 }).success,
  );
  check(
    "a negative quantity is refused",
    !addToCartSchema.safeParse({ variantId: ABSENT_ID, quantity: -1 }).success,
  );
  check(
    "zero is refused on an add",
    !addToCartSchema.safeParse({ variantId: ABSENT_ID, quantity: 0 }).success,
  );
  check(
    "NaN is refused",
    !addToCartSchema.safeParse({ variantId: ABSENT_ID, quantity: NaN }).success,
  );
  check(
    "Infinity is refused",
    !addToCartSchema.safeParse({ variantId: ABSENT_ID, quantity: Infinity })
      .success,
  );
  check(
    "an absurd quantity is refused",
    !addToCartSchema.safeParse({ variantId: ABSENT_ID, quantity: 10 ** 9 })
      .success,
  );
  check(
    "zero IS accepted on an update, where it means remove",
    updateCartItemSchema.safeParse({ cartItemId: ABSENT_ID, quantity: 0 })
      .success,
  );
  check(
    "a price in the payload is ignored rather than honoured",
    (() => {
      const parsed = addToCartSchema.safeParse({
        variantId: ABSENT_ID,
        quantity: 1,
        unitPrice: 1,
        userId: ABSENT_ID,
      });
      return (
        parsed.success &&
        !("unitPrice" in parsed.data) &&
        !("userId" in parsed.data)
      );
    })(),
  );
}

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

type Fixtures = {
  customerA: string;
  customerB: string;
  admin: string;
  /** Seeded, ACTIVE, never modified. */
  seededVariants: { id: string; price: number }[];
  /** This script's own, archived and repriced by it. */
  testVariantId: string;
  testProductId: string;
  testPrice: number;
};

async function createFixtures(): Promise<Fixtures> {
  const [customerA, customerB, admin] = await Promise.all(
    (
      [
        [NUMBERS.customerA, Role.CUSTOMER],
        [NUMBERS.customerB, Role.CUSTOMER],
        [NUMBERS.admin, Role.ADMIN],
      ] as const
    ).map(([phoneNumber, role]) =>
      prisma.user.upsert({
        where: { phoneNumber },
        create: { phoneNumber, role },
        update: { role },
        select: { id: true },
      }),
    ),
  );

  const seeded = await prisma.productVariant.findMany({
    where: {
      isActive: true,
      product: { status: ProductStatus.ACTIVE },
      inventory: { quantity: { gte: 3 } },
    },
    orderBy: { sku: "asc" },
    take: 4,
    select: { id: true, product: { select: { price: true } } },
  });

  const [category, colour, size] = await Promise.all([
    prisma.category.findFirstOrThrow({ select: { id: true } }),
    prisma.color.findFirstOrThrow({ select: { id: true } }),
    prisma.size.findFirstOrThrow({ select: { id: true } }),
  ]);

  const testPrice = 149900;

  // A product of this script's own, so archiving, restocking and repricing
  // never touch anything an operator published. An upsert, so a run that was
  // killed before its clean-up does not block the next one.
  const product = await prisma.product.upsert({
    where: { articleNumber: `PR-${MARK.toUpperCase()}-0001` },
    update: { status: ProductStatus.ACTIVE, price: testPrice },
    create: {
      articleNumber: `PR-${MARK.toUpperCase()}-0001`,
      name: `${MARK} Test Piece`,
      slug: `${MARK}-test-piece`,
      shortDescription: "A fixture, removed when the checks finish.",
      description: "A fixture, removed when the checks finish.",
      status: ProductStatus.ACTIVE,
      publishedAt: new Date(),
      price: testPrice,
      fabric: "COTTON",
      pattern: "SOLID",
      fit: "REGULAR",
      occasion: "EVERYDAY",
      careInstructions: "Machine wash cold.",
      primaryCategoryId: category.id,
    },
    select: { id: true },
  });

  const variant = await prisma.productVariant.upsert({
    where: { sku: `${MARK.toUpperCase()}-0001-A` },
    update: { isActive: true },
    create: {
      sku: `${MARK.toUpperCase()}-0001-A`,
      productId: product.id,
      colorId: colour.id,
      sizeId: size.id,
      isActive: true,
      inventory: { create: { quantity: 5 } },
    },
    select: { id: true },
  });

  await prisma.inventory.upsert({
    where: { variantId: variant.id },
    update: { quantity: 5 },
    create: { variantId: variant.id, quantity: 5 },
    select: { id: true },
  });

  return {
    customerA: customerA!.id,
    customerB: customerB!.id,
    admin: admin!.id,
    seededVariants: seeded.map((row) => ({
      id: row.id,
      price: row.product.price,
    })),
    testVariantId: variant.id,
    testProductId: product.id,
    testPrice,
  };
}

/* ------------------------------------------------------------------ *
 * Guest bags
 * ------------------------------------------------------------------ */

async function checkGuestCart(fixtures: Fixtures): Promise<void> {
  const [first, second] = fixtures.seededVariants;
  const shopper = guest();

  console.log("\n== a guest bag appears when it is first needed ==");

  check("browsing does not create a bag", (await getCart(shopper)).count === 0);
  check(
    "and leaves no row behind",
    (await prisma.cart.count({
      where: { guestTokenHash: shopper.tokenHash },
    })) === 0,
  );

  const added = await addToCart(shopper, first!.id, 1);
  check("the first add succeeds", added.ok && added.quantity === 1);
  check(
    "and created exactly one bag",
    (await prisma.cart.count({
      where: { guestTokenHash: shopper.tokenHash },
    })) === 1,
  );
  check(
    "which is owned by a token hash and not by a user",
    (await prisma.cart.findUniqueOrThrow({
      where: { guestTokenHash: shopper.tokenHash },
      select: { userId: true },
    })).userId === null,
  );
  check(
    "and is given an expiry, so it cannot live forever",
    (await prisma.cart.findUniqueOrThrow({
      where: { guestTokenHash: shopper.tokenHash },
      select: { expiresAt: true },
    })).expiresAt !== null,
  );

  console.log("\n== one bag per guest, under concurrency ==");

  const racer = guest();
  const results = await Promise.all(
    fixtures.seededVariants.map((variant) => addToCart(racer, variant.id, 1)),
  );

  check("every concurrent add succeeded", results.every((result) => result.ok));
  check(
    "exactly one bag exists for that guest",
    (await prisma.cart.count({ where: { guestTokenHash: racer.tokenHash } })) === 1,
  );
  check(
    "and every line landed in it",
    (await getCartCount(racer)) === fixtures.seededVariants.length,
  );

  console.log("\n== adding the same thing twice ==");

  const again = await addToCart(shopper, first!.id, 2);
  check("a second add increases the line", again.ok && again.quantity === 3);
  check(
    "rather than creating a second line",
    (await prisma.cartItem.count({
      where: { cart: { guestTokenHash: shopper.tokenHash }, variantId: first!.id },
    })) === 1,
  );

  const double = await Promise.all([
    addToCart(shopper, second!.id, 1),
    addToCart(shopper, second!.id, 1),
  ]);
  check("two simultaneous adds both succeed", double.every((r) => r.ok));
  check(
    "and produce exactly one line",
    (await prisma.cartItem.count({
      where: {
        cart: { guestTokenHash: shopper.tokenHash },
        variantId: second!.id,
      },
    })) === 1,
  );

  console.log("\n== quantity ==");

  const lines = await prisma.cartItem.findMany({
    where: { cart: { guestTokenHash: shopper.tokenHash }, variantId: first!.id },
    select: { id: true },
  });
  const lineId = lines[0]!.id;

  const setTo = await updateCartItemQuantity(shopper, lineId, 2);
  check("setting an exact quantity works", setTo.ok && setTo.quantity === 2);

  const tooMany = await updateCartItemQuantity(
    shopper,
    lineId,
    cartConfig.maxQuantityPerLine + 1,
  );
  check(
    "above the per-line maximum is refused",
    !tooMany.ok && tooMany.code === "invalid-quantity",
  );

  const negative = await updateCartItemQuantity(shopper, lineId, -1);
  check(
    "a negative quantity is refused",
    !negative.ok && negative.code === "invalid-quantity",
  );

  const zeroed = await updateCartItemQuantity(shopper, lineId, 0);
  check("zero removes the line", zeroed.ok && zeroed.quantity === 0);
  check(
    "and the row is gone",
    (await prisma.cartItem.count({ where: { id: lineId } })) === 0,
  );

  console.log("\n== removing and clearing ==");

  const remaining = await prisma.cartItem.findFirstOrThrow({
    where: { cart: { guestTokenHash: shopper.tokenHash } },
    select: { id: true },
  });

  const removed = await removeFromCart(shopper, remaining.id);
  check("removing a line succeeds", removed.ok);

  const removeAgain = await removeFromCart(shopper, remaining.id);
  check(
    "removing it twice is refused rather than a crash",
    !removeAgain.ok && removeAgain.code === "line-not-found",
  );

  await addToCart(shopper, first!.id, 1);
  await addToCart(shopper, second!.id, 1);

  const cleared = await clearCart(shopper);
  check("clearing empties the bag", cleared === 2, String(cleared));
  check("and the count follows", (await getCartCount(shopper)) === 0);
  check(
    "but the bag row itself stays, ready for the next add",
    (await prisma.cart.count({
      where: { guestTokenHash: shopper.tokenHash },
    })) === 1,
  );

  console.log("\n== two guests are two bags ==");

  const a = guest();
  const b = guest();

  await addToCart(a, first!.id, 2);
  await addToCart(b, second!.id, 1);

  check("each guest has their own count", (await getCartCount(a)) === 2);
  check("and it is not the other's", (await getCartCount(b)) === 1);

  const bagOfB = await getCart(b);
  check(
    "one guest's bag holds none of the other's lines",
    bagOfB.items.every((item) => item.variantId !== first!.id),
  );

  const lineOfB = bagOfB.items[0]!;
  const stolen = await removeFromCart(a, lineOfB.id);
  check(
    "one guest cannot remove another's line",
    !stolen.ok && stolen.code === "line-not-found",
  );
  check("and that line is still there", (await getCartCount(b)) === 1);

  const stolenUpdate = await updateCartItemQuantity(a, lineOfB.id, 9);
  check(
    "nor change its quantity",
    !stolenUpdate.ok && stolenUpdate.code === "line-not-found",
  );
  check(
    "and the quantity is untouched",
    (await getCart(b)).items[0]!.quantity === 1,
  );
}

/* ------------------------------------------------------------------ *
 * Account bags
 * ------------------------------------------------------------------ */

async function checkUserCart(fixtures: Fixtures): Promise<void> {
  const { customerA, customerB, admin } = fixtures;
  const [first, second] = fixtures.seededVariants;

  const ownerA: CartOwner = { kind: "user", userId: customerA };
  const ownerB: CartOwner = { kind: "user", userId: customerB };
  const ownerAdmin: CartOwner = { kind: "user", userId: admin };

  console.log("\n== an account bag ==");

  const added = await addToCart(ownerA, first!.id, 2);
  check("a signed-in shopper can add", added.ok && added.quantity === 2);
  check(
    "into a bag owned by their account",
    (await prisma.cart.findUniqueOrThrow({
      where: { userId: customerA },
      select: { guestTokenHash: true },
    })).guestTokenHash === null,
  );
  check(
    "which has no expiry, because an account bag does not lapse",
    (await prisma.cart.findUniqueOrThrow({
      where: { userId: customerA },
      select: { expiresAt: true },
    })).expiresAt === null,
  );
  check(
    "exactly one bag per account",
    (await prisma.cart.count({ where: { userId: customerA } })) === 1,
  );

  // The same account resolved twice is the same bag, which is what makes it
  // follow somebody onto a second device: nothing about the browser is in it.
  const secondDevice: CartOwner = { kind: "user", userId: customerA };
  check(
    "the same account reaches the same bag from anywhere",
    (await getCartCount(secondDevice)) === 2,
  );

  console.log("\n== what a read returns ==");

  const bag = await getCart(ownerA);
  const line = bag.items[0]!;

  check("the line names its variant", line.variantId === first!.id);
  check("and carries the product's name", line.product.name.length > 0);
  check("and the colour, by name", line.colour.name.length > 0);
  check("and the size", line.size.label.length > 0);
  check("and a photograph", line.image.src.length > 0);
  check(
    "the unit price is the catalogue's, in paise",
    line.unitPrice === first!.price,
    `${line.unitPrice} vs ${first!.price}`,
  );
  check(
    "the line subtotal is unit price times quantity, computed on the server",
    line.lineSubtotal === first!.price * 2,
  );
  check("the bag subtotal matches", bag.subtotal === first!.price * 2);
  check("the count is a count of garments, not of lines", bag.count === 2);
  check(
    "presentation data only — no Prisma row reaches the caller",
    !("cartId" in line) && !("variant" in line),
  );

  await addToCart(ownerA, second!.id, 1);
  const twoLines = await getCart(ownerA);
  check(
    "two lines, three garments",
    twoLines.lineCount === 2 && twoLines.count === 3,
    `${twoLines.lineCount} lines, ${twoLines.count} garments`,
  );
  check(
    "newest added first",
    twoLines.items[0]!.variantId === second!.id,
  );
  check(
    "the subtotal adds the lines up",
    twoLines.subtotal === first!.price * 2 + second!.price,
  );

  console.log("\n== customer A and customer B ==");

  await addToCart(ownerB, second!.id, 1);

  check("both have a bag of their own", (await getCartCount(ownerB)) === 1);
  check("and A's is unchanged", (await getCartCount(ownerA)) === 3);

  const lineOfA = (await getCart(ownerA)).items[0]!;
  const beforeA = await getCartCount(ownerA);

  const stolenRemoval = await removeFromCart(ownerB, lineOfA.id);
  check(
    "B removing A's line is refused",
    !stolenRemoval.ok && stolenRemoval.code === "line-not-found",
  );
  check("and A's bag is untouched", (await getCartCount(ownerA)) === beforeA);

  const stolenUpdate = await updateCartItemQuantity(ownerB, lineOfA.id, 9);
  check(
    "B changing A's quantity is refused",
    !stolenUpdate.ok && stolenUpdate.code === "line-not-found",
  );
  check("and the quantity is untouched", (await getCartCount(ownerA)) === beforeA);

  await clearCart(ownerB);
  check("B clearing their own bag empties only theirs", (await getCartCount(ownerA)) === beforeA);

  console.log("\n== an admin is just a shopper here ==");

  const adminAdd = await addToCart(ownerAdmin, first!.id, 1);
  check("an administrator can add to a bag", adminAdd.ok);
  check(
    "into their own, like anybody else",
    (await prisma.cart.count({ where: { userId: admin } })) === 1,
  );
  check(
    "and it is invisible to the customers",
    (await getCartCount(ownerA)) === beforeA,
  );

  console.log("\n== identifiers that name nothing ==");

  check(
    "a user with no bag reads as empty rather than erroring",
    (await getCart({ kind: "user", userId: ABSENT_ID })).count === 0,
  );
  check(
    "a guest token that names nothing reads as empty",
    (await getCart(guest())).count === 0,
  );

  const missingVariant = await addToCart(ownerA, ABSENT_ID, 1);
  check(
    "adding a variant that does not exist is refused",
    !missingVariant.ok && missingVariant.code === "variant-not-found",
  );

  const missingLine = await removeFromCart(ownerA, ABSENT_ID);
  check(
    "removing a line that does not exist is refused",
    !missingLine.ok && missingLine.code === "line-not-found",
  );
}

/* ------------------------------------------------------------------ *
 * Stock, archiving and price changes
 * ------------------------------------------------------------------ */

async function checkCatalogInteraction(fixtures: Fixtures): Promise<void> {
  const { testVariantId, testProductId, testPrice } = fixtures;
  const shopper = guest();

  console.log("\n== stock is read, never reserved ==");

  const before = await prisma.inventory.findUniqueOrThrow({
    where: { variantId: testVariantId },
    select: { quantity: true },
  });

  const added = await addToCart(shopper, testVariantId, 3);
  check("adding three of five works", added.ok && added.quantity === 3);

  const after = await prisma.inventory.findUniqueOrThrow({
    where: { variantId: testVariantId },
    select: { quantity: true },
  });
  check(
    "and inventory is completely untouched",
    after.quantity === before.quantity,
    `${before.quantity} then ${after.quantity}`,
  );

  // Two bags holding the last of something is allowed, because a bag reserves
  // nothing. The order phase is where that is settled.
  const other = guest();
  const alsoAdded = await addToCart(other, testVariantId, 5);
  check(
    "a second shopper can hold the same stock in their own bag",
    alsoAdded.ok && alsoAdded.quantity === 5,
  );
  check(
    "and inventory is still untouched",
    (await prisma.inventory.findUniqueOrThrow({
      where: { variantId: testVariantId },
      select: { quantity: true },
    })).quantity === before.quantity,
  );
  await clearCart(other);

  console.log("\n== asking for more than exists ==");

  const capped = await addToCart(shopper, testVariantId, 10);
  check(
    "the quantity is capped at what is in stock",
    capped.ok && capped.quantity === 5,
    capped.ok ? String(capped.quantity) : "refused",
  );
  check("and the cap is reported, not hidden", capped.ok && capped.capped);
  check(
    "with the number available, so the message can be specific",
    capped.ok && capped.available === 5,
  );

  await updateCartItemQuantity(
    shopper,
    (await getCart(shopper)).items[0]!.id,
    2,
  );

  console.log("\n== the price changes underneath a bag ==");

  const raised = testPrice + 20000;
  await prisma.product.update({
    where: { id: testProductId },
    data: { price: raised },
  });

  const repriced = await getCart(shopper);
  const line = repriced.items[0]!;

  check("the bag shows the new price", line.unitPrice === raised, String(line.unitPrice));
  check("and says that it changed", line.priceChanged);
  check("and the bag reports it too", repriced.hasPriceChanges);
  check(
    "the subtotal is recomputed from the new price",
    repriced.subtotal === raised * 2,
  );
  check(
    "the stored snapshot has been brought up to date",
    (await prisma.cartItem.findUniqueOrThrow({
      where: { id: line.id },
      select: { unitPrice: true },
    })).unitPrice === raised,
  );

  const quiet = await getCart(shopper);
  check(
    "so the notice is shown once rather than on every page view",
    !quiet.items[0]!.priceChanged && !quiet.hasPriceChanges,
  );

  console.log("\n== a sale starts and ends ==");

  await prisma.product.update({
    where: { id: testProductId },
    data: { compareAtPrice: raised + 50000 },
  });

  const onSale = await getCart(shopper);
  check(
    "a compare-at price reaches the line",
    onSale.items[0]!.compareAtPrice === raised + 50000,
  );
  check(
    "and the saving is counted",
    onSale.savings === 50000 * 2,
    String(onSale.savings),
  );

  await prisma.product.update({
    where: { id: testProductId },
    data: { compareAtPrice: null },
  });

  const offSale = await getCart(shopper);
  check(
    "ending the sale removes the compare-at price",
    offSale.items[0]!.compareAtPrice === undefined,
  );
  check("and the saving with it", offSale.savings === 0);

  console.log("\n== the stock runs out ==");

  await prisma.inventory.update({
    where: { variantId: testVariantId },
    data: { quantity: 1 },
  });

  const limited = await getCart(shopper);
  check(
    "a line holding more than is left says so",
    limited.items[0]!.status === "limited",
    limited.items[0]!.status,
  );
  check("and reports what is left", limited.items[0]!.availableStock === 1);

  await prisma.inventory.update({
    where: { variantId: testVariantId },
    data: { quantity: 0 },
  });

  const soldOut = await getCart(shopper);
  check(
    "a line with nothing left is out of stock",
    soldOut.items[0]!.status === "out-of-stock",
  );
  check("it is not in the subtotal", soldOut.subtotal === 0);
  check(
    "but it is still in the bag, because it is the shopper's intent",
    soldOut.lineCount === 1,
  );
  check(
    "and it is still counted, because the piece is still sold",
    soldOut.count === 2,
    String(soldOut.count),
  );

  const blocked = await addToCart(guest(), testVariantId, 1);
  check(
    "nobody can newly add something with no stock",
    !blocked.ok && blocked.code === "out-of-stock",
  );

  await prisma.inventory.update({
    where: { variantId: testVariantId },
    data: { quantity: 5 },
  });

  const restocked = await getCart(shopper);
  check(
    "restocking makes the line ordinary again, with nothing re-added",
    restocked.items[0]!.status === "available",
  );
  check("and it returns to the subtotal", restocked.subtotal > 0);

  console.log("\n== the product is archived ==");

  await prisma.product.update({
    where: { id: testProductId },
    data: { status: ProductStatus.ARCHIVED },
  });

  const archived = await getCart(shopper);
  check("the line stays", archived.lineCount === 1);
  check(
    "and is marked unavailable",
    archived.items[0]!.status === "unavailable",
  );
  check("the bag reports it", archived.hasUnavailableItems);
  check("it is not in the subtotal", archived.subtotal === 0);
  check(
    "and not in the count either, because it is no longer sold",
    archived.count === 0,
  );
  check(
    "it still carries a name and a photograph to show",
    archived.items[0]!.product.name.length > 0,
  );
  check(
    "the row was not silently deleted",
    (await prisma.cartItem.count({
      where: { cart: { guestTokenHash: shopper.tokenHash } },
    })) === 1,
  );

  const archivedAdd = await addToCart(guest(), testVariantId, 1);
  check(
    "and nobody can newly add it",
    !archivedAdd.ok && archivedAdd.code === "variant-unavailable",
  );

  await prisma.product.update({
    where: { id: testProductId },
    data: { status: ProductStatus.DRAFT },
  });
  const drafted = await addToCart(guest(), testVariantId, 1);
  check(
    "a draft cannot be added either",
    !drafted.ok && drafted.code === "variant-unavailable",
  );

  console.log("\n== the product is republished ==");

  await prisma.product.update({
    where: { id: testProductId },
    data: { status: ProductStatus.ACTIVE, publishedAt: new Date() },
  });

  const restored = await getCart(shopper);
  check(
    "the same line is buyable again, with nothing re-added",
    restored.items[0]!.status === "available",
  );
  check("it is back in the count", restored.count === 2);
  check("and back in the subtotal", restored.subtotal > 0);

  console.log("\n== a retired variant ==");

  await prisma.productVariant.update({
    where: { id: testVariantId },
    data: { isActive: false },
  });

  const retired = await getCart(shopper);
  check(
    "a deactivated variant shows as unavailable",
    retired.items[0]!.status === "unavailable",
  );
  check("and the line is kept", retired.lineCount === 1);

  const retiredAdd = await addToCart(guest(), testVariantId, 1);
  check(
    "and cannot be newly added",
    !retiredAdd.ok && retiredAdd.code === "variant-unavailable",
  );

  await prisma.productVariant.update({
    where: { id: testVariantId },
    data: { isActive: true },
  });
  check(
    "reactivating it makes the line ordinary again",
    (await getCart(shopper)).items[0]!.status === "available",
  );

  await clearCart(shopper);
}

/* ------------------------------------------------------------------ *
 * The merge
 * ------------------------------------------------------------------ */

async function checkMerge(fixtures: Fixtures): Promise<void> {
  const { customerA } = fixtures;
  const [first, second, third] = fixtures.seededVariants;
  const ownerA: CartOwner = { kind: "user", userId: customerA };

  console.log("\n== a guest signs in with an empty account bag ==");

  await clearCart(ownerA);

  const g1 = guest();
  await addToCart(g1, first!.id, 2);
  await addToCart(g1, second!.id, 1);

  const outcome = await mergeGuestCart(customerA, g1.tokenHash);
  check("the merge reports what it moved", outcome.hadGuestCart && outcome.merged === 2);

  const merged = await getCart(ownerA);
  check("everything arrived", merged.lineCount === 2, String(merged.lineCount));
  check("with its quantities", merged.count === 3, String(merged.count));
  check(
    "and nothing was duplicated",
    merged.items.filter((item) => item.variantId === first!.id).length === 1,
  );
  check(
    "the guest bag is gone",
    (await prisma.cart.count({ where: { guestTokenHash: g1.tokenHash } })) === 0,
  );

  console.log("\n== a guest signs in with a bag already there ==");

  // Account: first x 2, second x 1. Guest: first x 2, third x 1.
  const g2 = guest();
  await addToCart(g2, first!.id, 2);
  await addToCart(g2, third!.id, 1);

  await mergeGuestCart(customerA, g2.tokenHash);
  const combined = await getCart(ownerA);

  const firstLine = combined.items.find((item) => item.variantId === first!.id);
  check(
    "quantities for the same variant are added together",
    firstLine?.quantity === 4,
    String(firstLine?.quantity),
  );
  check(
    "a variant only the account had is kept",
    combined.items.some((item) => item.variantId === second!.id),
  );
  check(
    "a variant only the guest had is brought across",
    combined.items.some((item) => item.variantId === third!.id),
  );
  check("three lines in total", combined.lineCount === 3, String(combined.lineCount));
  check("six garments", combined.count === 6, String(combined.count));

  console.log("\n== running the merge twice ==");

  const repeat = await mergeGuestCart(customerA, g2.tokenHash);
  check("the second run finds no guest bag", !repeat.hadGuestCart);
  check(
    "and changes nothing",
    (await getCartCount(ownerA)) === 6,
    String(await getCartCount(ownerA)),
  );

  const both = await Promise.all([
    mergeGuestCart(customerA, g2.tokenHash),
    mergeGuestCart(customerA, g2.tokenHash),
  ]);
  check("two simultaneous merges are both harmless", both.every((r) => !r.hadGuestCart));
  check("and quantities did not double", (await getCartCount(ownerA)) === 6);

  console.log("\n== the merge refreshes prices ==");

  const stale = await prisma.cartItem.findFirstOrThrow({
    where: { cart: { userId: customerA }, variantId: first!.id },
    select: { id: true },
  });
  await prisma.cartItem.update({
    where: { id: stale.id },
    data: { unitPrice: 1 },
  });

  const g3 = guest();
  await addToCart(g3, first!.id, 1);
  await mergeGuestCart(customerA, g3.tokenHash);

  check(
    "a stale snapshot is replaced with the catalogue's price",
    (await prisma.cartItem.findUniqueOrThrow({
      where: { id: stale.id },
      select: { unitPrice: true },
    })).unitPrice === first!.price,
  );

  console.log("\n== the merge caps against current stock ==");

  await clearCart(ownerA);

  const stock = await prisma.inventory.findUniqueOrThrow({
    where: { variantId: fixtures.testVariantId },
    select: { quantity: true },
  });

  const g4 = guest();
  await addToCart(g4, fixtures.testVariantId, stock.quantity);
  await addToCart(ownerA, fixtures.testVariantId, stock.quantity);

  await mergeGuestCart(customerA, g4.tokenHash);
  const cappedMerge = await getCart(ownerA);

  check(
    "a combined quantity above stock is capped rather than refused",
    cappedMerge.items[0]!.quantity === stock.quantity,
    String(cappedMerge.items[0]!.quantity),
  );
  check("and nothing was lost", cappedMerge.lineCount === 1);

  console.log("\n== a withdrawn piece still crosses ==");

  await clearCart(ownerA);
  await prisma.product.update({
    where: { id: fixtures.testProductId },
    data: { status: ProductStatus.ACTIVE },
  });

  const g5 = guest();
  await addToCart(g5, fixtures.testVariantId, 1);

  // Archived after it was added, exactly as an admin would.
  await prisma.product.update({
    where: { id: fixtures.testProductId },
    data: { status: ProductStatus.ARCHIVED },
  });

  await mergeGuestCart(customerA, g5.tokenHash);
  const withWithdrawn = await getCart(ownerA);

  check(
    "the line is not dropped just because the piece was withdrawn",
    withWithdrawn.lineCount === 1,
  );
  check(
    "and it arrives marked unavailable",
    withWithdrawn.items[0]!.status === "unavailable",
  );

  await prisma.product.update({
    where: { id: fixtures.testProductId },
    data: { status: ProductStatus.ACTIVE },
  });
  await clearCart(ownerA);

  console.log("\n== an empty guest bag ==");

  const g6 = guest();
  await addToCart(g6, first!.id, 1);
  await clearCart(g6);

  const emptyMerge = await mergeGuestCart(customerA, g6.tokenHash);
  check("it is recognised", emptyMerge.hadGuestCart && emptyMerge.merged === 0);
  check(
    "and tidied away",
    (await prisma.cart.count({ where: { guestTokenHash: g6.tokenHash } })) === 0,
  );

  const noGuest = await mergeGuestCart(customerA, guest().tokenHash);
  check("a token naming nothing is a no-op", !noGuest.hadGuestCart);
}

/* ------------------------------------------------------------------ *
 * The database's own rules
 * ------------------------------------------------------------------ */

async function checkConstraints(): Promise<void> {
  console.log("\n== what PostgreSQL itself refuses ==");

  const refused = async (write: () => Promise<unknown>): Promise<boolean> => {
    try {
      await write();
      return false;
    } catch {
      return true;
    }
  };

  check(
    "a bag owned by nobody is refused",
    await refused(() => prisma.cart.create({ data: {}, select: { id: true } })),
  );

  check(
    "a bag owned by both a user and a guest token is refused",
    await refused(async () => {
      const user = await prisma.user.findFirstOrThrow({ select: { id: true } });
      return prisma.cart.create({
        data: {
          userId: user.id,
          guestTokenHash: createHash("sha256").update("x").digest("hex"),
          expiresAt: new Date(),
        },
        select: { id: true },
      });
    }),
  );

  check(
    "a guest bag with no expiry is refused",
    await refused(() =>
      prisma.cart.create({
        data: {
          guestTokenHash: createHash("sha256").update("y").digest("hex"),
        },
        select: { id: true },
      }),
    ),
  );

  const owner = guest();
  const variant = await prisma.productVariant.findFirstOrThrow({
    select: { id: true },
  });
  await addToCart(owner, variant.id, 1);
  const cart = await prisma.cart.findUniqueOrThrow({
    where: { guestTokenHash: owner.tokenHash },
    select: { id: true, items: { select: { id: true } } },
  });

  check(
    "a line with a quantity of zero is refused",
    await refused(() =>
      prisma.cartItem.update({
        where: { id: cart.items[0]!.id },
        data: { quantity: 0 },
        select: { id: true },
      }),
    ),
  );

  check(
    "a negative unit price is refused",
    await refused(() =>
      prisma.cartItem.update({
        where: { id: cart.items[0]!.id },
        data: { unitPrice: -1 },
        select: { id: true },
      }),
    ),
  );

  check(
    "a second line for the same variant in the same bag is refused",
    await refused(() =>
      prisma.cartItem.create({
        data: { cartId: cart.id, variantId: variant.id, quantity: 1, unitPrice: 1 },
        select: { id: true },
      }),
    ),
  );

  await prisma.cart.delete({ where: { id: cart.id } });
}

/* ------------------------------------------------------------------ *
 * Clean-up
 * ------------------------------------------------------------------ */

async function cleanUp(): Promise<void> {
  console.log("\n== clean-up ==");

  const numbers = Object.values(NUMBERS);

  // Guest bags have no account to cascade from, so they are removed by the
  // only thing that identifies them: having been created during this run.
  await prisma.cartItem.deleteMany({
    where: { variant: { sku: { startsWith: MARK.toUpperCase() } } },
  });
  await prisma.cart.deleteMany({
    where: { guestTokenHash: { not: null }, items: { none: {} } },
  });
  await prisma.cart.deleteMany({ where: { user: { phoneNumber: { in: numbers } } } });
  await prisma.user.deleteMany({ where: { phoneNumber: { in: numbers } } });
  await prisma.productVariant.deleteMany({
    where: { sku: { startsWith: MARK.toUpperCase() } },
  });
  await prisma.product.deleteMany({ where: { slug: { startsWith: MARK } } });

  // Anything still holding a seeded variant belongs to a guest this run made.
  await prisma.cart.deleteMany({
    where: { guestTokenHash: { not: null }, createdAt: { gte: startedAt } },
  });

  const [users, products, variants, carts, items] = await Promise.all([
    prisma.user.count({ where: { phoneNumber: { in: numbers } } }),
    prisma.product.count({ where: { slug: { startsWith: MARK } } }),
    prisma.productVariant.count({
      where: { sku: { startsWith: MARK.toUpperCase() } },
    }),
    prisma.cart.count(),
    prisma.cartItem.count(),
  ]);

  check("no test accounts left behind", users === 0, String(users));
  check("no test product left behind", products === 0, String(products));
  check("no test variant left behind", variants === 0, String(variants));
  check("no bags left behind", carts === 0, String(carts));
  check("no bag lines left behind", items === 0, String(items));

  const [seededProducts, seededVariants] = await Promise.all([
    prisma.product.count(),
    prisma.productVariant.count(),
  ]);

  check("the seeded catalogue is intact", seededProducts === 26, String(seededProducts));
  check("the seeded variants are intact", seededVariants === 219, String(seededVariants));
}

const startedAt = new Date();

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 * The security audit, as assertions
 * ------------------------------------------------------------------ */

/**
 * Every line of the Phase 9 security checklist, checked rather than asserted.
 *
 * These read the source of the modules involved. A checklist that lives only in
 * a document goes stale the first time somebody adds a convenient parameter, so
 * each item here is a property of the code that a future change would have to
 * break loudly.
 *
 * The behavioural half of the same list — customer A cannot reach customer B,
 * one guest cannot reach another, a bag is unreachable after sign-out — is
 * exercised against real rows further down, and over HTTP in
 * `pnpm check:cart:http`.
 */
function checkSecurityAudit(): void {
  console.log("\n== the security checklist, as code ==");

  const ownership = withoutComments(
    readSource("src", "lib", "cart", "ownership.ts"),
  );
  const owner = withoutComments(readSource("src", "lib", "cart", "owner.ts"));
  const service = withoutComments(
    readSource("src", "lib", "services", "cart-service.ts"),
  );
  const actions = withoutComments(readSource("src", "actions", "cart.ts"));
  const validation = withoutComments(
    readSource("src", "lib", "validations", "cart.ts"),
  );
  const redirect = withoutComments(
    readSource("src", "lib", "auth", "redirect.ts"),
  );

  // The guest token is opaque: random bytes, not anything derived from a user,
  // a bag or a product.
  check(
    "the guest token is random bytes, not derived from anything",
    /randomBytes\(TOKEN_BYTES\)/.test(ownership),
  );
  check("it carries 256 bits of entropy", /TOKEN_BYTES = 32/.test(ownership));

  // Only the digest is ever persisted.
  check(
    "only a digest is written to the database",
    /createHash\("sha256"\)/.test(ownership),
  );
  check(
    "the service only ever sees a hash, never a raw token",
    /guestTokenHash/.test(service) && !/\brawToken\b/.test(service),
  );
  check(
    "a raw token appears nowhere in a Prisma write",
    !/guestToken:\s/.test(service),
  );

  // The raw token is never logged. Every console call in the bag is checked,
  // not only the ones that look risky.
  for (const [name, source] of [
    ["ownership.ts", ownership],
    ["owner.ts", owner],
    ["cart-service.ts", service],
    ["cart.ts", actions],
    [
      "sign-in.ts",
      withoutComments(readSource("src", "lib", "cart", "sign-in.ts")),
    ],
    [
      "action-support.ts",
      withoutComments(readSource("src", "lib", "cart", "action-support.ts")),
    ],
  ] as const) {
    const logs = [...source.matchAll(/console\.\w+\(([\s\S]*?)\);/g)].map(
      (match) => match[1] ?? "",
    );
    const offender = logs.find((line) => /token|cookie/i.test(line));

    check(
      `${name} logs no token, hash or cookie value`,
      offender === undefined,
      offender?.replace(/\s+/g, " ").slice(0, 70) ?? "",
    );
  }

  // Nothing an owner, a price or a stock figure could arrive in.
  check("no schema accepts a userId", !/userId:\s*z\./.test(validation));
  check(
    "no schema accepts a price, subtotal or compare-at",
    !/(price|subtotal|total|compareAt)\w*:\s*z\./i.test(validation),
  );
  check(
    "no schema accepts a stock or availability figure",
    !/(stock|available)\w*:\s*z\./i.test(validation),
  );
  check(
    "the actions take only ids and a quantity",
    !/\buserId\b/.test(actions) && !/\bcartId\b/.test(actions),
  );
  check(
    "every price written comes from the catalogue row",
    /unitPrice: variant\.price/.test(service) &&
      /unitPrice: write\.unitPrice/.test(service),
  );

  // Ownership is scoped server-side on every statement that takes a line id.
  check(
    "updating a line is scoped to the owner's own bag",
    /id: cartItemId, cart: ownerWhere\(owner\)/.test(service),
  );
  check(
    "removing a line is scoped to the owner's own bag",
    /deleteMany\(\{\s*where: \{ id: cartItemId, cartId \}/.test(service),
  );
  check(
    "there is no delete by line id alone",
    !/cartItem\.delete\(\{\s*where: \{ id:/.test(service),
  );

  // No open redirect was introduced.
  check(
    "the bag introduces no redirect of its own",
    !/redirect\(/.test(actions) && !/redirect\(/.test(service),
  );
  check(
    // Spelled out in full so widening it is a deliberate edit here as well as
    // there. `/account` joined the list in Phase 10, which this check caught.
    "and the sign-in allow-list did not quietly widen",
    /ALLOWED_PREFIXES = \["\/admin", "\/shop", "\/wishlist", "\/account"\]/.test(
      redirect,
    ),
  );

  // Nothing internal in what the browser is told.
  const state = withoutComments(
    readSource("src", "features", "cart", "cart-state.ts"),
  );
  check(
    "the message table is fixed, with no interpolated internals",
    !/\$\{(error|err|e)\b/.test(state),
  );

  // No Prisma anywhere a browser would load it.
  const clientFiles = [
    ["cart-line-item.tsx", "src/components/commerce/cart-line-item.tsx"],
    ["cart-drawer.tsx", "src/components/commerce/cart-drawer.tsx"],
    ["add-to-bag-button.tsx", "src/components/commerce/add-to-bag-button.tsx"],
    ["clear-bag-button.tsx", "src/components/commerce/clear-bag-button.tsx"],
    ["cart-state.ts", "src/features/cart/cart-state.ts"],
    ["limits.ts", "src/lib/cart/limits.ts"],
  ] as const;

  for (const [name, path] of clientFiles) {
    const source = readSource(...path.split("/"));

    check(
      `${name} imports no Prisma and no database client`,
      !/@\/lib\/db\/client|generated\/prisma\/client|@prisma\//.test(source),
    );
  }

  check(
    // Comments stripped: the module's own docstring explains that it is free of
    // `server-only`, and a naive search would fail on the sentence saying so.
    "the shared limits module is free of server-only, so both sides agree",
    !/server-only/.test(
      withoutComments(readSource("src", "lib", "cart", "limits.ts")),
    ),
  );
}

async function main(): Promise<void> {
  checkActionShape();
  checkSecurityAudit();

  if (!process.env.DATABASE_URL?.trim()) {
    console.log(
      [
        "",
        "  The database-backed bag checks were skipped: no DATABASE_URL.",
        "",
        "  Set it in .env.local, then run:",
        "    pnpm db:migrate",
        "    pnpm db:seed",
        "    pnpm check:cart",
        "",
      ].join("\n"),
    );
    return;
  }

  try {
    const fixtures = await createFixtures();

    await checkGuestCart(fixtures);
    await checkUserCart(fixtures);
    await checkCatalogInteraction(fixtures);
    await checkMerge(fixtures);
    await checkConstraints();
  } finally {
    await cleanUp();
  }
}

main()
  .then(async () => {
    await prisma.$disconnect().catch(() => undefined);

    console.log(
      `\n${failed === 0 ? "OK" : "FAILED"}: ${passed} passed, ${failed} failed\n`,
    );

    if (failed > 0) {
      process.exitCode = 1;
    }
  })
  .catch(async (error: unknown) => {
    await prisma.$disconnect().catch(() => undefined);

    console.error(
      `Bag checks failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
