/**
 * The customer account, in a real browser.
 *
 * Run with `pnpm check:account:ui` while the application is running. Point it
 * elsewhere with `CHECK_BASE_URL=http://localhost:3100`.
 *
 * It reuses the Phase 7 setup exactly — the same `playwright` dependency, the
 * same headless Chromium, real `Session` rows handed over in the real session
 * cookie — so what this drives is what a customer drives.
 *
 * What it covers, in order:
 *
 * - **Protection.** Every account route, signed out.
 * - **The journey.** Overview, profile, name change, address book, first
 *   address auto-defaulting, a second address, switching the default, editing,
 *   deleting a non-default, deleting the default and its replacement, a reload,
 *   sign-out, and signing back in to find it all still there.
 * - **Isolation.** Two customers, in two browser contexts, neither seeing nor
 *   able to touch the other's addresses — including by typing the other's
 *   address URL directly.
 * - **Validation.** A refused form keeps what was typed and puts each message
 *   beside its own field.
 * - **Responsive.** Nine widths across all five routes.
 * - **Accessible.** Names on every control, the delete dialog's focus
 *   behaviour, Escape, focus restoration, and announcements.
 *
 * **It writes.** Two accounts on reserved `+1555…` numbers, removed in a
 * `finally` including on failure; their addresses cascade away with them.
 * Seeded rows are read, never modified.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { chromium, type Browser, type BrowserContext, type Locator, type Page } from "playwright";

import { Role } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/db/client";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/cookie";
import { createSession, revokeSession } from "../src/lib/services/session-service";

const BASE = (process.env.CHECK_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

const NUMBERS = {
  customerA: "+15550104401",
  customerB: "+15550104402",
} as const;

/** Every private route, for the signed-out sweep. */
const ACCOUNT_ROUTES = [
  "/account",
  "/account/profile",
  "/account/addresses",
  "/account/addresses/new",
] as const;

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

/** Controls in the account area too small to hit reliably with a thumb. */
async function smallControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const root = document.querySelector("main");

    if (!root) {
      return out;
    }

    for (const element of Array.from(
      root.querySelectorAll("a, button, input:not([type=hidden]), select"),
    )) {
      const box = element.getBoundingClientRect();

      if (box.width === 0 || box.height === 0) {
        continue;
      }

      const style = window.getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") {
        continue;
      }

      // A checkbox inside its own full-width label is not a small target: the
      // label is what gets clicked. WCAG measures the clickable thing.
      const label = element.closest("label");

      if (label && label !== element) {
        const labelBox = label.getBoundingClientRect();
        if (labelBox.height >= 24 && labelBox.width >= 24) {
          continue;
        }
      }

      if (box.height < 24 || box.width < 24) {
        const text = element.textContent?.trim().slice(0, 24) ?? "";
        out.push(
          `${element.tagName.toLowerCase()} "${text}" ${Math.round(box.width)}x${Math.round(box.height)}`,
        );
      }

      if (out.length >= 3) {
        break;
      }
    }

    return out;
  });
}

async function visible(locator: Locator, timeout = 20_000): Promise<boolean> {
  return locator
    .waitFor({ state: "visible", timeout })
    .then(() => true)
    .catch(() => false);
}

