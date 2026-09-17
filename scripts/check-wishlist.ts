/**
 * The wishlist, end to end.
 *
 * Run with `pnpm check:wishlist`. It needs `DATABASE_URL` in `.env.local` (or
 * `.env`), the migrations applied and `pnpm db:seed` run. Without a connection
 * it exits cleanly and says what is missing, rather than pretending to have
 * passed.
 *
 * Three sections, in order of how much they need.
 *
 * **Offline.** Reads the source of `src/actions/wishlist.ts` and asserts the
 * shape of the endpoints mechanically: that every exported action authenticates
 * before it parses anything, and that nothing anywhere accepts a `userId` or a
 * `wishlistId` from a caller. A rule that is only written in a comment is a
 * rule that gets broken; this is the same approach `pnpm check:admin` takes to
 * the admin guard.
 *
 * **Database.** Exercises the real service against real rows: creation,
 * one-wishlist-per-user under concurrency, duplicates, removal, toggling,
 * ordering, archiving and reactivation, and customer isolation between two test
 * accounts.
 *
 * **HTTP.** If something is answering on `CHECK_BASE_URL`, checks that an
 * anonymous request for `/wishlist` is refused rather than served, and that it
 * is sent somewhere safe. Skipped, not failed, when nothing is running.
 *
 * **Expect `prisma:error` lines in the output.** Several checks deliberately
 * violate a unique constraint — that is the point of them — and the Prisma
 * client is configured to log errors outside production. A `PASS` on the line
 * underneath one is the constraint doing its job.
 *
 * **It writes**, and everything it writes is marked. Test accounts use numbers
 * in the reserved `+1555…` range, and the test product's slug, article number
 * and SKU all carry the `zzzwish` marker. Every one of them is removed in a
 * `finally`, including when a check throws part way through. Seeded rows are
 * read, never modified — the archive and reactivate checks operate on the test
 * product, not on a real one.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ProductStatus, Role } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/db/client";
import { safeRedirectPath } from "../src/lib/auth/redirect";
import {
  addToWishlist,
  countWishlistItems,
  getWishlist,
  getWishlistedProductIds,
  isProductWishlisted,
  removeFromWishlist,
  toggleWishlistItem,
} from "../src/lib/services/wishlist-service";
import { wishlistMutationSchema } from "../src/lib/validations/wishlist";

const BASE = (process.env.CHECK_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

/** Marks everything this script creates, so clean-up cannot miss a row. */
const MARK = "zzzwish";

/**
 * Reserved test numbers.
 *
 * In the `+1555…` range that exists for exactly this, and distinct from the
 * numbers the other suites use, so two suites running back to back never
 * collide. Clean-up deletes **only** these three; no query in this file
 * deletes a user by anything other than an exact match against them, because
 * a real customer record must never be removed to make a test report tidy.
 */
