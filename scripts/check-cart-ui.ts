/**
 * The bag, in a real browser.
 *
 * Run with `pnpm check:cart:ui` while the application is running. Point it
 * elsewhere with `CHECK_BASE_URL=http://localhost:3100`.
 *
 * It reuses the Phase 7 setup exactly — the same `playwright` dependency, the
 * same headless Chromium, real `Session` rows handed over in the real session
 * cookie — so what this drives is what a shopper drives. No second
 * browser-testing system is introduced.
 *
 * What it covers, in order:
 *
 * - **A guest.** Product page, colour, size, add to bag, the badge, the drawer,
 *   quantity up and down, remove, and the bag surviving a reload — all with no
 *   account anywhere.
 * - **Two guests.** Separate browser contexts, separate cookie jars, separate
 *   bags.
 * - **The merge.** A guest fills a bag, an account already has one, they sign in,
 *   and the two become one with the right quantities.
 * - **Product cards.** The quick-add on a card, in both of the shapes it takes.
 * - **Archiving.** A piece withdrawn while it sits in a bag, and republished.
 * - **Responsive.** Nine widths, checked for sideways scroll and thumb-sized
 *   controls.
 * - **Accessible.** Names on every control, the drawer's focus behaviour, the
 *   Escape key, focus restoration, and whether outcomes are announced.
 *
 * **It writes.** One reserved test account and one product marked `zzzcartui`,
 * both removed in a `finally` including on failure. Seeded rows are read, never
 * modified. The account's number is a valid Indian mobile rather than the
 * `+1555…` block the other suites reserve — see `CUSTOMER_NUMBER` for why that
 * difference is load-bearing.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { chromium, type Browser, type Locator, type Page } from "playwright";

import { ProductStatus, Role } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/db/client";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/cookie";
import { CART_COOKIE_NAME } from "../src/lib/cart/cookie";
import { addToCart } from "../src/lib/services/cart-service";
import { createSession, revokeSession } from "../src/lib/services/session-service";

const BASE = (process.env.CHECK_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

const MARK = "zzzcartui";

/**
 * The account this suite signs in as.
 *
 * Deliberately **not** in the `+1555…` range every other suite reserves. That
 * range is the NANP's fictional block, and `libphonenumber-js` correctly
 * refuses it as not a possible number — so the sign-in form rejects it at the
 * first field and no code is ever requested. Excellent for fixtures that must
 * never collide with a real account; useless for driving the real form.
 *
 * This is a valid Indian mobile in an obviously-synthetic pattern, so the merge
 * can be exercised through the actual sign-in flow. Clean-up deletes it by
 * exact match, never by a pattern, exactly as the other suites do.
 */
const CUSTOMER_NUMBER = "+918888800001";

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

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

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

/** Bag controls too small to hit reliably with a thumb. */
async function smallCartControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const selector =
      "[aria-label*='quantity' i], [aria-label*='bag' i], [data-add-to-bag]";

    for (const element of Array.from(document.querySelectorAll(selector))) {
      const box = element.getBoundingClientRect();

      if (box.width === 0 || box.height === 0) {
        continue;
      }

      if (box.height < 24 || box.width < 24) {
        out.push(
          `${element.getAttribute("aria-label")?.slice(0, 32)} ${Math.round(box.width)}x${Math.round(box.height)}`,
        );
      }
    }

    return out;
  });
}

/**
 * The number on the bag badge, read from the trigger's own attribute.
 *
 * Read from `data-cart-count` rather than from the visible text, so a change of
 * wording does not quietly turn these checks into nothing. Returns 0 when there
 * is no badge, which is what an empty bag renders.
 */
async function badgeCount(page: Page): Promise<number> {
  const badge = page.locator("[data-cart-count]").first();

  if ((await badge.count()) === 0) {
    return 0;
  }

  return Number(await badge.getAttribute("data-cart-count"));
}

/**
 * Wait for the badge to reach a number, or time out.
 *
 * Polled from Node rather than inside the page: anything handed to `evaluate` is
 * compiled by tsx first, and esbuild's name preservation rewrites a named inner
 * function into a call to a `__name` helper that does not exist in a browser.
 *
 * Generous, because the write behind it goes to a database that may be on
 * another continent and the suite should fail on behaviour rather than on the
 * weather.
 */
async function waitForBadge(page: Page, expected: number): Promise<boolean> {
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    if ((await badgeCount(page)) === expected) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return false;
}

/** Click a control after centring it, so the sticky header cannot take the hit. */
async function clickCentred(locator: Locator): Promise<void> {
  await locator.evaluate((element) =>
    element.scrollIntoView({ block: "center", behavior: "instant" }),
  );
  await locator.click();
}