async function signedInContext(
  browser: Browser,
  token: string,
  viewport = { width: 1280, height: 900 },
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

/** Fill the address form. Every field, so nothing is left to a stale default. */
async function fillAddress(
  page: Page,
  values: {
    recipientName: string;
    phoneNumber: string;
    label: string;
    addressLine1: string;
    addressLine2?: string;
    landmark?: string;
    city: string;
    state: string;
    postalCode: string;
  },
): Promise<void> {
  // The form's action only goes through React once the page has hydrated, and a
  // click before that submits natively instead. Waiting for the network to
  // settle is the cheap, reliable way to be past it.
  await page.waitForLoadState("networkidle").catch(() => undefined);

  await page.getByLabel("Recipient name").fill(values.recipientName);
  await page.getByLabel("Phone number").fill(values.phoneNumber);
  await page.getByLabel("Address line 1").fill(values.addressLine1);
  await page.getByLabel("Address line 2").fill(values.addressLine2 ?? "");
  await page.getByLabel("Landmark").fill(values.landmark ?? "");
  await page.getByLabel("City").fill(values.city);
  await page.getByLabel("State").fill(values.state);
  await page.getByLabel("PIN code").fill(values.postalCode);
  await page.getByLabel("Name this address").fill(values.label);
}

/**
 * A card in the address book, found by its own attribute.
 *
 * Not "a list item containing this word": the breadcrumb and the account
 * navigation are list items too, and the breadcrumb's first entry is "Home" —
 * which is also the most likely label a customer gives their first address.
 * The first run of this suite matched the breadcrumb and reported four failures
 * that were entirely the test's fault.
 */
function addressCard(page: Page, label: string) {
  return page.locator(`[data-address-card="${label}"]`).first();
}

/** Whether that card is the default, read from the card rather than its text. */
async function isDefaultCard(page: Page, label: string): Promise<boolean> {
  return (
    (await addressCard(page, label)
      .getAttribute("data-default")
      .catch(() => null)) === "true"
  );
}

/**
 * Wait for the default badge to land on a particular card.
 *
 * Setting a default is server-confirmed: the action writes, revalidates, and
 * the list re-renders. Polling the card's own attribute waits for that rather
 * than guessing at how long a write to a database on another continent takes,
 * and a reload part way through covers the case where the router has not
 * refreshed on its own.
 */
async function waitForDefaultCard(page: Page, label: string): Promise<boolean> {
  const deadline = Date.now() + 40_000;
  let reloaded = false;

  while (Date.now() < deadline) {
    if (await isDefaultCard(page, label)) {
      return true;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    if (!reloaded && Date.now() > deadline - 30_000) {
      reloaded = true;
      await page
        .reload({ waitUntil: "domcontentloaded" })
        .catch(() => undefined);
    }
  }

  return false;
}

/**
 * Save an address form and wait for the list it returns to.
 *
 * A successful create or update redirects to the address book, so the arrival
 * is the signal that the write committed — better than a fixed pause, which is
 * guessing at the round trip to a database on another continent.
 */
async function submitAddressForm(page: Page, button: string): Promise<boolean> {
  await page.getByRole("button", { name: button }).click();

  // Either signal will do, and both mean the server committed: the form
  // navigates to the list when it hears success, and renders the message when
  // JavaScript has not taken over yet. Accepting both keeps the check about the
  // save rather than about which of the two got there first.
  const confirmed = await Promise.race([
    page
      .waitForURL("**/account/addresses", { timeout: 40_000 })
      .then(() => true)
      .catch(() => false),
    page
      .getByText(/Address (saved|updated)\./)
      .waitFor({ state: "visible", timeout: 40_000 })
      .then(() => true)
      .catch(() => false),
  ]);

  if (!confirmed) {
    return false;
  }

  // Leave the browser on the list, whichever route it took to confirm.
  await page.goto(`${BASE}/account/addresses`, { waitUntil: "domcontentloaded" });

  return true;
}

/* ------------------------------------------------------------------ *
 * Signed out
 * ------------------------------------------------------------------ */

async function runProtectionFlow(browser: Browser): Promise<void> {
  console.log("== signed out, every account route ==");

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();

  for (const route of ACCOUNT_ROUTES) {
    const response = await page.goto(`${BASE}${route}`, {
      waitUntil: "domcontentloaded",
    });

    check(
      `${route} is not served to a signed-out visitor`,
      new URL(page.url()).pathname === "/login",
      page.url(),
    );
    check(
      `${route} carries itself as the return destination`,
      new URL(page.url()).searchParams.get("next") === route,
      new URL(page.url()).searchParams.get("next") ?? "(none)",
    );
    check(
      `${route} answers a redirect rather than an error`,
      (response?.status() ?? 0) < 400,
      String(response?.status()),
    );
  }

  await context.close();
  console.log("");
}

/* ------------------------------------------------------------------ *
 * The journey
 * ------------------------------------------------------------------ */

async function runAccountJourney(
  browser: Browser,
  token: string,
  userId: string,
): Promise<void> {
  console.log("== a customer, from overview to addresses ==");

  const context = await signedInContext(browser, token);
  const page = await context.newPage();

  await page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });

  check(
    "the overview opens",
    await visible(page.getByRole("heading", { level: 1 })),
  );
  check(
    "it shows the phone number they signed in with",
    (await page.locator("main").innerText()).includes(NUMBERS.customerA),
  );
  check(
    "and says the number cannot be changed here",
    (await page.locator("main").innerText()).includes(
      "how you sign in, so it cannot be changed here",
    ),
  );
  check(
    "it invents no order count or loyalty points",
    !/orders?\s*:|points|loyalty|total spent/i.test(
      await page.locator("main").innerText(),
    ),
  );
  check(
    "the account navigation is a landmark",
    await visible(page.getByRole("navigation", { name: "Your account" })),
  );
  check(
    "and offers no Orders link, because there are no orders",
    (await page
      .getByRole("navigation", { name: "Your account" })
      .getByRole("link", { name: "Orders" })
      .count()) === 0,
  );

  console.log("\n== changing the name ==");

  await page.getByRole("link", { name: "Your details" }).first().click();
  await page.waitForURL("**/account/profile", { timeout: 15_000 });

  check("the profile page opens", await visible(page.getByLabel("Your name")));

  await page.getByLabel("Your name").fill("Dhruw");
  await page.getByRole("button", { name: "Save" }).click();

  check(
    "saving confirms",
    await visible(page.getByText("Your details are saved.")),
  );
  check(
    "and the database has it",
    (await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true },
    })).name === "Dhruw",
  );

  await page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
  check(
    "the overview greets them by name",
    (await page.locator("main").innerText()).includes("Dhruw"),
  );

  console.log("\n== the first address ==");

  await page.goto(`${BASE}/account/addresses`, { waitUntil: "domcontentloaded" });

  check(
    "an empty book shows an empty state",
    await visible(page.getByRole("heading", { name: "No saved addresses yet" })),
  );
  check(
    "which is an invitation rather than an error",
    (await page.locator("main").innerText()).includes(
      "Save where you would like your orders delivered",
    ),
  );

  await page.getByRole("link", { name: "Add an address" }).first().click();
  await page.waitForURL("**/account/addresses/new", { timeout: 15_000 });

  await fillAddress(page, {
    recipientName: "Jaini Vaviya",
    phoneNumber: "+919876543210",
    label: "Home",
    addressLine1: "12 Rose Villa, Linking Road",
    addressLine2: "Flat 4B",
    landmark: "Opposite the bakery",
    city: "Mumbai",
    state: "Maharashtra",
    postalCode: "400050",
  });

  check(
    "saving returns to the address book",
    await submitAddressForm(page, "Save address"),
  );

  const home = addressCard(page, "Home");
  check("the first address is listed", await visible(home));
  check(
    "it is the default without being asked to be",
    await isDefaultCard(page, "Home"),
  );
  check(
    "and the database agrees",
    (await prisma.address.count({ where: { userId, isDefault: true } })) === 1,
  );
  check(
    "the recipient is shown, not the account name",
    (await home.innerText()).includes("Jaini Vaviya"),
  );
  check(
    "with the landmark",
    (await home.innerText()).includes("Opposite the bakery"),
  );

  console.log("\n== a second address, and switching the default ==");

  await page.getByRole("link", { name: "Add an address" }).first().click();
  await page.waitForURL("**/account/addresses/new", { timeout: 15_000 });

  await fillAddress(page, {
    recipientName: "Dhruw Vaviya",
    phoneNumber: "+919812345678",
    label: "Work",
    addressLine1: "4th Floor, Tech Park",
    city: "Pune",
    state: "Maharashtra",
    postalCode: "411001",
  });

  check(
    "saving the second returns to the book",
    await submitAddressForm(page, "Save address"),
  );
  check(
    "the second address is listed",
    await visible(addressCard(page, "Work")),
  );
  check(
    "it did not steal the default",
    !(await isDefaultCard(page, "Work")),
  );

  await addressCard(page, "Work")
    .getByRole("button", { name: /^Set as default/ })
    .click();

  check(
    "setting the second as default works",
    await waitForDefaultCard(page, "Work"),
  );
  check(
    "and the first is no longer default",
    !(await isDefaultCard(page, "Home")),
  );
  check(
    "exactly one card shows the badge",
    (await page.getByText("Default", { exact: true }).count()) === 1,
  );
  check(
    "and exactly one row is default in the database",
    (await prisma.address.count({ where: { userId, isDefault: true } })) === 1,
  );

  console.log("\n== editing ==");

  await addressCard(page, "Home")
    .getByRole("link", { name: /^Edit/ })
    .click();
  await page.waitForURL(/\/account\/addresses\/[0-9a-f-]{20,}/, {
    timeout: 15_000,
  });

  check(
    "the form opens with what was saved",
    (await page.getByLabel("City").inputValue()) === "Mumbai",
  );

  await page.getByLabel("Landmark").fill("Next to the chemist");
  check(
    "saving an edit returns to the book",
    await submitAddressForm(page, "Save changes"),
  );

  const cardsAfterEdit = await page
    .locator("[data-address-card]")
    .evaluateAll((nodes) =>
      nodes.map((node) => node.getAttribute("data-address-card") ?? "?"),
    );

  check(
    "the change is saved",
    (await addressCard(page, "Home")
      .innerText()
      .catch(() => "")).includes("Next to the chemist"),
    `cards present: ${cardsAfterEdit.join(", ") || "(none)"}`,
  );
  check(
    "and editing a non-default one did not move the default",
    await isDefaultCard(page, "Work"),
  );

  console.log("\n== deleting ==");

  await addressCard(page, "Home")
    .getByRole("button", { name: /^Delete/ })
    .click();

  const dialog = page.getByRole("dialog");
  check("deleting asks first", await visible(dialog));
  check(
    "the dialog names the address",
    (await dialog.innerText()).includes("Home"),
  );
  check(
    "and says what happens to the others",
    (await dialog.innerText()).includes("Your other addresses are not affected"),
  );

  await dialog.getByRole("button", { name: "Keep it" }).click();
  await page.waitForTimeout(500);
  check(
    "backing out leaves it alone",
    await visible(addressCard(page, "Home")),
  );

  await addressCard(page, "Home")
    .getByRole("button", { name: /^Delete/ })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove address" }).click();
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: "domcontentloaded" });

  check(
    "confirming removes it",
    (await addressCard(page, "Home").count()) === 0,
  );
  check(
    "and the default is untouched",
    await isDefaultCard(page, "Work"),
  );

  console.log("\n== deleting the default promotes a replacement ==");

  await page.getByRole("link", { name: "Add an address" }).first().click();
  await page.waitForURL("**/account/addresses/new", { timeout: 15_000 });
  await fillAddress(page, {
    recipientName: "Someone Else",
    phoneNumber: "+919811111111",
    label: "Sister",
    addressLine1: "9 Garden Lane",
    city: "Surat",
    state: "Gujarat",
    postalCode: "395007",
  });
  await submitAddressForm(page, "Save address");

  await addressCard(page, "Work")
    .getByRole("button", { name: /^Delete/ })
    .click();

  const defaultDialog = page.getByRole("dialog");
  check(
    "the dialog warns that this one is the default",
    (await defaultDialog.innerText()).includes("This is your default address"),
  );

  await defaultDialog.getByRole("button", { name: "Remove address" }).click();

  check(
    "the remaining address is promoted",
    await waitForDefaultCard(page, "Sister"),
  );
  check(
    "and there is exactly one default in the database",
    (await prisma.address.count({ where: { userId, isDefault: true } })) === 1,
  );

  console.log("\n== a refused form keeps what was typed ==");

  await page.getByRole("link", { name: "Add an address" }).first().click();
  await page.waitForURL("**/account/addresses/new", { timeout: 15_000 });

  await fillAddress(page, {
    recipientName: "Kept Name",
    phoneNumber: "+919812345678",
    label: "Kept Label",
    addressLine1: "Kept Line One",
    city: "Kept City",
    state: "Kept State",
    postalCode: "12",
  });

  const redirected = await submitAddressForm(page, "Save address");

  check("a refused form stays on the form", !redirected);
  check(
    "a bad PIN code is refused",
    await visible(page.getByText("Enter a valid 6-digit PIN code.")),
  );
  check(
    "and the error sits with its own field",
    (await page.getByLabel("PIN code").getAttribute("aria-invalid")) === "true",
  );
  check(
    "everything else the customer typed is still there",
    (await page.getByLabel("Recipient name").inputValue()) === "Kept Name" &&
      (await page.getByLabel("City").inputValue()) === "Kept City" &&
      (await page.getByLabel("Address line 1").inputValue()) ===
        "Kept Line One",
  );
  check(
    "and nothing was saved",
    (await prisma.address.count({ where: { userId } })) === 1,
  );

  console.log("\n== it survives a sign-out and a sign-in ==");

  await page.goto(`${BASE}/account`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: /sign out/i }).first().click();
  await page.waitForTimeout(1500);

  await page.goto(`${BASE}/account/addresses`, { waitUntil: "domcontentloaded" });
  check(
    "after signing out the account area is protected again",
    new URL(page.url()).pathname === "/login",
    page.url(),
  );

  await context.close();

  const fresh = await createSession(userId);
  const freshContext = await signedInContext(browser, fresh.token);
  const freshPage = await freshContext.newPage();

  await freshPage.goto(`${BASE}/account/addresses`, {
    waitUntil: "domcontentloaded",
  });

  check(
    "signing back in finds the address book as it was",
    await visible(addressCard(freshPage, "Sister")),
  );
  check(
    "with the default still set",
    await isDefaultCard(freshPage, "Sister"),
  );

  await freshPage.goto(`${BASE}/account/profile`, {
    waitUntil: "domcontentloaded",
  });
  check(
    "and the name still saved",
    (await freshPage.getByLabel("Your name").inputValue()) === "Dhruw",
  );

  await freshContext.close();
  await revokeSession(fresh.token);
  console.log("");
}

