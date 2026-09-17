/**
 * The wishlist, in a real browser.
 *
 * Run with `pnpm check:wishlist:ui` while the application is running. Point it
 * elsewhere with `CHECK_BASE_URL=http://localhost:3100`.
 *
 * It reuses the Phase 7 setup exactly: the same `playwright` dependency, the
 * same headless Chromium, the same shape of session — a genuine `Session` row
 * created the way sign-in creates one, handed to the browser in the real
 * session cookie — so what this drives is what a customer drives. No second
 * browser-testing system is introduced.
 *
 * What it covers, in order:
 *
 * - **Anonymous.** A product page, the heart, the sign-in journey, and that the
 *   destination it carries is this site and nowhere else.
 * - **A customer.** Save from the product page, save from a card, the state
 *   crossing pages, the wishlist itself, removal, the empty state.
 * - **Duplicates.** Clicking twice, and what the database holds afterwards.
 * - **Archiving.** A saved piece withdrawn and republished, with the list
 *   refreshed in between.
 * - **Persistence.** The same account in a second browser context with a second
 *   session, which is the multi-device case, and across a sign-out.
 * - **Responsive.** Nine widths, checked for sideways scroll and thumb-sized
 *   targets.
 * - **Accessible.** Names, pressed state, keyboard operation, focus after a
 *   mutation, and whether the outcome is announced.
 *
 * **It writes.** Two accounts on reserved `+1555…` numbers and one product
 * marked `zzzwishui`, all removed in a `finally` including on failure. Seeded
 * rows are read, never modified.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";

import { ProductStatus, Role } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/db/client";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/cookie";
import { createSession, revokeSession } from "../src/lib/services/session-service";

const BASE = (process.env.CHECK_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

const MARK = "zzzwishui";
const CUSTOMER_NUMBER = "+15550108901";

/** The widths Phase 7 fixed, with a realistic height for each class. */
const WIDTHS = [
  { width: 320, height: 800, label: "320 phone, smallest" },
  { width: 360, height: 800, label: "360 phone" },
  { width: 390, height: 844, label: "390 phone" },
  { width: 414, height: 896, label: "414 phone, large" },
  { width: 768, height: 1024, label: "768 tablet" },
  { width: 1024, height: 768, label: "1024 tablet landscape" },
  { width: 1280, height: 800, label: "1280 laptop" },
  { width: 1440, height: 900, label: "1440 desktop" },
  { width: 1920, height: 1080, label: "1920 wide" },
] as const;

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

/** One pixel of tolerance, for sub-pixel layout rounding. */
async function overflows(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - window.innerWidth);
  });
}

async function offscreenElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const limit = window.innerWidth + 1;

    for (const element of Array.from(document.body.querySelectorAll("*"))) {
      const box = element.getBoundingClientRect();

      if (box.width === 0 || box.height === 0) {
        continue;
      }

      if (box.right > limit) {
        const tag = element.tagName.toLowerCase();
        const cls = (element.getAttribute("class") ?? "").slice(0, 40);
        out.push(`${tag}.${cls} (right ${Math.round(box.right)} > ${limit})`);
      }

      if (out.length >= 3) {
        break;
      }
    }

    return out;
  });
}

/** Wishlist controls too small to hit reliably with a thumb. */
async function smallHearts(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const selector = "[data-wishlisted], a[aria-label*='Sign in to save']";

    for (const element of Array.from(document.querySelectorAll(selector))) {
      const box = element.getBoundingClientRect();

      if (box.width === 0 || box.height === 0) {
        continue;
      }

      if (box.height < 24 || box.width < 24) {
        out.push(
          `${element.getAttribute("aria-label")?.slice(0, 30)} ${Math.round(box.width)}x${Math.round(box.height)}`,
        );
      }
    }

    return out;
  });
}