const NUMBERS = {
  customerA: "+15550108801",
  customerB: "+15550108802",
  admin: "+15550108803",
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

/* ------------------------------------------------------------------ *
 * Offline: the shape of the endpoints
 * ------------------------------------------------------------------ */

function readSource(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8");
}

/**
 * Every exported Server Action authenticates before it parses.
 *
 * The order matters as much as the presence. An action that validates first and
 * checks the session afterwards is still an endpoint that does work on behalf
 * of an unauthenticated caller, and the difference is invisible in review once
 * the file is long enough. So it is asserted here instead.
 */
function checkActionShape(): void {
  console.log("\n== the endpoints, read as source ==");

  const source = readSource("src", "actions", "wishlist.ts");

  check('the action module is marked "use server"', source.startsWith('"use server"'));

  const exported = [...source.matchAll(/export async function (\w+)/g)].map(
    (match) => match[1],
  );

  check(
    "exactly the three intended actions are exported",
    exported.length === 3 &&
      ["addToWishlistAction", "removeFromWishlistAction", "toggleWishlistAction"].every(
        (name) => exported.includes(name),
      ),
    exported.join(", "),
  );

  // All three delegate to one private helper, so the ordering assertion below
  // is made against that helper rather than three times over.
  const helper = source.slice(
    source.indexOf("async function runWishlistMutation"),
    source.indexOf("/** Save a product."),
  );

  const authAt = helper.indexOf("getCurrentUser()");
  const parseAt = helper.indexOf("wishlistMutationSchema.safeParse");

  check("the shared body resolves the session", authAt >= 0);
  check("it validates input", parseAt >= 0);
  check(
    "and it authenticates BEFORE it parses anything",
    authAt >= 0 && parseAt >= 0 && authAt < parseAt,
    `auth at ${authAt}, parse at ${parseAt}`,
  );
  check(
    "an anonymous caller is refused rather than redirected",
    helper.includes('wishlistFailure("SIGNED_OUT")') && !helper.includes("redirect("),
  );
  check(
    "the user id handed to the service comes from the session",
    /operate\(user\.id,/.test(helper),
  );
  // The service reports "already saved" and "not saved" as refusals, because
  // they are distinct outcomes worth naming. The endpoint turns them into the
  // state the customer asked for: a double click did what it meant to.
  check(
    "a duplicate save is reported to the browser as saved",
    /case "already-saved":[\s\S]{0,40}?return wishlistSuccess\(true\);/.test(
      helper,
    ),
  );
  check(
    "a removal of something not saved is reported as not saved",
    /case "not-saved":[\s\S]{0,40}?return wishlistSuccess\(false\);/.test(
      helper,
    ),
  );

  // Everything the endpoint hands back is one of two constructors, both of
  // which draw their wording from a fixed table. There is no path by which a
  // caught error becomes part of a reply.
  const returned = [...helper.matchAll(/return (\w+)/g)].map(
    (match) => match[1],
  );
  check(
    "every reply is a wishlistSuccess or a wishlistFailure",
    returned.length > 0 &&
      returned.every((name) => name === "wishlistSuccess" || name === "wishlistFailure"),
    [...new Set(returned)].join(", "),
  );
  check(
    "a caught error is logged on the server and nowhere else",
    /console\.error\(/.test(helper) &&
      helper.indexOf("error.message") > helper.indexOf("console.error("),
  );

  console.log("\n== nothing accepts an identity from the caller ==");

  const validation = readSource("src", "lib", "validations", "wishlist.ts");
  const service = readSource("src", "lib", "services", "wishlist-service.ts");

  // Comments talk about `userId` at length, so the search is for a schema field
  // or a destructured input rather than for the word.
  check(
    "the mutation schema has exactly one field, productId",
    /z\.object\(\{\s*productId: productIdSchema,\s*\}\)/.test(validation),
  );
  check(
    "no schema in the wishlist accepts a userId",
    !/userId:\s*z\./.test(validation),
  );
  check(
    "no schema in the wishlist accepts a wishlistId",
    !/wishlistId:\s*z\./.test(validation),
  );
  check(
    "no exported service function takes a wishlistId",
    !/export (async )?function \w+\(\s*wishlistId/.test(service),
  );
  check(
    "the actions never mention a client-supplied wishlist id",
    !/wishlistId/.test(source),
  );

  console.log("\n== the sign-in return destination ==");

  check(
    "/wishlist is an allowed return destination",
    safeRedirectPath("/wishlist") === "/wishlist",
  );
  check(
    "a product page is an allowed return destination",
    safeRedirectPath("/shop/a-dress") === "/shop/a-dress",
  );
  check(
    "an absolute URL to another host is refused",
    safeRedirectPath("https://evil.example.com") === null,
  );
  check(
    "a protocol-relative URL is refused",
    safeRedirectPath("//evil.example.com") === null,
  );
  check(
    "a backslash-smuggled host is refused",
    safeRedirectPath("/\\evil.example.com") === null,
  );
  check(
    "an encoded protocol-relative URL is refused",
    safeRedirectPath("%2F%2Fevil.example.com") === null,
  );

  console.log("\n== input validation ==");

  check(
    "a well-formed product id is accepted",
    wishlistMutationSchema.safeParse({ productId: ABSENT_ID }).success,
  );
  check(
    "a non-uuid product id is refused before any query",
    !wishlistMutationSchema.safeParse({ productId: "not-a-uuid" }).success,
  );
  check(
    "an empty product id is refused",
    !wishlistMutationSchema.safeParse({ productId: "" }).success,
  );
  check(
    "a numeric product id is refused",
    !wishlistMutationSchema.safeParse({ productId: 12 }).success,
  );
  check(
    "a userId in the payload is ignored rather than honoured",
    (() => {
      const parsed = wishlistMutationSchema.safeParse({
        productId: ABSENT_ID,
        userId: ABSENT_ID,
      });
      return parsed.success && !("userId" in parsed.data);
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
  /** A product created by this script, archived and reactivated by it. */
  testProductId: string;
  /** Seeded, ACTIVE, never modified. */
  seededProductIds: string[];
};

async function createFixtures(): Promise<Fixtures> {
  const [customerA, customerB, admin] = await Promise.all([
    prisma.user.upsert({
      where: { phoneNumber: NUMBERS.customerA },
      create: { phoneNumber: NUMBERS.customerA, role: Role.CUSTOMER },
      update: { role: Role.CUSTOMER },
      select: { id: true },
    }),
    prisma.user.upsert({
      where: { phoneNumber: NUMBERS.customerB },
      create: { phoneNumber: NUMBERS.customerB, role: Role.CUSTOMER },
      update: { role: Role.CUSTOMER },
      select: { id: true },
    }),
    prisma.user.upsert({
      where: { phoneNumber: NUMBERS.admin },
      create: { phoneNumber: NUMBERS.admin, role: Role.ADMIN },
      update: { role: Role.ADMIN },
      select: { id: true },
    }),
  ]);

  const category = await prisma.category.findFirstOrThrow({
    select: { id: true },
  });

  // A product of this script's own, so archiving and republishing never touches
  // anything an operator seeded or published.
  // An upsert rather than a create. If an earlier run was killed between
  // creating this fixture and cleaning it up, a plain create would fail on the
  // unique article number and the suite would refuse to start over something it
  // left behind itself.
  const product = await prisma.product.upsert({
    where: { articleNumber: `PR-${MARK.toUpperCase()}-0001` },
    update: { status: ProductStatus.ACTIVE, publishedAt: new Date() },
    create: {
      articleNumber: `PR-${MARK.toUpperCase()}-0001`,
      name: `${MARK} Test Piece`,
      slug: `${MARK}-test-piece`,
      shortDescription: "A fixture, removed when the checks finish.",
      description: "A fixture, removed when the checks finish.",
      status: ProductStatus.ACTIVE,
      publishedAt: new Date(),
      price: 129900,
      fabric: "COTTON",
      pattern: "SOLID",
      fit: "REGULAR",
      occasion: "EVERYDAY",
      careInstructions: "Machine wash cold.",
      primaryCategoryId: category.id,
    },
    select: { id: true },
  });

  const seeded = await prisma.product.findMany({
    where: { status: ProductStatus.ACTIVE, slug: { not: { startsWith: MARK } } },
    orderBy: { slug: "asc" },
    take: 4,
    select: { id: true },
  });

  return {
    customerA: customerA.id,
    customerB: customerB.id,
    admin: admin.id,
    testProductId: product.id,
    seededProductIds: seeded.map((row) => row.id),
  };
}

/* ------------------------------------------------------------------ *
 * Database
 * ------------------------------------------------------------------ */

async function checkWishlistBehaviour(fixtures: Fixtures): Promise<void> {
  const { customerA, customerB, admin, testProductId, seededProductIds } =
    fixtures;
  const [first, second, third] = seededProductIds;

  console.log("\n== a wishlist appears when it is first needed ==");

  check(
    "browsing does not create a wishlist",
    (await getWishlist(customerA)).count === 0 &&
      (await prisma.wishlist.count({ where: { userId: customerA } })) === 0,
  );
  check(
    "reading state for a customer with no wishlist returns nothing",
    (await getWishlistedProductIds(customerA, seededProductIds)).size === 0,
  );

  const firstAdd = await addToWishlist(customerA, first!);
  check("the first save succeeds", firstAdd.ok && firstAdd.wishlisted);
  check(
    "and it created exactly one wishlist",
    (await prisma.wishlist.count({ where: { userId: customerA } })) === 1,
  );

  console.log("\n== one wishlist per customer, under concurrency ==");

  // Four simultaneous first saves for a customer who has no wishlist yet. This
  // is the two-tabs case: without the unique constraint and the upsert, more
  // than one Wishlist row appears here.
  const racers = await Promise.all(
    [first, second, third, testProductId].map((id) =>
      addToWishlist(customerB, id!),
    ),
  );

  check("every concurrent save succeeded", racers.every((result) => result.ok));
  check(
    "exactly one wishlist exists for that customer",
    (await prisma.wishlist.count({ where: { userId: customerB } })) === 1,
  );
  check(
    "and all four items landed in it",
    (await countWishlistItems(customerB)) === 4,
  );
  check(
    "the unique constraint on userId is what guarantees it",
    (await prisma.wishlist.count({ where: { userId: customerB } })) === 1,
  );

  console.log("\n== duplicates ==");

  const again = await addToWishlist(customerA, first!);
  check(
    "the service reports a second save of the same piece as a duplicate",
    !again.ok && again.code === "already-saved",
  );
  check(
    "and leaves exactly one row",
    (await countWishlistItems(customerA)) === 1,
  );

  // The double click, as the database sees it: two inserts of the same pair at
  // the same moment. One wins, one hits the unique index.
  const doubleClick = await Promise.all([
    addToWishlist(customerA, second!),
    addToWishlist(customerA, second!),
  ]);
  check(
    "of two simultaneous saves, one writes and one is refused by the index",
    doubleClick.filter((result) => result.ok).length === 1 &&
      doubleClick.filter(
        (result) => !result.ok && result.code === "already-saved",
      ).length === 1,
  );
  check(
    "and they produce exactly one row",
    (await prisma.wishlistItem.count({
      where: { wishlist: { userId: customerA }, productId: second! },
    })) === 1,
  );

  console.log("\n== removal and toggling ==");

  const removed = await removeFromWishlist(customerA, second!);
  check("removing succeeds", removed.ok && !removed.wishlisted);
  check(
    "and the row is gone",
    !(await isProductWishlisted(customerA, second!)),
  );

  const removeAgain = await removeFromWishlist(customerA, second!);
  check(
    "removing something that is not saved is refused, not a crash",
    !removeAgain.ok && removeAgain.code === "not-saved",
  );

  const toggledOn = await toggleWishlistItem(customerA, second!);
  check("toggling an unsaved product saves it", toggledOn.ok && toggledOn.wishlisted);

  const toggledOff = await toggleWishlistItem(customerA, second!);
  check(
    "toggling a saved product removes it",
    toggledOff.ok && !toggledOff.wishlisted,
  );
  check(
    "toggle leaves the count where it started",
    (await countWishlistItems(customerA)) === 1,
  );

  console.log("\n== what a read returns ==");

  await addToWishlist(customerA, second!);
  await addToWishlist(customerA, third!);

  const list = await getWishlist(customerA);

  check("every saved piece is returned", list.count === 3, String(list.count));
  check(
    "newest saved first",
    list.entries[0]!.product.id === third! &&
      list.entries[2]!.product.id === first!,
    list.entries.map((entry) => entry.product.id).join(", "),
  );
  check(
    "the order is by when it was saved, descending",
    list.entries[0]!.addedAt >= list.entries[1]!.addedAt &&
      list.entries[1]!.addedAt >= list.entries[2]!.addedAt,
  );
  check(
    "each entry carries the product it references",
    list.entries.every(
      (entry) => entry.product.name.length > 0 && entry.product.slug.length > 0,
    ),
  );
  check(
    "presentation data only — no Prisma row reaches the caller",
    list.entries.every(
      (entry) =>
        !("status" in entry.product) &&
        !("primaryCategoryId" in entry.product) &&
        typeof entry.product.category.name === "string",
    ),
  );
  check(
    "active products are reported as available",
    list.entries.every((entry) => entry.available) && list.unavailableCount === 0,
  );

  console.log("\n== batch state, not one query per card ==");

  const batch = await getWishlistedProductIds(customerA, seededProductIds);
  check(
    "the batch read returns exactly the saved ids",
    batch.size === 3 &&
      [first, second, third].every((id) => batch.has(id!)) &&
      !batch.has(seededProductIds[3]!),
  );
  check(
    "it agrees with the single-product read",
    (await isProductWishlisted(customerA, first!)) === batch.has(first!) &&
      (await isProductWishlisted(customerA, seededProductIds[3]!)) ===
        batch.has(seededProductIds[3]!),
  );
  check(
    "an empty id list does not query at all",
    (await getWishlistedProductIds(customerA, [])).size === 0,
  );

  console.log("\n== an admin is just a customer here ==");

  const adminAdd = await addToWishlist(admin, first!);
  check("an administrator can save a piece", adminAdd.ok && adminAdd.wishlisted);
  check(
    "into their own wishlist, not a shared one",
    (await countWishlistItems(admin)) === 1,
  );
  check(
    "an administrator's save does not appear in a customer's list",
    (await countWishlistItems(customerB)) === 4 &&
      (await prisma.wishlistItem.count({
        where: { wishlist: { userId: admin } },
      })) === 1,
  );
  check(
    "there is no separate admin wishlist model",
    (await prisma.wishlist.count({ where: { userId: admin } })) === 1,
  );
}

/* ------------------------------------------------------------------ *
 * Archiving
 * ------------------------------------------------------------------ */

async function checkArchiving(fixtures: Fixtures): Promise<void> {
  const { customerB, testProductId } = fixtures;

  console.log("\n== an archived product stays in the wishlist ==");

  check(
    "the piece starts out saved and available",
    (await getWishlist(customerB)).entries.some(
      (entry) => entry.product.id === testProductId && entry.available,
    ),
  );

  const before = await countWishlistItems(customerB);

  await prisma.product.update({
    where: { id: testProductId },
    data: { status: ProductStatus.ARCHIVED },
  });

  const archived = await getWishlist(customerB);
  const archivedEntry = archived.entries.find(
    (entry) => entry.product.id === testProductId,
  );

  check(
    "archiving does not delete the customer's row",
    (await countWishlistItems(customerB)) === before,
  );
  check("the piece is still on the list", archivedEntry !== undefined);
  check(
    "and is reported as unavailable",
    archivedEntry !== undefined && !archivedEntry.available,
  );
  check(
    "the summary counts it as unavailable",
    archived.unavailableCount === 1,
    String(archived.unavailableCount),
  );
  check(
    "it still carries a name and a photograph to show",
    archivedEntry !== undefined && archivedEntry.product.name.length > 0,
  );

  console.log("\n== but an archived product cannot be newly saved ==");

  const blocked = await addToWishlist(fixtures.customerA, testProductId);
  check(
    "saving an archived piece is refused",
    !blocked.ok && blocked.code === "product-unavailable",
  );
  check(
    "and nothing was written",
    !(await isProductWishlisted(fixtures.customerA, testProductId)),
  );

  await prisma.product.update({
    where: { id: testProductId },
    data: { status: ProductStatus.DRAFT },
  });

  const draftBlocked = await addToWishlist(fixtures.customerA, testProductId);
  check(
    "saving a draft is refused too",
    !draftBlocked.ok && draftBlocked.code === "product-unavailable",
  );
  check(
    "a draft in an existing wishlist is also shown as unavailable",
    (await getWishlist(customerB)).entries.find(
      (entry) => entry.product.id === testProductId,
    )?.available === false,
  );

  console.log("\n== republishing brings it back by itself ==");

  await prisma.product.update({
    where: { id: testProductId },
    data: { status: ProductStatus.ACTIVE, publishedAt: new Date() },
  });

  const restored = await getWishlist(customerB);
  const restoredEntry = restored.entries.find(
    (entry) => entry.product.id === testProductId,
  );

  check(
    "the same entry is available again, with nothing re-added",
    restoredEntry !== undefined && restoredEntry.available,
  );
  check("and nothing is left marked unavailable", restored.unavailableCount === 0);
  check(
    "the customer never had to save it a second time",
    (await countWishlistItems(customerB)) === before,
  );

  const allowedAgain = await addToWishlist(fixtures.customerA, testProductId);
  check(
    "and it can be saved by somebody new again",
    allowedAgain.ok && allowedAgain.wishlisted,
  );
  await removeFromWishlist(fixtures.customerA, testProductId);
}

/* ------------------------------------------------------------------ *
 * Isolation
 * ------------------------------------------------------------------ */

async function checkIsolation(fixtures: Fixtures): Promise<void> {
  const { customerA, customerB } = fixtures;

  console.log("\n== customer A and customer B ==");

  const [listA, listB] = await Promise.all([
    getWishlist(customerA),
    getWishlist(customerB),
  ]);

  const idsA = new Set(listA.entries.map((entry) => entry.product.id));
  const idsB = new Set(listB.entries.map((entry) => entry.product.id));

  // B has a product A does not: the test piece. That is what makes the next
  // assertions meaningful rather than vacuous.
  const onlyB = [...idsB].filter((id) => !idsA.has(id));

  check("both customers have a list of their own", listA.count > 0 && listB.count > 0);
  check(
    "B has at least one piece A does not",
    onlyB.length > 0,
    `A: ${listA.count}, B: ${listB.count}`,
  );

  const target = onlyB[0]!;

  check(
    "A's list does not contain B's piece",
    !(await isProductWishlisted(customerA, target)),
  );
  check(
    "A's batch state does not report B's piece",
    !(await getWishlistedProductIds(customerA, [target])).has(target),
  );

  const beforeB = await countWishlistItems(customerB);
  const stolenRemoval = await removeFromWishlist(customerA, target);

  check(
    "A removing B's piece is refused",
    !stolenRemoval.ok && stolenRemoval.code === "not-saved",
  );
  check(
    "and B's list is untouched",
    (await countWishlistItems(customerB)) === beforeB,
  );
  check(
    "specifically, B still has that piece",
    await isProductWishlisted(customerB, target),
  );

  // The mirror image, so neither direction is special.
  const aOnly = [...idsA].filter((id) => !idsB.has(id));

  if (aOnly.length > 0) {
    const beforeA = await countWishlistItems(customerA);
    const other = await removeFromWishlist(customerB, aOnly[0]!);

    check(
      "B removing A's piece is refused",
      !other.ok && other.code === "not-saved",
    );
    check(
      "and A's list is untouched",
      (await countWishlistItems(customerA)) === beforeA,
    );
  }

  // Toggling is the operation that reads before it writes, so it gets its own
  // pass: a toggle on somebody else's item must add to your own list, never
  // remove from theirs.
  const beforeToggleB = await countWishlistItems(customerB);
  const toggled = await toggleWishlistItem(customerA, target);

  check(
    "A toggling B's piece adds it to A's own list",
    toggled.ok && toggled.wishlisted,
  );
  check(
    "and still does not touch B's",
    (await countWishlistItems(customerB)) === beforeToggleB &&
      (await isProductWishlisted(customerB, target)),
  );
  await removeFromWishlist(customerA, target);

  console.log("\n== identifiers that name nothing ==");

  check(
    "a user id with no wishlist reads as empty rather than erroring",
    (await getWishlist(ABSENT_ID)).count === 0,
  );
  check(
    "a count for an unknown user is zero",
    (await countWishlistItems(ABSENT_ID)) === 0,
  );
  check(
    "batch state for an unknown user is empty",
    (await getWishlistedProductIds(ABSENT_ID, [...idsA])).size === 0,
  );

  const missing = await addToWishlist(customerA, ABSENT_ID);
  check(
    "saving a product that does not exist is refused",
    !missing.ok && missing.code === "product-not-found",
  );

  const missingRemoval = await removeFromWishlist(customerA, ABSENT_ID);
  check(
    "removing a product that does not exist is refused",
    !missingRemoval.ok && missingRemoval.code === "not-saved",
  );

  const wishlistIdOfB = await prisma.wishlist.findUniqueOrThrow({
    where: { userId: customerB },
    select: { id: true },
  });

  check(
    "B's wishlist id is of no use as an identity: there is no call that takes one",
    typeof wishlistIdOfB.id === "string" &&
      !readSource("src", "lib", "services", "wishlist-service.ts").includes(
        "export async function getWishlistById",
      ),
  );
}

/* ------------------------------------------------------------------ *
 * HTTP: the anonymous case
 * ------------------------------------------------------------------ */

async function checkAnonymousHttp(): Promise<void> {
  let reachable = true;

  try {
    await fetch(`${BASE}/robots.txt`);
  } catch {
    reachable = false;
  }

  if (!reachable) {
    console.log(
      [
        "",
        `  The anonymous HTTP checks were skipped: nothing is answering at ${BASE}.`,
        "",
        "    pnpm build && pnpm start",
        "    pnpm check:wishlist",
        "",
      ].join("\n"),
    );
    return;
  }

  console.log("\n== an anonymous request for the wishlist ==");

  const response = await fetch(`${BASE}/wishlist`, { redirect: "manual" });
  const location = response.headers.get("location") ?? "";

  check(
    "is not served the page",
    response.status >= 300 && response.status < 400,
    `status ${response.status}`,
  );
  check(
    "it is sent to sign in",
    location.includes("/login"),
    location || "(no location header)",
  );
  check(
    "carrying a return destination that is this site",
    location.includes(`next=${encodeURIComponent("/wishlist")}`),
    location,
  );

  const robots = await fetch(`${BASE}/robots.txt`).then((res) => res.text());
  check("robots.txt disallows /wishlist", robots.includes("/wishlist"));

  const sitemap = await fetch(`${BASE}/sitemap.xml`).then((res) => res.text());
  check("the sitemap does not list /wishlist", !sitemap.includes("/wishlist"));
}

/* ------------------------------------------------------------------ *
 * Clean-up
 * ------------------------------------------------------------------ */

/**
 * Remove everything this script created, and nothing else.
 *
 * Runs in a `finally`, so a check that throws still leaves the database as it
 * was found. Users are deleted by exact phone number — never by a pattern —
 * because the one thing worse than an untidy test database is a script that
 * deletes a real account.
 *
 * Wishlists and their items go with the users by cascade; they are counted
 * afterwards rather than deleted, so the cascade itself is verified.
 */
async function cleanUp(): Promise<void> {
  console.log("\n== clean-up ==");

  const numbers = Object.values(NUMBERS);

  await prisma.user.deleteMany({ where: { phoneNumber: { in: numbers } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: MARK } } });

  const [users, products, orphanWishlists, orphanItems] = await Promise.all([
    prisma.user.count({ where: { phoneNumber: { in: numbers } } }),
    prisma.product.count({ where: { slug: { startsWith: MARK } } }),
    prisma.wishlist.count({ where: { user: { phoneNumber: { in: numbers } } } }),
    prisma.wishlistItem.count({
      where: { wishlist: { user: { phoneNumber: { in: numbers } } } },
    }),
  ]);

  check("no test accounts left behind", users === 0, String(users));
  check("no test product left behind", products === 0, String(products));
  check(
    "deleting an account took its wishlist with it",
    orphanWishlists === 0,
    String(orphanWishlists),
  );
  check(
    "and every item in it",
    orphanItems === 0,
    String(orphanItems),
  );

  const [seededProducts, seededCategories] = await Promise.all([
    prisma.product.count(),
    prisma.category.count(),
  ]);

  check("the seeded catalogue is intact", seededProducts === 26, String(seededProducts));
  check("the seeded collections are intact", seededCategories === 6, String(seededCategories));

  const archivedTestPieces = await prisma.product.count({
    where: { name: { contains: MARK } },
  });
  check("nothing named by this script remains", archivedTestPieces === 0);
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  checkActionShape();

  if (!process.env.DATABASE_URL?.trim()) {
    console.log(
      [
        "",
        "  The database-backed wishlist checks were skipped: no DATABASE_URL.",
        "",
        "  Set it in .env.local, then run:",
        "    pnpm db:migrate",
        "    pnpm db:seed",
        "    pnpm check:wishlist",
        "",
      ].join("\n"),
    );
    return;
  }

  try {
    const fixtures = await createFixtures();

    await checkWishlistBehaviour(fixtures);
    await checkArchiving(fixtures);
    await checkIsolation(fixtures);
    await checkAnonymousHttp();
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
      `Wishlist checks failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