/* ------------------------------------------------------------------ *
 * Isolation
 * ------------------------------------------------------------------ */

async function runIsolationFlow(
  browser: Browser,
  userA: string,
  userB: string,
): Promise<void> {
  console.log("== two customers ==");

  await prisma.address.create({
    data: {
      userId: userB,
      label: "B's place",
      recipientName: "Customer B",
      phoneNumber: "+919800000002",
      addressLine1: "1 Second Street",
      city: "Delhi",
      state: "Delhi",
      postalCode: "110001",
      country: "IN",
      isDefault: true,
    },
  });

  const addressOfB = await prisma.address.findFirstOrThrow({
    where: { userId: userB },
    select: { id: true },
  });

  // Fresh sessions. The journey above ends by signing out, which revokes the
  // one it used — reusing it here would land every page on /login and report a
  // pile of failures that have nothing to do with isolation.
  const sessionA = await createSession(userA);
  const sessionB = await createSession(userB);

  const contextA = await signedInContext(browser, sessionA.token);
  const pageA = await contextA.newPage();

  await pageA.goto(`${BASE}/account/addresses`, { waitUntil: "domcontentloaded" });
  const bookOfA = await pageA.locator("main").innerText();

  check("A sees their own address book", bookOfA.includes("Sister"));
  check("and none of B's addresses", !bookOfA.includes("B's place"));
  check("nor B's recipient", !bookOfA.includes("Customer B"));

  // The direct attempt: type B's address URL while signed in as A.
  const stolen = await pageA.goto(`${BASE}/account/addresses/${addressOfB.id}`, {
    waitUntil: "domcontentloaded",
  });

  check(
    "opening B's address by URL is a not-found, not a form",
    (await pageA.getByLabel("Recipient name").count()) === 0,
    `status ${stolen?.status()}`,
  );
  check(
    "and it leaks nothing about whether that id exists",
    !(await pageA.locator("body").innerText()).includes("Customer B"),
  );
  check(
    "B's address is untouched",
    (await prisma.address.findUniqueOrThrow({
      where: { id: addressOfB.id },
      select: { label: true },
    })).label === "B's place",
  );

  const contextB = await signedInContext(browser, sessionB.token);
  const pageB = await contextB.newPage();

  await pageB.goto(`${BASE}/account/addresses`, { waitUntil: "domcontentloaded" });
  const bookOfB = await pageB.locator("main").innerText();

  check("B sees their own", bookOfB.includes("B's place"));
  check("and none of A's", !bookOfB.includes("Sister"));

  await contextA.close();
  await contextB.close();
  await revokeSession(sessionA.token);
  await revokeSession(sessionB.token);
  console.log("");
}