/**
 * A listing that is guaranteed to contain one named piece.
 *
 * The shop grid is paged and merchandised, so "go to /shop and find this
 * product" is a coin toss on a catalogue of any size. Searching for the name
 * puts it on the first page by construction, and it is still the ordinary shop
 * listing rendering ordinary cards — which is the thing being tested.
 */
function listingFor(productName: string): string {
  return `${BASE}/shop?q=${encodeURIComponent(productName)}`;
}

/**
 * Is this on the page, given a moment to arrive?
 *
 * `isVisible()` answers immediately, which is a race against a streaming route:
 * `/wishlist` sends its shell first and fills the grid when the queries return,
 * so an immediate check can be asking before the answer exists. This waits, and
 * reports false only after it has actually been absent for the whole window.
 */
async function visible(
  locator: ReturnType<typeof cardHeart>,
  timeout = 20_000,
): Promise<boolean> {
  return locator
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

/**
 * The heart on a card, found by the product it belongs to.
 *
 * Scoped to the card rather than picked off the page, because a grid has one
 * per product and "the first heart" is whichever one the sort happened to put
 * first.
 */
function cardHeart(page: Page, productName: string) {
  return page
    .locator("article")
    .filter({ hasText: productName })
    .first()
    .locator("[data-wishlisted], a[aria-label*='Sign in to save']")
    .first();
}

/**
 * Click a control after putting it in the middle of the viewport.
 *
 * Playwright scrolls an element just far enough to be in view, which can leave
 * it under the sticky header — and then the header receives the click. Centring
 * it first is what a person does without thinking about it.
 */
async function clickCentred(locator: ReturnType<typeof cardHeart>) {
  await locator.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await locator.click();
}

/**
 * Wait until a heart reports the state given, or time out.
 *
 * Polled from Node rather than inside the page. Anything handed to `evaluate`
 * is compiled by tsx first, and esbuild's name-preservation rewrites a named
 * inner function into a call to a `__name` helper that does not exist in the
 * browser — so a polling loop written in page context throws
 * `__name is not defined` rather than polling.
 */
async function waitForHeart(
  locator: ReturnType<typeof cardHeart>,
  state: "true" | "false",
) {
  // Generous, because the write behind it goes to a database that may be on
  // another continent, and the suite should fail on behaviour rather than on
  // the weather. `pnpm check:ui` uses the same 45 seconds for the same reason.
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    // Both, not just the state. `aria-busy` stays true until the transition
    // React started has fully settled, which includes the route refresh the
    // action's `revalidatePath` queues. The control refuses a click while it is
    // busy, so a test that fires the next interaction the instant the heart
    // fills is pressing a control that is still working — exactly as a person
    // clicking through a spinner would be.
    const [saved, busy] = await Promise.all([
      locator.getAttribute("data-wishlisted"),
      locator.getAttribute("aria-busy"),
    ]);

    if (saved === state && busy === "false") {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`the heart never settled at ${state}`);
}

/* ------------------------------------------------------------------ *
 * Anonymous
 * ------------------------------------------------------------------ */

async function runAnonymousFlow(
  browser: Browser,
  product: { slug: string; name: string },
): Promise<void> {
  console.log("== anonymous, in the browser ==");

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/shop/${product.slug}`, {
    waitUntil: "domcontentloaded",
  });

  const heart = page
    .locator(`a[aria-label*="Sign in to save"]`)
    .filter({ hasNot: page.locator("nothing") })
    .first();

  check(
    "the heart on a product page is offered to a signed-out visitor",
    await heart.isVisible(),
  );
  check(
    "and its name says what it will do",
    (await heart.getAttribute("aria-label"))?.startsWith("Sign in to save") ===
      true,
    (await heart.getAttribute("aria-label")) ?? "",
  );

  await heart.click();
  await page.waitForURL(/\/login/, { timeout: 15_000 });

  const url = new URL(page.url());
  check("clicking it opens sign-in", url.pathname === "/login");
  check(
    "carrying the piece they were looking at as the return destination",
    url.searchParams.get("next") === `/shop/${product.slug}`,
    url.searchParams.get("next") ?? "(none)",
  );
  check(
    "and the sign-in form is there to use",
    await page.getByRole("button", { name: /send|continue|code/i }).first().isVisible(),
  );

  console.log("\n== an open redirect is refused ==");

  await page.goto(`${BASE}/login?next=https://evil.example.com/`, {
    waitUntil: "domcontentloaded",
  });
  const hiddenNext = await page
    .locator('input[name="next"]')
    .first()
    .inputValue()
    .catch(() => "");
  check(
    "an off-site next is dropped before it reaches the form",
    hiddenNext === "",
    hiddenNext,
  );

  await page.goto(`${BASE}/login?next=//evil.example.com`, {
    waitUntil: "domcontentloaded",
  });
  const hiddenNext2 = await page
    .locator('input[name="next"]')
    .first()
    .inputValue()
    .catch(() => "");
  check("a protocol-relative next is dropped too", hiddenNext2 === "", hiddenNext2);

  console.log("\n== the wishlist itself is private ==");

  await page.goto(`${BASE}/wishlist`, { waitUntil: "domcontentloaded" });
  check(
    "an anonymous visit lands on sign-in",
    new URL(page.url()).pathname === "/login",
    page.url(),
  );
  check(
    "with the wishlist as the return destination",
    new URL(page.url()).searchParams.get("next") === "/wishlist",
  );

  console.log("\n== but browsing still works signed out ==");

  for (const path of ["/", "/shop"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
    const hearts = await page.locator("a[aria-label*='Sign in to save']").count();
    check(
      `${path} renders normally, with sign-in hearts on the cards`,
      hearts > 0,
      `${hearts} hearts`,
    );
    check(
      `${path} has no interactive wishlist button for a signed-out visitor`,
      (await page.locator("[data-wishlisted]").count()) === 0,
    );
  }

  await context.close();
  console.log("");
}