/** Open the bag drawer and wait for it. */
async function openDrawer(page: Page) {
  await page.getByRole("button", { name: /^Bag/ }).first().click();
  const drawer = page.getByRole("dialog", { name: "Your bag" });
  await drawer.waitFor({ state: "visible", timeout: 15_000 });
  return drawer;
}

async function visible(locator: Locator, timeout = 20_000): Promise<boolean> {
  return locator
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

/** A note about how the run went, distinct from a pass or a fail. */
function log(message: string): void {
  console.log(`  note: ${message}`);
}

/**
 * Sign in through the real form, so the real `loginAction` runs — or report
 * that this build will not allow it.
 *
 * The code is not guessable, so it is recovered from the challenge row the way
 * `check:auth:db` does: by hashing all million candidates against the stored
 * HMAC until one matches. That is only possible because the secret is the
 * local one; it is a test recovering its own code, not a weakness in the
 * scheme.
 *
 * Returns false rather than throwing when the code stage never appears, which
 * is what happens on a production build where the console transport is
 * disabled. The caller then replays `loginAction` instead and says so.
 */
async function signInThroughTheForm(
  page: Page,
  customerId: string,
): Promise<boolean> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: customerId },
    select: { phoneNumber: true },
  });

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Mobile number").fill(user.phoneNumber);
  await page.getByRole("button", { name: "Send code" }).click();

  const codeField = page.locator("input[name='code']").first();

  // Short: on a production build the transport refuses immediately and the
  // form shows an error, so there is nothing to wait for.
  if (!(await visible(codeField, 15_000))) {
    return false;
  }

  const challenge = await prisma.otpChallenge.findFirst({
    where: { phoneNumber: user.phoneNumber, consumedAt: null },
    orderBy: { createdAt: "desc" },
    select: { codeHash: true },
  });

  if (!challenge) {
    log("the code stage appeared but no challenge row was written");
    return false;
  }

  const { hashOtpCode } = await import("../src/lib/auth/otp-code");

  let code: string | undefined;
  for (let candidate = 0; candidate < 1_000_000; candidate += 1) {
    const padded = String(candidate).padStart(6, "0");

    if (hashOtpCode(user.phoneNumber, padded) === challenge.codeHash) {
      code = padded;
      break;
    }
  }

  if (!code) {
    log("the code could not be recovered from its hash");
    return false;
  }

  await codeField.fill(code);
  await page.getByRole("button", { name: "Verify and continue" }).click();

  const left = await page
    .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);

  if (!left) {
    log("the code was accepted but the browser never left /login");
    return false;
  }

  // The merge happens inside the action, before the redirect resolves. Give the
  // route refresh a moment to land before anything is asserted about the bag.
  await page.waitForLoadState("networkidle").catch(() => undefined);

  return true;
}

/* ------------------------------------------------------------------ *
 * A guest
 * ------------------------------------------------------------------ */