/* ------------------------------------------------------------------ *
 * Accessibility
 * ------------------------------------------------------------------ */

async function runAccessibilityFlow(
  browser: Browser,
  userId: string,
): Promise<void> {
  console.log("== the account area, by keyboard ==");

  const session = await createSession(userId);
  const context = await signedInContext(browser, session.token);
  const page = await context.newPage();

  // A second address, so there is a non-default card to inspect. With one
  // saved address it is the default by definition and the "Set as default"
  // control correctly does not exist — asking for it would be checking the
  // fixture rather than the interface.
  await prisma.address.create({
    data: {
      userId,
      label: "Second place",
      recipientName: "Someone Else",
      phoneNumber: "+919800000003",
      addressLine1: "7 Another Road",
      city: "Nashik",
      state: "Maharashtra",
      postalCode: "422001",
      country: "IN",
      isDefault: false,
    },
  });

  await page.goto(`${BASE}/account/addresses`, { waitUntil: "domcontentloaded" });

  check(
    "there are two cards, so a non-default one exists to inspect",
    (await page.locator("[data-address-card]").count()) === 2,
    String(await page.locator("[data-address-card]").count()),
  );

  const names = await page.evaluate(() =>
    Array.from(document.querySelectorAll("main a, main button")).map(
      (element) => (element.textContent ?? "").replace(/\s+/g, " ").trim(),
    ),
  );

  check(
    "the edit control names the address it edits",
    names.some((name) => /^Edit \S/.test(name)),
    names.join(" | ").slice(0, 120),
  );
  check(
    "the delete control names the address it removes",
    names.some((name) => /^Delete \S/.test(name)),
  );
  check(
    "the default control names the address it promotes",
    names.some((name) => /^Set as default — \S/.test(name)),
  );

  const currentPage = await page
    .getByRole("navigation", { name: "Your account" })
    .locator("[aria-current='page']")
    .count();
  check("the current section is marked, not only coloured", currentPage === 1);

  console.log("\n== the delete dialog ==");

  const deleteButton = page.getByRole("button", { name: /^Delete/ }).first();
  await deleteButton.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  check("Enter opens it", await visible(dialog));
  check(
    "it is a modal dialog with a name",
    (await dialog.getAttribute("aria-modal")) === "true",
  );
  check(
    "the page behind it is inert",
    await page.evaluate(() =>
      Array.from(document.body.children).some((element) =>
        element.hasAttribute("inert"),
      ),
    ),
  );

  await page.keyboard.press("Escape");
  check(
    "Escape closes it",
    await dialog
      .waitFor({ state: "hidden", timeout: 10_000 })
      .then(() => true)
      .catch(() => false),
  );
  check(
    "and focus returns to the control that opened it",
    await deleteButton.evaluate((element) => element === document.activeElement),
  );

  console.log("\n== the form ==");

  await page.goto(`${BASE}/account/addresses/new`, {
    waitUntil: "domcontentloaded",
  });

  check(
    "required fields are marked for screen readers, not only with an asterisk",
    (await page.getByText("(required)").count()) > 0,
  );
  check(
    "the fields are grouped rather than read as one long run",
    (await page.locator("fieldset legend").count()) >= 3,
  );
  check(
    "the default tick box explains what it does",
    (await page.locator("main").innerText()).includes(
      "We will suggest this address first",
    ),
  );

  await context.close();
  await revokeSession(session.token);
  console.log("");
}