/* ------------------------------------------------------------------ *
 * A signed-in customer
 * ------------------------------------------------------------------ */

async function signedInContext(
  browser: Browser,
  token: string,
  viewport = { width: 1280, height: 800 },
): Promise<BrowserContext> {
  const context = await browser.newContext({ viewport });

  await context.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  return context;
}

async function runCustomerFlow(
  page: Page,
  userId: string,
  product: { slug: string; name: string; id: string },
): Promise<void> {
  console.log("== a signed-in customer, on a product page ==");

  await page.goto(`${BASE}/shop/${product.slug}`, {
    waitUntil: "domcontentloaded",
  });

  const heart = page.locator("[data-wishlisted]").first();

  check("the heart is a real control now", await visible(heart));
  check(
    "it starts out not saved",
    (await heart.getAttribute("data-wishlisted")) === "false",
  );
  check(
    "and it says what it will do",
    (await heart.getAttribute("aria-label"))?.startsWith("Save ") === true,
    (await heart.getAttribute("aria-label")) ?? "",
  );
  check(
    "it reports its state to assistive technology",
    (await heart.getAttribute("aria-pressed")) === "false",
  );

  await heart.click();
  await waitForHeart(heart, "true");

  check("clicking it saves the piece", true);
  check(
    "the control now reports itself as pressed",
    (await heart.getAttribute("aria-pressed")) === "true",
  );
  check(
    "and its name changes to say what the next click does",
    (await heart.getAttribute("aria-label"))?.startsWith("Saved — remove") === true,
    (await heart.getAttribute("aria-label")) ?? "",
  );
  check(
    "the outcome is announced, not only shown",
    (await page.locator("[role=status]").filter({ hasText: "Added to your wishlist." }).count()) > 0,
  );
  check(
    "focus stays on the control that was used",
    await heart.evaluate((element) => element === document.activeElement),
  );

  check(
    "and the database holds exactly one row for it",
    (await prisma.wishlistItem.count({
      where: { wishlist: { userId }, productId: product.id },
    })) === 1,
  );

  console.log("\n== the state crosses pages ==");

  await page.goto(listingFor(product.name), { waitUntil: "domcontentloaded" });
  const gridHeart = cardHeart(page, product.name);
  check(
    "the same piece shows as saved on the shop grid",
    (await gridHeart.getAttribute("data-wishlisted")) === "true",
  );

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const homeHearts = await page.locator("[data-wishlisted]").count();
  check(
    "the home rails render interactive hearts for a signed-in customer",
    homeHearts > 0,
    `${homeHearts}`,
  );

  console.log("\n== the header count ==");

  const headerLabel = await page
    .getByRole("link", { name: /^Wishlist/ })
    .first()
    .getAttribute("aria-label");
  check(
    "the header names how many pieces are saved",
    headerLabel?.includes("1 piece saved") === true,
    headerLabel ?? "(none)",
  );
}