async function runGuestFlow(
  browser: Browser,
  product: { slug: string; name: string },
): Promise<void> {
  console.log("== a guest, with no account anywhere ==");

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/shop/${product.slug}`, {
    waitUntil: "domcontentloaded",
  });

  check("the bag starts empty", (await badgeCount(page)) === 0);

  const button = page.locator("[data-add-to-bag]").first();
  check("the add-to-bag control is there", await visible(button));
  check(
    "and says a size is needed before it can do anything",
    (await button.getAttribute("data-add-to-bag")) === "blocked",
    (await button.textContent())?.trim() ?? "",
  );

  // Choosing a size is what turns a colour and a size into a variant.
  const sizes = page.locator("input[name^='size-']:not([disabled])");
  await sizes.first().click({ force: true });

  check(
    "choosing a size makes it ready",
    (await button.getAttribute("data-add-to-bag")) === "ready",
  );
  check(
    "and its accessible name says what it will do",
    (await button.getAttribute("aria-label"))?.startsWith("Add ") === true,
    (await button.getAttribute("aria-label")) ?? "",
  );

  await clickCentred(button);
  check("adding puts one garment in the bag", await waitForBadge(page, 1));
  check(
    "the outcome is announced, not only shown",
    (await page
      .locator("[role=status]")
      .filter({ hasText: "Added to your bag." })
      .count()) > 0,
  );

  // No account, no sign-in, and a real row behind it.
  const cookies = await context.cookies();
  const cartCookie = cookies.find((cookie) => cookie.name === CART_COOKIE_NAME);

  check("a guest bag cookie was issued", cartCookie !== undefined);
  check("it is HttpOnly", cartCookie?.httpOnly === true);
  check("it is SameSite=Lax", cartCookie?.sameSite === "Lax");
  check("it is scoped to the whole site", cartCookie?.path === "/");
  check(
    "it is long-lived rather than a session cookie",
    (cartCookie?.expires ?? 0) > Date.now() / 1000 + 86_400,
  );
  check(
    "it carries an opaque token, not a bag id or a price",
    /^[A-Za-z0-9_-]{43}$/.test(cartCookie?.value ?? ""),
  );
  check(
    "no session cookie was created, because a bag needs no account",
    !cookies.some((cookie) => cookie.name === SESSION_COOKIE_NAME),
  );

  console.log("\n== the drawer ==");

  const drawer = await openDrawer(page);
  check("it opens", await visible(drawer));
  check(
    "and shows the piece that was added",
    (await drawer.innerText()).includes(product.name),
  );
  check(
    "with a subtotal",
    (await drawer.innerText()).includes("Subtotal"),
  );

  console.log("\n== quantity, in the drawer ==");

  const increase = drawer.getByRole("button", { name: /^Increase quantity/ });
  const decrease = drawer.getByRole("button", { name: /^Decrease quantity/ });

  check(
    "the increase control names the piece it acts on",
    (await increase.getAttribute("aria-label"))?.includes(product.name) === true,
    (await increase.getAttribute("aria-label")) ?? "",
  );
  check(
    "decreasing is refused at one rather than silently removing",
    (await decrease.getAttribute("aria-disabled")) === "true",
  );

  await increase.click();
  check("increasing updates the badge", await waitForBadge(page, 2));

  await page.getByRole("button", { name: /^Decrease quantity/ }).click();
  check("decreasing updates it too", await waitForBadge(page, 1));

  console.log("\n== the bag page ==");

  await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });

  check(
    "it opens",
    await visible(page.getByRole("heading", { name: "Your bag", level: 1 })),
  );
  check(
    "and lists the piece",
    (await page.locator("main").innerText()).includes(product.name),
  );
  check(
    "with a summary",
    await visible(page.getByRole("heading", { name: "Summary" })),
  );
  check(
    "checkout is present but honestly unavailable",
    (await page
      .getByRole("button", { name: "Proceed to checkout" })
      .getAttribute("aria-disabled")) === "true",
  );
  check(
    "and says when it opens",
    (await page.locator("main").innerText()).includes(
      "Checkout and payment open in a later release",
    ),
  );

  console.log("\n== it survives a reload ==");

  await page.reload({ waitUntil: "domcontentloaded" });
  check("the bag is still there", (await badgeCount(page)) === 1);
  check(
    "with the same piece in it",
    (await page.locator("main").innerText()).includes(product.name),
  );

  console.log("\n== removing ==");

  await page.getByRole("button", { name: /^Remove/ }).first().click();
  check("the badge empties", await waitForBadge(page, 0));

  await page.reload({ waitUntil: "domcontentloaded" });
  check(
    "and the empty state appears",
    await visible(page.getByRole("heading", { name: "Your bag is empty" })),
  );
  check(
    "which offers a way back into the catalogue",
    await visible(page.getByRole("link", { name: "Explore the collection" })),
  );

  console.log("\n== emptying the bag ==");

  // Two pieces back in, so "empty the bag" has something to do that removing
  // one line would not.
  await addFromProductPage(page, product.slug);
  await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });

  const emptyBag = page.getByRole("button", { name: "Empty bag" });
  check("the bag page offers to empty itself", await visible(emptyBag));

  await clickCentred(emptyBag);

  // One press asks; it does not empty. That is the point of the control.
  check(
    "one press asks for confirmation rather than emptying",
    await visible(page.getByRole("button", { name: /are you sure/i })),
  );
  check(
    "and offers a way out",
    await visible(page.getByRole("button", { name: "Keep it" })),
  );
  check(
    "nothing has been removed yet",
    (await badgeCount(page)) > 0,
    String(await badgeCount(page)),
  );

  await page.getByRole("button", { name: "Keep it" }).click();
  check(
    "backing out leaves the bag alone",
    (await badgeCount(page)) > 0 &&
      (await visible(page.getByRole("button", { name: "Empty bag" }))),
  );

  await clickCentred(page.getByRole("button", { name: "Empty bag" }));
  await clickCentred(page.getByRole("button", { name: /are you sure/i }));

  check("confirming empties the bag", await waitForBadge(page, 0));

  await page.reload({ waitUntil: "domcontentloaded" });
  check(
    "and the empty state is what is left",
    await visible(page.getByRole("heading", { name: "Your bag is empty" })),
  );
  // Scoped to this browser's own bag, read back through the same token the
  // cookie carries. A count across every guest bag would also count the ones
  // other sections leave behind and pass for the wrong reason.
  const { hashGuestToken } = await import("../src/lib/cart/ownership");
  const ownToken = (await context.cookies()).find(
    (cookie) => cookie.name === CART_COOKIE_NAME,
  )?.value;

  check(
    "with nothing left in this browser's bag in the database either",
    ownToken !== undefined &&
      (await prisma.cartItem.count({
        where: { cart: { guestTokenHash: hashGuestToken(ownToken) } },
      })) === 0,
  );
  check(
    "though the bag row itself survives, ready for the next add",
    ownToken !== undefined &&
      (await prisma.cart.count({
        where: { guestTokenHash: hashGuestToken(ownToken) },
      })) === 1,
  );

  await context.close();
  console.log("");
}

/* ------------------------------------------------------------------ *
 * Two guests
 * ------------------------------------------------------------------ */

async function runGuestIsolation(
  browser: Browser,
  first: { slug: string; name: string },
  second: { slug: string; name: string },
): Promise<void> {
  console.log("== two anonymous browsers ==");

  const contexts = await Promise.all([
    browser.newContext({ viewport: { width: 1280, height: 900 } }),
    browser.newContext({ viewport: { width: 1280, height: 900 } }),
  ]);

  const [pageA, pageB] = await Promise.all(
    contexts.map((context) => context.newPage()),
  );

  await addFromProductPage(pageA!, first.slug);
  await addFromProductPage(pageB!, second.slug);

  check("each browser has one garment", (await badgeCount(pageA!)) === 1);
  check("and so does the other", (await badgeCount(pageB!)) === 1);

  await pageA!.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });
  await pageB!.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });

  const bagA = await pageA!.locator("main").innerText();
  const bagB = await pageB!.locator("main").innerText();

  check("the first sees its own piece", bagA.includes(first.name));
  check("and not the other's", !bagA.includes(second.name));
  check("the second sees its own", bagB.includes(second.name));
  check("and not the first's", !bagB.includes(first.name));

  const [cookiesA, cookiesB] = await Promise.all(
    contexts.map((context) => context.cookies()),
  );
  const tokenA = cookiesA.find((c) => c.name === CART_COOKIE_NAME)?.value;
  const tokenB = cookiesB.find((c) => c.name === CART_COOKIE_NAME)?.value;

  check(
    "they hold different tokens, so there is no shared guest bag",
    Boolean(tokenA) && Boolean(tokenB) && tokenA !== tokenB,
  );

  await Promise.all(contexts.map((context) => context.close()));
  console.log("");
}

/** Open a product, choose the first available size, add it. */
async function addFromProductPage(page: Page, slug: string): Promise<void> {
  await page.goto(`${BASE}/shop/${slug}`, { waitUntil: "domcontentloaded" });
  await page.locator("input[name^='size-']:not([disabled])").first().click({
    force: true,
  });
  await clickCentred(page.locator("[data-add-to-bag]").first());
  await waitForBadge(page, (await badgeCount(page)) + 1).catch(() => undefined);
  await page.waitForTimeout(800);
}

/* ------------------------------------------------------------------ *
 * The merge
 * ------------------------------------------------------------------ */

async function runMergeFlow(
  browser: Browser,
  customerId: string,
  guestPiece: { slug: string; name: string },
  accountPiece: { id: string; name: string },
): Promise<void> {
  console.log("== a guest fills a bag, then signs in ==");

  // The account already has something in it, which is the case that matters:
  // a merge that only works into an empty bag is not a merge.
  await addToCart({ kind: "user", userId: customerId }, accountPiece.id, 1);

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await addFromProductPage(page, guestPiece.slug);
  check("the guest bag has a garment in it", (await badgeCount(page)) === 1);

  const guestToken = (await context.cookies()).find(
    (cookie) => cookie.name === CART_COOKIE_NAME,
  )?.value;

  check("the browser is carrying a guest token to merge", Boolean(guestToken));

  const { hashGuestToken } = await import("../src/lib/cart/ownership");
  const { mergeGuestCart } = await import("../src/lib/services/cart-service");

  // Sign in for real if this build will let us.
  //
  // Two things decide whether it will. The console OTP transport refuses to run
  // when NODE_ENV is production — by design, so a sign-in code can never reach
  // a production log — and `pnpm start` sets exactly that. And the number has
  // to be one `libphonenumber-js` considers possible, which is why this suite
  // uses a valid Indian mobile rather than the `+1555…` block the others
  // reserve. Against a development server, with a valid number, the form can be
  // driven all the way through, and then the merge under test is the one
  // `loginAction` performs rather than one this script called.
  //
  // So: try the form. If the code stage appears, that is the real path and it
  // is used. If it does not, fall back to replaying what `loginAction` does in
  // the same order, and say so, because a suite that silently degrades is worse
  // than one that reports which path it took.
  const realSignIn = await signInThroughTheForm(page, customerId);

  if (realSignIn) {
    check("the sign-in form was driven end to end, code and all", true);
    check(
      "and the merge ran inside loginAction, not from this script",
      (await prisma.cart.count({
        where: { guestTokenHash: hashGuestToken(guestToken!) },
      })) === 0,
    );
  } else {
    log(
      "the OTP form could not be driven on this build — replaying loginAction instead",
    );

    const session = await createSession(customerId);
    const outcome = await mergeGuestCart(customerId, hashGuestToken(guestToken!));

    check("the merge reports that it found a guest bag", outcome.hadGuestCart);

    await context.clearCookies({ name: CART_COOKIE_NAME });
    await context.addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: session.token,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }

  check(
    "the guest cookie is gone either way",
    !(await context.cookies()).some(
      (cookie) => cookie.name === CART_COOKIE_NAME,
    ),
  );

  await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });
  const bag = await page.locator("main").innerText();

  check("the guest's piece survived the sign-in", bag.includes(guestPiece.name));
  check("and the account's piece is still there", bag.includes(accountPiece.name));
  check("two garments in total", (await badgeCount(page)) === 2, String(await badgeCount(page)));

  check(
    // Scoped to the token that was merged. Counting every guest bag with items
    // would also count the two the isolation section left behind earlier in
    // this same run, and fail for a reason that has nothing to do with merging.
    "the guest bag row is gone, as the merge's own transaction deleted it",
    (await prisma.cart.count({
      where: { guestTokenHash: hashGuestToken(guestToken!) },
    })) === 0,
  );

  console.log("\n== and it is the same bag on another device ==");

  const second = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const secondSession = await createSession(customerId);
  await second.addCookies([
    {
      name: SESSION_COOKIE_NAME,
      value: secondSession.token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  const secondPage = await second.newPage();
  await secondPage.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });

  check(
    "a browser that never added anything sees the account's bag",
    (await badgeCount(secondPage)) === 2,
    String(await badgeCount(secondPage)),
  );
  check(
    "with both pieces in it",
    (await secondPage.locator("main").innerText()).includes(guestPiece.name),
  );

  await second.close();
  await revokeSession(secondSession.token);

  console.log("\n== signing out ==");

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  const signOut = page.getByRole("button", { name: /sign out/i }).first();

  if ((await signOut.count()) > 0) {
    await page.getByRole("button", { name: "Account menu" }).first().click();
    await page.getByRole("button", { name: /sign out/i }).first().click();
    await page.waitForLoadState("networkidle").catch(() => undefined);
  } else {
    await context.clearCookies({ name: SESSION_COOKIE_NAME });
    await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });
  }

  await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });

  check(
    "the anonymous browser cannot see the account's bag",
    (await badgeCount(page)) === 0,
    String(await badgeCount(page)),
  );
  check(
    "and is shown an empty one",
    (await page.locator("main").innerText()).includes("Your bag is empty"),
  );
  check(
    "while the account's bag is untouched in the database",
    (await prisma.cartItem.count({ where: { cart: { userId: customerId } } })) === 2,
  );

  await context.close();
  console.log("");
}

/* ------------------------------------------------------------------ *
 * Product cards
 * ------------------------------------------------------------------ */

async function runProductCardFlow(browser: Browser): Promise<void> {
  console.log("== the quick-add on a product card ==");

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/shop`, { waitUntil: "domcontentloaded" });

  const card = page.locator("article").first();
  await card.hover();

  const chooseSize = card.getByRole("link", { name: /^Choose a size/ });
  const quickAdd = card.locator("[data-add-to-bag]");

  const hasChoose = (await chooseSize.count()) > 0;
  const hasAdd = (await quickAdd.count()) > 0;

  check("a card offers exactly one of the two behaviours", hasChoose !== hasAdd);

  if (hasChoose) {
    check(
      "a piece with a choice to make sends the shopper to make it",
      (await chooseSize.getAttribute("aria-label"))?.startsWith(
        "Choose a size for",
      ) === true,
    );

    await chooseSize.click();
    await page.waitForURL(/\/shop\/[a-z0-9-]+$/, { timeout: 15_000 });
    check(
      "and lands on the product page, where the controls are",
      /\/shop\/[a-z0-9-]+$/.test(new URL(page.url()).pathname),
      page.url(),
    );
    check(
      "which has the size controls on it",
      (await page.locator("input[name^='size-']").count()) > 0,
    );
  } else {
    check("a piece with one combination adds straight from the card", true);
    await clickCentred(quickAdd);
    check("and the badge moves", await waitForBadge(page, 1));
  }

  console.log("\n== no card guesses a variant ==");

  await page.goto(`${BASE}/shop`, { waitUntil: "domcontentloaded" });

  // Every card must resolve to one of the two behaviours, and a card offering a
  // direct add must be for a product with exactly one variant. That is the rule
  // the mapper enforces; this is the check that it held for the whole grid.
  const cards = page.locator("article");
  const total = await cards.count();
  let direct = 0;
  let choose = 0;

  for (let index = 0; index < total; index += 1) {
    const current = cards.nth(index);
    direct += await current.locator("[data-add-to-bag]").count();
    choose += await current.getByRole("link", { name: /^Choose a size/ }).count();
  }

  check(
    "every card on the grid offers one behaviour or the other",
    direct + choose === total,
    `${direct} direct, ${choose} choose, ${total} cards`,
  );

  await context.close();
  console.log("");
}