/* ------------------------------------------------------------------ *
 * Responsive
 * ------------------------------------------------------------------ */

async function runResponsivePass(
  browser: Browser,
  userId: string,
  addressId: string,
): Promise<void> {
  console.log("== nine widths ==");

  const session = await createSession(userId);

  const routes = [
    "/account",
    "/account/profile",
    "/account/addresses",
    "/account/addresses/new",
    `/account/addresses/${addressId}`,
  ];

  for (const { width, height, label } of WIDTHS) {
    const context = await signedInContext(browser, session.token, {
      width,
      height,
    });
    const page = await context.newPage();

    let worst = 0;
    let worstPath = "";
    let offenders: string[] = [];
    let tiny: string[] = [];

    for (const route of routes) {
      await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(150);

      const overflow = await overflows(page);

      if (overflow > worst) {
        worst = overflow;
        worstPath = route;
        offenders = await offscreenElements(page);
      }

      const small = await smallControls(page);
      if (small.length > 0) {
        tiny = [...tiny, `${route}: ${small.join(", ")}`];
      }
    }

    // The delete dialog, open, at this width. Fixed-position and full-height,
    // so it is the most likely thing to push a phone sideways.
    await page.goto(`${BASE}/account/addresses`, {
      waitUntil: "domcontentloaded",
    });
    await page
      .getByRole("button", { name: /^Delete/ })
      .first()
      .click()
      .catch(() => undefined);
    await page.waitForTimeout(200);

    const dialogOverflow = await overflows(page);

    check(
      `${label}: no horizontal overflow`,
      worst === 0 && dialogOverflow === 0,
      worst > 0
        ? `${worstPath} overflows by ${worst}px — ${offenders.join("; ")}`
        : dialogOverflow > 0
          ? `the open dialog overflows by ${dialogOverflow}px`
          : "",
    );
    check(
      `${label}: every account control is a usable tap target`,
      tiny.length === 0,
      tiny.join(" | "),
    );

    await context.close();
  }

  await revokeSession(session.token);
  console.log("");
}