/* ------------------------------------------------------------------ *
 * Saving from a card, and the wishlist page
 * ------------------------------------------------------------------ */

async function runCardFlow(
  page: Page,
  userId: string,
  second: { name: string; id: string },
): Promise<void> {
  console.log("\n== saving from a product card ==");

  await page.goto(listingFor(second.name), { waitUntil: "domcontentloaded" });

  const heart = cardHeart(page, second.name);
  check(
    "a second piece starts out unsaved",
    (await heart.getAttribute("data-wishlisted")) === "false",
  );

  await clickCentred(heart);
  await waitForHeart(heart, "true");

  check("saving from the card works", true);
  check(
    "and wrote exactly one row",
    (await prisma.wishlistItem.count({
      where: { wishlist: { userId }, productId: second.id },
    })) === 1,
  );

  console.log("\n== removing from a card ==");

  await clickCentred(heart);
  await waitForHeart(heart, "false");

  check(
    "clicking a filled heart removes the piece",
    (await prisma.wishlistItem.count({
      where: { wishlist: { userId }, productId: second.id },
    })) === 0,
  );

  console.log("\n== clicking twice ==");

  // Back to a known state — unsaved — and then two clicks as fast as the
  // browser will send them. The first starts the write; the second arrives
  // while the control is busy and is refused, so only one request is made. What
  // is asserted is the row count either way, because the guarantee that matters
  // is the one in the database, not the one in the component.
  await clickCentred(heart);
  await heart.click({ force: true, noWaitAfter: true }).catch(() => undefined);
  await heart.click({ force: true, noWaitAfter: true }).catch(() => undefined);
  await waitForHeart(heart, "true");

  const afterDouble = await prisma.wishlistItem.count({
    where: { wishlist: { userId }, productId: second.id },
  });
  check(
    "three rapid clicks leave exactly one row, not three",
    afterDouble === 1,
    `${afterDouble} rows`,
  );
  check(
    "and the control shows the state the database actually holds",
    (await heart.getAttribute("data-wishlisted")) === "true",
  );
}