/* ------------------------------------------------------------------ *
 * Archiving
 * ------------------------------------------------------------------ */

async function runArchiveFlow(
  browser: Browser,
  variantId: string,
  productId: string,
  productName: string,
): Promise<void> {
  console.log("== a piece is withdrawn while it sits in a bag ==");

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  // Seed a guest bag directly, then hand the browser the matching cookie. The
  // add path is covered above; this section is about what the page does after.
  const { mintGuestToken, hashGuestToken } = await import(
    "../src/lib/cart/ownership"
  );
  const token = mintGuestToken();

  await addToCart({ kind: "guest", tokenHash: hashGuestToken(token) }, variantId, 1);
  await context.addCookies([
    {
      name: CART_COOKIE_NAME,
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });
  check(
    "it is in the bag while it is published",
    (await page.locator("main").innerText()).includes(productName),
  );
  check("and counted", (await badgeCount(page)) === 1);

  await prisma.product.update({
    where: { id: productId },
    data: { status: ProductStatus.ARCHIVED },
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  const archived = await page.locator("main").innerText();

  check("after archiving it is still listed", archived.includes(productName));
  check(
    "and says so in words",
    archived.includes("Currently unavailable"),
    archived.replace(/\n/g, " | ").slice(0, 120),
  );
  check(
    "the page explains what that means for the subtotal",
    archived.includes("not counted in the subtotal"),
  );
  check("it drops out of the badge", (await badgeCount(page)) === 0);
  check(
    "the row was not silently deleted",
    (await prisma.cartItem.count({ where: { variantId } })) === 1,
  );
  check(
    "it can still be removed by hand",
    (await page.getByRole("button", { name: /^Remove/ }).count()) > 0,
  );

  console.log("\n== and then republished ==");

  await prisma.product.update({
    where: { id: productId },
    data: { status: ProductStatus.ACTIVE, publishedAt: new Date() },
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  const restored = await page.locator("main").innerText();

  check("it is ordinary again, with nothing re-added", !restored.includes("Currently unavailable"));
  check("and back in the badge", (await badgeCount(page)) === 1);

  console.log("\n== and when it sells out ==");

  await prisma.inventory.update({
    where: { variantId },
    data: { quantity: 0 },
  });

  await page.reload({ waitUntil: "domcontentloaded" });
  check(
    "a sold-out line says so",
    (await page.locator("main").innerText()).includes("sold out"),
  );

  await prisma.inventory.update({
    where: { variantId },
    data: { quantity: 5 },
  });

  await context.close();
  console.log("");
}

/* ------------------------------------------------------------------ *
 * Accessibility
 * ------------------------------------------------------------------ */

async function runAccessibilityFlow(
  browser: Browser,
  variantId: string,
  productName: string,
): Promise<void> {
  console.log("== the drawer, by keyboard ==");

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  const { mintGuestToken, hashGuestToken } = await import(
    "../src/lib/cart/ownership"
  );
  const token = mintGuestToken();

  await addToCart({ kind: "guest", tokenHash: hashGuestToken(token) }, variantId, 2);
  await context.addCookies([
    {
      name: CART_COOKIE_NAME,
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });

  const trigger = page.getByRole("button", { name: /^Bag/ }).first();
  check(
    "the bag button says how many are in it, not only the badge",
    (await trigger.getAttribute("aria-label"))?.includes("2 items") === true,
    (await trigger.getAttribute("aria-label")) ?? "",
  );
  check(
    "and reports whether the panel is open",
    (await trigger.getAttribute("aria-expanded")) === "false",
  );

  await trigger.focus();
  await page.keyboard.press("Enter");

  const drawer = page.getByRole("dialog", { name: "Your bag" });
  check("Enter opens it", await visible(drawer));
  check(
    "it is a modal dialog with a name",
    (await drawer.getAttribute("aria-modal")) === "true",
  );
  check(
    "focus moves into it, onto the close button",
    await page
      .getByRole("button", { name: /close your bag/i })
      .evaluate((element) => element === document.activeElement)
      .catch(() => false),
  );
  check(
    "the page behind is inert, so nothing outside can be reached",
    await page.evaluate(() =>
      Array.from(document.body.children).some((element) =>
        element.hasAttribute("inert"),
      ),
    ),
  );

  await page.keyboard.press("Escape");
  check(
    "Escape closes it",
    await drawer
      .waitFor({ state: "hidden", timeout: 10_000 })
      .then(() => true)
      .catch(() => false),
  );
  check(
    "and focus goes back to the button that opened it",
    await trigger.evaluate((element) => element === document.activeElement),
  );

  console.log("\n== the controls name what they act on ==");

  await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });

  const names = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        "button[aria-label], [role=group][aria-label]",
      ),
    ).map((element) => element.getAttribute("aria-label") ?? ""),
  );

  check(
    "the quantity group is named for its piece",
    names.some((name) => name.startsWith("Quantity for ")),
    names.join(" | ").slice(0, 120),
  );
  check(
    "increase names its piece",
    names.some((name) => name.startsWith("Increase quantity for ")),
  );
  check(
    "decrease names its piece",
    names.some((name) => name.startsWith("Decrease quantity for ")),
  );
  check(
    "remove names its piece",
    names.some(
      (name) => name.startsWith("Remove ") && name.includes(productName),
    ),
    names.find((name) => name.startsWith("Remove ")) ?? "",
  );

  check(
    "the quantity is text, not only the shape of a control",
    (await page.locator("[role=group] >> text=Quantity:").count()) > 0 ||
      (await page.getByText(/Quantity:/).count()) > 0,
  );

  console.log("\n== outcomes are announced ==");

  const before = await badgeCount(page);
  await page.getByRole("button", { name: /^Increase quantity/ }).first().click();
  check("the badge follows the server", await waitForBadge(page, before + 1));
  check(
    "and the outcome reaches a live region",
    (await page.locator("[role=status][aria-live=polite]").count()) > 0,
  );

  await context.close();
  console.log("");
}

/* ------------------------------------------------------------------ *
 * Responsive
 * ------------------------------------------------------------------ */

async function runResponsivePass(
  browser: Browser,
  variantId: string,
  slug: string,
): Promise<void> {
  console.log("== nine widths ==");

  const { mintGuestToken, hashGuestToken } = await import(
    "../src/lib/cart/ownership"
  );

  for (const { width, height, label } of WIDTHS) {
    const token = mintGuestToken();
    await addToCart(
      { kind: "guest", tokenHash: hashGuestToken(token) },
      variantId,
      2,
    );

    const context = await browser.newContext({ viewport: { width, height } });
    await context.addCookies([
      {
        name: CART_COOKIE_NAME,
        value: token,
        domain: "localhost",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    const page = await context.newPage();

    let worst = 0;
    let worstPath = "";
    let offenders: string[] = [];
    let tiny: string[] = [];

    for (const path of ["/cart", `/shop/${slug}`, "/shop"]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(150);

      const overflow = await overflows(page);

      if (overflow > worst) {
        worst = overflow;
        worstPath = path;
        offenders = await offscreenElements(page);
      }

      const small = await smallCartControls(page);
      if (small.length > 0) {
        tiny = [...tiny, `${path}: ${small.join(", ")}`];
      }
    }

    // The drawer, open, at this width. It is fixed-position and full-height, so
    // it is the most likely thing to push a phone sideways.
    await page.goto(`${BASE}/cart`, { waitUntil: "domcontentloaded" });
    await openDrawer(page).catch(() => undefined);
    await page.waitForTimeout(150);

    const drawerOverflow = await overflows(page);

    check(
      `${label}: no horizontal overflow`,
      worst === 0 && drawerOverflow === 0,
      worst > 0
        ? `${worstPath} overflows by ${worst}px — ${offenders.join("; ")}`
        : drawerOverflow > 0
          ? `the open drawer overflows by ${drawerOverflow}px`
          : "",
    );
    check(
      `${label}: every bag control is a usable tap target`,
      tiny.length === 0,
      tiny.join(" | "),
    );

    await context.close();
  }

  console.log("");
}

/* ------------------------------------------------------------------ *
 * Clean-up
 * ------------------------------------------------------------------ */

async function cleanUp(startedAt: Date): Promise<void> {
  console.log("== clean-up ==");

  await prisma.cartItem.deleteMany({
    where: { variant: { sku: { startsWith: MARK.toUpperCase() } } },
  });
  await prisma.cart.deleteMany({
    where: { user: { phoneNumber: CUSTOMER_NUMBER } },
  });
  await prisma.user.deleteMany({ where: { phoneNumber: CUSTOMER_NUMBER } });
  await prisma.productVariant.deleteMany({
    where: { sku: { startsWith: MARK.toUpperCase() } },
  });
  await prisma.product.deleteMany({ where: { slug: { startsWith: MARK } } });

  // Every guest bag this run created. Guest bags have no account to cascade
  // from, so they are identified by having been made while this was running.
  await prisma.cart.deleteMany({
    where: { guestTokenHash: { not: null }, createdAt: { gte: startedAt } },
  });

  const [users, products, variants, carts, items] = await Promise.all([
    prisma.user.count({ where: { phoneNumber: CUSTOMER_NUMBER } }),
    prisma.product.count({ where: { slug: { startsWith: MARK } } }),
    prisma.productVariant.count({
      where: { sku: { startsWith: MARK.toUpperCase() } },
    }),
    prisma.cart.count(),
    prisma.cartItem.count(),
  ]);

  check("no test account left behind", users === 0);
  check("no test product left behind", products === 0);
  check("no test variant left behind", variants === 0);
  check("no bags left behind", carts === 0, String(carts));
  check("no bag lines left behind", items === 0, String(items));

  const seeded = await prisma.product.count();
  check("the seeded catalogue is intact", seeded === 26, String(seeded));

  await prisma.otpChallenge.deleteMany({
    where: { phoneNumber: CUSTOMER_NUMBER },
  });
}

/* ------------------------------------------------------------------ *
 * Entry point
 * ------------------------------------------------------------------ */

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("\n  Skipped: this needs DATABASE_URL to create a bag.\n");
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
        "    pnpm check:cart:ui",
        "",
      ].join("\n"),
    );
    return;
  }

  const startedAt = new Date();
  let browser: Browser | undefined;

  try {
    const customer = await prisma.user.upsert({
      where: { phoneNumber: CUSTOMER_NUMBER },
      create: { phoneNumber: CUSTOMER_NUMBER, role: Role.CUSTOMER },
      update: { role: Role.CUSTOMER },
      select: { id: true },
    });

    // Two seeded pieces, from different products, with stock and more than one
    // size — so "choose a size" is a real step rather than a formality.
    const candidates = await prisma.product.findMany({
      where: {
        status: ProductStatus.ACTIVE,
        variants: { some: { isActive: true, inventory: { quantity: { gte: 3 } } } },
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        slug: true,
        name: true,
        variants: {
          where: { isActive: true, inventory: { quantity: { gte: 3 } } },
          take: 1,
          select: { id: true },
        },
      },
      take: 2,
    });

    const [first, second] = candidates;

    // A product of this script's own, so archiving and restocking never touch
    // anything an operator published.
    const [category, colour, size] = await Promise.all([
      prisma.category.findFirstOrThrow({ select: { id: true } }),
      prisma.color.findFirstOrThrow({ select: { id: true } }),
      prisma.size.findFirstOrThrow({ select: { id: true } }),
    ]);

    const testProduct = await prisma.product.upsert({
      where: { articleNumber: `PR-${MARK.toUpperCase()}-0001` },
      update: { status: ProductStatus.ACTIVE },
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

    const testVariant = await prisma.productVariant.upsert({
      where: { sku: `${MARK.toUpperCase()}-0001-A` },
      update: { isActive: true },
      create: {
        sku: `${MARK.toUpperCase()}-0001-A`,
        productId: testProduct.id,
        colorId: colour.id,
        sizeId: size.id,
        isActive: true,
      },
      select: { id: true },
    });

    await prisma.inventory.upsert({
      where: { variantId: testVariant.id },
      update: { quantity: 5 },
      create: { variantId: testVariant.id, quantity: 5 },
      select: { id: true },
    });

    browser = await chromium.launch();
    console.log(`\nChromium ${browser.version()} against ${BASE}\n`);

    await runGuestFlow(browser, first!);
    await runGuestIsolation(browser, first!, second!);
    await runProductCardFlow(browser);
    await runMergeFlow(browser, customer.id, first!, {
      id: second!.variants[0]!.id,
      name: second!.name,
    });
    await runArchiveFlow(
      browser,
      testVariant.id,
      testProduct.id,
      testProduct.name,
    );
    await runAccessibilityFlow(browser, testVariant.id, testProduct.name);
    await runResponsivePass(browser, testVariant.id, first!.slug);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }

    await cleanUp(startedAt);
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
      `Bag browser checks failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