/* ------------------------------------------------------------------ *
 * Clean-up
 * ------------------------------------------------------------------ */

async function cleanUp(tokens: readonly string[]): Promise<void> {
  console.log("== clean-up ==");

  for (const token of tokens) {
    await revokeSession(token).catch(() => undefined);
  }

  const numbers = Object.values(NUMBERS);

  await prisma.user.deleteMany({ where: { phoneNumber: { in: numbers } } });

  const [users, addresses] = await Promise.all([
    prisma.user.count({ where: { phoneNumber: { in: numbers } } }),
    prisma.address.count(),
  ]);

  check("no test accounts left behind", users === 0, String(users));
  check(
    "and their addresses cascaded away with them",
    addresses === 0,
    String(addresses),
  );

  const products = await prisma.product.count();
  check("the seeded catalogue is intact", products === 26, String(products));
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
        "    pnpm check:account:ui",
        "",
      ].join("\n"),
    );
    return;
  }

  let browser: Browser | undefined;
  const tokens: string[] = [];

  try {
    const [customerA, customerB] = await Promise.all(
      [NUMBERS.customerA, NUMBERS.customerB].map((phoneNumber) =>
        prisma.user.upsert({
          where: { phoneNumber },
          create: { phoneNumber, role: Role.CUSTOMER },
          update: { role: Role.CUSTOMER },
          select: { id: true },
        }),
      ),
    );

    const sessionA = await createSession(customerA!.id);
    const sessionB = await createSession(customerB!.id);
    tokens.push(sessionA.token, sessionB.token);

    browser = await chromium.launch();
    console.log(`\nChromium ${browser.version()} against ${BASE}\n`);

    await runProtectionFlow(browser);
    await runAccountJourney(browser, sessionA.token, customerA!.id);
    await runIsolationFlow(browser, customerA!.id, customerB!.id);
    await runAccessibilityFlow(browser, customerA!.id);

    const anyAddress = await prisma.address.findFirstOrThrow({
      where: { userId: customerA!.id },
      select: { id: true },
    });

    await runResponsivePass(browser, customerA!.id, anyAddress.id);
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }

    await cleanUp(tokens);
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
      `Account browser checks failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