async function runWishlistPage(
  page: Page,
  userId: string,
  first: { name: string },
  second: { name: string },
): Promise<void> {
  console.log("\n== the wishlist page ==");

  await page.goto(`${BASE}/wishlist`, { waitUntil: "domcontentloaded" });

  check(
    "it opens for a signed-in customer",
    await visible(page.getByRole("heading", { name: "Wishlist", level: 1 })),
  );
  check(
    "there is a breadcrumb back to the shop",
    await page.getByRole("navigation", { name: /breadcrumb/i }).isVisible().catch(() => false),
  );
  check(
    "it says how many pieces are saved",
    await visible(page.getByText("2 pieces saved")),
  );

  const cards = page.locator("main article");
  check("both saved pieces are shown", (await cards.count()) === 2, `${await cards.count()}`);
  check(
    "the piece saved most recently comes first",
    (await cards.first().innerText()).includes(second.name),
    (await cards.first().innerText()).split("\n")[0] ?? "",
  );
  check(
    "every card on it is already showing as saved",
    (await page.locator("[data-wishlisted='true']").count()) === 2,
  );
  check(
    "a saved piece still links to its own page",
    (await page
      .locator("main article a[href*='/shop/']")
      .first()
      .getAttribute("href")) !== null,
  );

  console.log("\n== removing from the wishlist ==");

  const removeFirst = page
    .locator("main article")
    .filter({ hasText: first.name })
    .locator("[data-wishlisted]")
    .first();

  await clickCentred(removeFirst);

  // The card itself goes: the action revalidates `/wishlist`, the route
  // re-renders on the server without that item, and the row disappears. So what
  // to wait for is the list getting shorter, not the heart emptying — there is
  // no heart left to empty.
  await page.waitForFunction(
    () => document.querySelectorAll("main article").length === 1,
    undefined,
    { timeout: 30_000 },
  );

  check("the piece leaves the list without a refresh", true);
  check(
    "the row is gone from the database",
    (await prisma.wishlistItem.count({ where: { wishlist: { userId } } })) === 1,
  );

  await page.reload({ waitUntil: "domcontentloaded" });
  check(
    "and it is still gone after a refresh",
    (await page.locator("main article").count()) === 1,
  );
  check("the count follows", await visible(page.getByText("1 piece saved")));
  check(
    "the piece left behind is the other one",
    (await page.locator("main article").first().innerText()).includes(second.name),
  );

  console.log("\n== the empty state ==");

  const last = page.locator("main article [data-wishlisted]").first();
  await clickCentred(last);
  await page.waitForFunction(
    () => document.querySelectorAll("main article").length === 0,
    undefined,
    { timeout: 30_000 },
  );

  check(
    "removing the last piece shows the empty state",
    await visible(page.getByRole("heading", { name: "Your wishlist is waiting" })),
  );
  check(
    "which explains what the wishlist is for",
    await visible(page.getByText(/Save the pieces you keep coming back to/)),
  );

  const cta = page.getByRole("link", { name: "Explore the collection" });
  check("and offers a way back into the catalogue", await visible(cta));
  await cta.click();
  await page.waitForURL("**/shop", { timeout: 15_000 });
  check(
    "the call to action goes to a route that exists",
    new URL(page.url()).pathname === "/shop",
    page.url(),
  );
}

/* ------------------------------------------------------------------ *
 * Keyboard
 * ------------------------------------------------------------------ */

async function runKeyboardFlow(
  page: Page,
  userId: string,
  product: { slug: string; id: string },
): Promise<void> {
  console.log("\n== the keyboard ==");

  await page.goto(`${BASE}/shop/${product.slug}`, {
    waitUntil: "domcontentloaded",
  });

  const heart = page.locator("[data-wishlisted]").first();
  await heart.focus();

  check("the control can be focused", await heart.evaluate((el) => el === document.activeElement));

  const outlined = await heart.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return style.outlineStyle !== "none" || style.boxShadow !== "none";
  });
  check("and focus is visible when it is", outlined);

  await page.keyboard.press("Enter");
  await waitForHeart(heart, "true");
  check("Enter saves the piece", true);
  check(
    "focus is still on the control afterwards",
    await heart.evaluate((el) => el === document.activeElement),
  );

  await page.keyboard.press(" ");
  await waitForHeart(heart, "false");
  check("Space removes it again", true);
  check(
    "and the database agrees",
    (await prisma.wishlistItem.count({
      where: { wishlist: { userId }, productId: product.id },
    })) === 0,
  );
}

/* ------------------------------------------------------------------ *
 * Archiving, seen from the wishlist
 * ------------------------------------------------------------------ */

async function runArchiveFlow(
  page: Page,
  userId: string,
  testProductId: string,
  testProductName: string,
): Promise<void> {
  console.log("\n== a saved piece is archived ==");

  // Saved through the service rather than the interface: the point of this
  // section is what the page does afterwards.
  const wishlist = await prisma.wishlist.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  });
  await prisma.wishlistItem.upsert({
    where: {
      wishlistId_productId: { wishlistId: wishlist.id, productId: testProductId },
    },
    create: { wishlistId: wishlist.id, productId: testProductId },
    update: {},
    select: { id: true },
  });

  await page.goto(`${BASE}/wishlist`, { waitUntil: "domcontentloaded" });
  const card = page.locator("main article").filter({ hasText: testProductName });
  check("it is on the list while it is published", await visible(card));
  check(
    "and is presented as an ordinary piece",
    (await card.innerText()).includes("₹") ||
      (await card.locator("a[href*='/shop/']").count()) > 0,
  );

  await prisma.product.update({
    where: { id: testProductId },
    data: { status: ProductStatus.ARCHIVED },
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  const archivedCard = page.locator("main article").filter({ hasText: testProductName });

  check("after archiving it is still on the list", await visible(archivedCard));
  check(
    "the row was not silently deleted",
    (await prisma.wishlistItem.count({
      where: { wishlistId: wishlist.id, productId: testProductId },
    })) === 1,
  );
  check(
    "it says it is unavailable, in words",
    (await archivedCard.innerText()).includes("Currently unavailable"),
    (await archivedCard.innerText()).replace(/\n/g, " | ").slice(0, 80),
  );
  check(
    "it carries an Unavailable badge as well as the text",
    (await archivedCard.getByText("Unavailable").count()) > 0,
  );
  check(
    "it no longer links anywhere, since there is nothing to open",
    (await archivedCard.locator("a[href*='/shop/']").count()) === 0,
  );
  check(
    "the page says how many are unavailable",
    await visible(page.getByText(/1 is not available right now/)),
  );
  check(
    "the piece can still be removed from the list",
    (await archivedCard.locator("[data-wishlisted='true']").count()) === 1,
  );

  console.log("\n== and then republished ==");

  await prisma.product.update({
    where: { id: testProductId },
    data: { status: ProductStatus.ACTIVE, publishedAt: new Date() },
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  const restored = page.locator("main article").filter({ hasText: testProductName });

  check("it is available again without being re-saved", await visible(restored));
  check(
    "the unavailable wording is gone",
    !(await restored.innerText()).includes("Currently unavailable"),
  );
  check(
    "and it links to its page again",
    (await restored.locator("a[href*='/shop/']").count()) > 0,
  );
}

/* ------------------------------------------------------------------ *
 * Persistence
 * ------------------------------------------------------------------ */

async function runPersistenceFlow(
  browser: Browser,
  userId: string,
  testProductName: string,
): Promise<void> {
  console.log("\n== the same account, a second device ==");

  // A second session row for the same user: a different browser, on a different
  // machine, with nothing in common with the first but the account.
  const other = await createSession(userId);
  const context = await signedInContext(browser, other.token);
  const page = await context.newPage();

  await page.goto(`${BASE}/wishlist`, { waitUntil: "domcontentloaded" });

  check(
    "the saved piece is there in a browser that never saved it",
    await visible(
      page.locator("main article").filter({ hasText: testProductName }),
    ),
  );
  check(
    "which proves the list belongs to the account, not the browser",
    (await page.locator("main article").count()) > 0,
  );

  console.log("\n== signing out and back in ==");

  await revokeSession(other.token);
  await page.goto(`${BASE}/wishlist`, { waitUntil: "domcontentloaded" });

  // The proxy only looks at whether a cookie is present, so a revoked one gets
  // past it — that is by design, and documented there. `requireUser()` is what
  // actually refuses, and because the page streams, its redirect arrives as a
  // navigation rather than as a status code. So this waits for where the
  // browser ends up, which is what the person experiences.
  const landed = await page
    .waitForURL(/\/login/, { timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

  check(
    "a revoked session can no longer read the list",
    landed && new URL(page.url()).pathname === "/login",
    page.url(),
  );
  check(
    "and is asked to sign in again to get back to it",
    new URL(page.url()).searchParams.get("next") === "/wishlist",
    page.url(),
  );

  await context.close();

  const fresh = await createSession(userId);
  const freshContext = await signedInContext(browser, fresh.token);
  const freshPage = await freshContext.newPage();

  await freshPage.goto(`${BASE}/wishlist`, { waitUntil: "domcontentloaded" });
  check(
    "signing back in finds the list exactly as it was",
    await visible(
      freshPage.locator("main article").filter({ hasText: testProductName }),
    ),
  );

  await freshContext.close();
  await revokeSession(fresh.token);
}

/* ------------------------------------------------------------------ *
 * Responsive
 * ------------------------------------------------------------------ */

async function runResponsivePass(browser: Browser, token: string): Promise<void> {
  console.log("\n== nine widths ==");

  for (const { width, height, label } of WIDTHS) {
    const context = await signedInContext(browser, token, { width, height });
    const page = await context.newPage();

    let worst = 0;
    let worstPath = "";
    let offenders: string[] = [];
    let tiny: string[] = [];

    for (const path of ["/wishlist", "/shop", "/"]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(150);

      const overflow = await overflows(page);

      if (overflow > worst) {
        worst = overflow;
        worstPath = path;
        offenders = await offscreenElements(page);
      }

      const small = await smallHearts(page);
      if (small.length > 0) {
        tiny = [...tiny, `${path}: ${small.join(", ")}`];
      }
    }

    check(
      `${label}: no horizontal overflow`,
      worst === 0,
      worst > 0 ? `${worstPath} overflows by ${worst}px — ${offenders.join("; ")}` : "",
    );
    check(
      `${label}: every wishlist control is a usable tap target`,
      tiny.length === 0,
      tiny.join(" | "),
    );

    await context.close();
  }

  console.log("\n== the mobile drawer still reaches the wishlist ==");

  const context = await signedInContext(browser, token, { width: 390, height: 844 });
  const page = await context.newPage();

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /menu/i }).first().click();

  // Scoped to the drawer. The header also has a wishlist link, hidden at this
  // width but still in the document, and "the first link named Wishlist" would
  // be whichever the DOM order gave.
  const drawer = page.getByRole("dialog", { name: "Menu" });
  await drawer.waitFor({ state: "visible", timeout: 15_000 });
  const drawerLink = drawer.getByRole("link", { name: "Wishlist" }).first();
  check("the drawer offers the wishlist", await visible(drawerLink));
  await drawerLink.click();
  await page.waitForURL("**/wishlist", { timeout: 15_000 });
  check(
    "and it opens",
    new URL(page.url()).pathname === "/wishlist",
    page.url(),
  );
  check("with no sideways scroll on a phone", (await overflows(page)) === 0);

  await context.close();
}

/* ------------------------------------------------------------------ *
 * Clean-up
 * ------------------------------------------------------------------ */

async function cleanUp(token: string | undefined): Promise<void> {
  console.log("\n== clean-up ==");

  if (token) {
    await revokeSession(token).catch(() => undefined);
  }

  await prisma.user.deleteMany({ where: { phoneNumber: CUSTOMER_NUMBER } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: MARK } } });

  const [users, products, items] = await Promise.all([
    prisma.user.count({ where: { phoneNumber: CUSTOMER_NUMBER } }),
    prisma.product.count({ where: { slug: { startsWith: MARK } } }),
    prisma.wishlistItem.count({
      where: { wishlist: { user: { phoneNumber: CUSTOMER_NUMBER } } },
    }),
  ]);

  check("no test account left behind", users === 0);
  check("no test product left behind", products === 0);
  check("no wishlist rows left behind", items === 0);

  const seeded = await prisma.product.count();
  check("the seeded catalogue is intact", seeded === 26, String(seeded));
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("\n  Skipped: this needs DATABASE_URL to create a session.\n");
    return;
  }

  try {
    await fetch(`${BASE}/robots.txt`);
  } catch {
    console.log(
      [
        "",
        `  Skipped: nothing is answering at ${BASE}.`,
        "",
        "    pnpm build && pnpm start",
        "    pnpm check:wishlist:ui",
        "",
      ].join("\n"),
    );
    return;
  }

  let browser: Browser | undefined;
  let token: string | undefined;

  try {
    const customer = await prisma.user.upsert({
      where: { phoneNumber: CUSTOMER_NUMBER },
      create: { phoneNumber: CUSTOMER_NUMBER, role: Role.CUSTOMER },
      update: { role: Role.CUSTOMER },
      select: { id: true },
    });

    const session = await createSession(customer.id);
    token = session.token;

    // Two seeded pieces to drive the real flows with, and one of this script's
    // own to archive, so no published product is ever withdrawn by a test.
    const seeded = await prisma.product.findMany({
      where: { status: ProductStatus.ACTIVE },
      orderBy: { name: "asc" },
      take: 2,
      select: { id: true, slug: true, name: true },
    });

    const category = await prisma.category.findFirstOrThrow({ select: { id: true } });

    // An upsert rather than a create, keyed on the article number. If an
    // earlier run was killed between creating this and cleaning it up, a plain
    // create would fail on the unique constraint and the whole suite would
    // refuse to start over something it left behind itself.
    const testProduct = await prisma.product.upsert({
      where: { articleNumber: `PR-${MARK.toUpperCase()}-0001` },
      update: { status: ProductStatus.ACTIVE, publishedAt: new Date() },
      create: {
        articleNumber: `PR-${MARK.toUpperCase()}-0001`,
        name: `${MARK} Archive Fixture`,
        slug: `${MARK}-archive-fixture`,
        shortDescription: "A fixture, removed when the checks finish.",
        description: "A fixture, removed when the checks finish.",
        status: ProductStatus.ACTIVE,
        publishedAt: new Date(),
        price: 99900,
        fabric: "COTTON",
        pattern: "SOLID",
        fit: "REGULAR",
        occasion: "EVERYDAY",
        careInstructions: "Machine wash cold.",
        primaryCategoryId: category.id,
      },
      select: { id: true, name: true },
    });

    browser = await chromium.launch();
    console.log(`\nChromium ${browser.version()} against ${BASE}\n`);

    await runAnonymousFlow(browser, seeded[0]!);

    const context = await signedInContext(browser, session.token);
    const page = await context.newPage();

    await runCustomerFlow(page, customer.id, seeded[0]!);
    await runCardFlow(page, customer.id, seeded[1]!);
    await runWishlistPage(page, customer.id, seeded[0]!, seeded[1]!);
    await runKeyboardFlow(page, customer.id, seeded[0]!);

    // Leave the list empty before the archive section, so its counts are its
    // own rather than whatever the earlier flows left behind.
    await prisma.wishlistItem.deleteMany({
      where: { wishlist: { userId: customer.id } },
    });

    await runArchiveFlow(page, customer.id, testProduct.id, testProduct.name);
    await context.close();

    await runPersistenceFlow(browser, customer.id, testProduct.name);
    await runResponsivePass(browser, session.token);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }

    await cleanUp(token);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect().catch(() => undefined);

    if (passed + failed > 0) {
      console.log(
        `\n${failed === 0 ? "OK" : "FAILED"}: ${passed} passed, ${failed} failed\n`,
      );
    }

    if (failed > 0) {
      process.exitCode = 1;
    }
  })
  .catch(async (error: unknown) => {
    await prisma.$disconnect().catch(() => undefined);
    console.error(
      `Wishlist browser checks failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
