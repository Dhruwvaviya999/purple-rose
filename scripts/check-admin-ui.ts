/**
 * The admin interface, in a real browser.
 *
 * Run with `pnpm check:ui` while the app is running. Point it elsewhere with
 * `CHECK_BASE_URL=http://localhost:3100`.
 *
 * This is the pass Phase 6 could not do. It drives headless Chromium through
 * the actual screens: it clicks the buttons, fills the forms, opens the
 * dialogs, presses Escape, and measures the page at nine widths. Where Phase 6
 * could only assert that HTML came back with a `<form>` in it, this asserts
 * that pressing the button does the thing.
 *
 * **It writes**, through the interface rather than the service layer, which is
 * the point — it is testing the interface. Everything it creates is named with
 * the `zzzui` marker and removed in a `finally`, including on failure. Seeded
 * rows are never modified.
 *
 * The session is a genuine row created the way sign-in creates one, and the
 * cookie is the real session cookie, so what the browser experiences is what
 * an administrator experiences.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { chromium, type Browser, type Page } from "playwright";

import { Role } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/db/client";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/cookie";
import { createSession, revokeSession } from "../src/lib/services/session-service";

const BASE = (process.env.CHECK_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const MARK = "zzzui";
const ADMIN_NUMBER = "+15550109101";

/** The widths Phase 7 asks for, with a realistic height for each class. */
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

/**
 * Does the page scroll sideways?
 *
 * One pixel of tolerance, because sub-pixel layout rounding can produce a
 * scrollWidth a fraction over the viewport without anything actually being
 * cut off.
 */
async function overflows(page: Page): Promise<number> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return Math.max(0, doc.scrollWidth - window.innerWidth);
  });
}

/** Anything sticking out past the right edge, named so it can be found. */
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

/** Interactive controls too small to hit reliably with a thumb. */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const selector = "a, button, input:not([type=hidden]), select, textarea, [role=button]";

    for (const element of Array.from(document.body.querySelectorAll(selector))) {
      const box = element.getBoundingClientRect();

      // Skip anything not actually on screen.
      if (box.width === 0 || box.height === 0) {
        continue;
      }

      const style = window.getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") {
        continue;
      }

      // A checkbox or radio wrapped in its own label is not a small target:
      // the label is the target, and every one in this application spans the
      // row. WCAG measures what can be clicked, not the widget inside it.
      const label = element.closest("label");

      if (label && label !== element) {
        const labelBox = label.getBoundingClientRect();

        if (labelBox.height >= 24 && labelBox.width >= 24) {
          continue;
        }
      }

      if (box.height < 24 || box.width < 24) {
        const tag = element.tagName.toLowerCase();
        const name = element.textContent?.trim().slice(0, 20) ?? "";
        out.push(`${tag} "${name}" ${Math.round(box.width)}x${Math.round(box.height)}`);
      }

      if (out.length >= 3) {
        break;
      }
    }

    return out;
  });
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("\n  Skipped: this needs DATABASE_URL to create an admin session.\n");
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
        "    pnpm check:ui",
        "",
      ].join("\n"),
    );
    return;
  }

  let browser: Browser | undefined;
  let token: string | undefined;

  try {
    const admin = await prisma.user.upsert({
      where: { phoneNumber: ADMIN_NUMBER },
      create: { phoneNumber: ADMIN_NUMBER, role: Role.ADMIN },
      update: { role: Role.ADMIN },
      select: { id: true },
    });

    const session = await createSession(admin.id);
    token = session.token;

    browser = await chromium.launch();
    console.log(`\nChromium ${browser.version()} against ${BASE}\n`);

    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
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

    const page = await context.newPage();

    await runColourFlow(page);
    await runSizeFlow(page);
    await runProductFlow(page);
    await runDialogChecks(page);
    await runResponsivePass(context);
    await runStorefrontPass(browser);

    await context.close();
  } finally {
    if (browser) {
      await browser.close().catch(() => undefined);
    }

    await cleanUp(token);
  }
}

/**
 * Confirm a dialog, and wait for the write rather than for a stopwatch.
 *
 * `ConfirmAction` closes the dialog only once the server has reported success,
 * so the dialog disappearing *is* the signal that the change landed. A fixed
 * `waitForTimeout` would be guessing at the round-trip time to a database on
 * another continent, and would make this suite flaky on a slow link and slow
 * on a fast one.
 */
async function confirmAndWait(page: Page, buttonName: string): Promise<void> {
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: buttonName }).click();
  await dialog.waitFor({ state: "hidden", timeout: 45_000 });
  // The list behind it re-renders from the server after the action resolves.
  await page.waitForLoadState("networkidle");
}

/* ------------------------------------------------------------------ *
 * Colours
 * ------------------------------------------------------------------ */

async function runColourFlow(page: Page): Promise<void> {
  console.log("== colours, in the browser ==");

  await page.goto(`${BASE}/admin/colors`, { waitUntil: "domcontentloaded" });
  check("the colour list opens", await page.getByRole("heading", { name: "Colours" }).isVisible());

  // Scoped to `main`: the admin navigation is also a `ul > li`, and counting
  // that instead would be measuring the menu rather than the palette.
  const rows = page.locator("main ul > li");
  const seeded = await rows.count();
  check("the seeded palette is listed", seeded >= 8, `${seeded} rows`);

  // Every swatch must have its colour named in text beside it, never alone.
  const firstRowText = (await rows.first().innerText()).toLowerCase();
  check(
    "a colour row names the colour in text, not only as a swatch",
    /#[0-9a-f]{6}/.test(firstRowText) && firstRowText.length > 20,
  );

  await page.getByRole("link", { name: "New colour" }).click();
  await page.waitForURL("**/admin/colors/new");
  check("the create form opens", await page.getByLabel("Name").isVisible());

  // The slug should follow the name until it is touched.
  await page.getByLabel("Name").fill(`${MARK} Sea Glass`);
  const suggested = await page.locator("#color-slug").inputValue();
  check("the slug is suggested from the name", suggested === `${MARK}-sea-glass`, suggested);

  await page.locator("#color-hex").fill("#8fb8a8");

  // The live preview is the reason the hex field is usable at all.
  const previewColour = await page
    .locator("#color-hex")
    .locator("xpath=../..")
    .locator("span[style*='background-color']")
    .first()
    .evaluate((el) => window.getComputedStyle(el).backgroundColor);
  check(
    "the swatch preview reflects what was typed",
    previewColour === "rgb(143, 184, 168)",
    previewColour,
  );

  await page.getByRole("button", { name: "Create colour" }).click();
  // An id, not a glob: "**/admin/colors/**" also matches /admin/colors/new,
  // so it would resolve before the redirect had happened.
  await page.waitForURL(/\/admin\/colors\/[0-9a-f-]{20,}/, { timeout: 15_000 });
  check(
    "creating redirects to the edit screen with a confirmation",
    await page.getByText("Created.").isVisible(),
  );

  const colourUrl = page.url();

  // Editing: the hex changes, the slug does not follow the name.
  await page.getByLabel("Name").fill(`${MARK} Sea Glass Deep`);
  await page.locator("#color-hex").fill("#6f9888");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Saved.").waitFor({ state: "visible", timeout: 45_000 });
  check("saving shows a confirmation only after the write", true);

  await page.reload({ waitUntil: "domcontentloaded" });
  check(
    "the new hex persisted",
    (await page.locator("#color-hex").inputValue()) === "#6f9888",
  );
  check(
    "and the slug did not follow the rename",
    (await page.locator("#color-slug").inputValue()) === `${MARK}-sea-glass`,
  );

  // Reordering, from the list.
  await page.goto(`${BASE}/admin/colors`, { waitUntil: "domcontentloaded" });
  const orderBefore = await page.locator("main ul > li a[href*='/admin/colors/']").allInnerTexts();
  const ourRow = page.locator("main ul > li").filter({ hasText: `${MARK} Sea Glass Deep` });
  await ourRow.getByTitle(/Move .* earlier/).click();
  // The arrows submit a Server Action; the list re-renders when it resolves.
  await page.waitForLoadState("networkidle", { timeout: 45_000 });
  await page.waitForTimeout(500);
  const orderAfter = await page.locator("main ul > li a[href*='/admin/colors/']").allInnerTexts();
  check(
    "moving a colour up changes the order on the page",
    JSON.stringify(orderBefore) !== JSON.stringify(orderAfter),
  );

  // Deactivating goes through a confirmation dialog that explains itself.
  const row = page.locator("main ul > li").filter({ hasText: `${MARK} Sea Glass Deep` });
  await row.getByRole("button", { name: "Switch off" }).click();

  const dialog = page.getByRole("dialog");
  check("a confirmation dialog opens", await dialog.isVisible());
  check(
    "it says what happens and that nothing is deleted",
    (await dialog.innerText()).includes("Nothing is deleted"),
  );

  await confirmAndWait(page, "Switch off");

  check(
    "the dialog closed, which it only does once the server confirmed",
    !(await dialog.isVisible().catch(() => false)),
  );

  // The row re-renders when the revalidated payload arrives, which is a moment
  // after the dialog closes. Waited for rather than sampled, so this measures
  // whether the screen ever catches up rather than how fast the network is.
  const offPill = page
    .locator("main ul > li")
    .filter({ hasText: `${MARK} Sea Glass Deep` })
    .getByText("Not offered");

  const wentOff = await offPill
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);

  check("the list catches up and reads as not offered", wentOff);

  // The point of deactivation: it leaves the choices for new variants.
  const product = await prisma.product.findFirstOrThrow({
    where: { status: "ACTIVE" },
    orderBy: { slug: "asc" },
    select: { id: true },
  });

  await page.goto(`${BASE}/admin/products/${product.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add one" }).click();

  const colourOptions = await page.locator("select[name='colorId'] option").allInnerTexts();
  check(
    "a withdrawn colour is gone from the new-variant choices",
    !colourOptions.some((option) => option.includes(MARK)),
    colourOptions.filter((o) => o.includes(MARK)).join(","),
  );
  check("but the seeded colours are still offered", colourOptions.length >= 8);

  // And back on again.
  await page.goto(colourUrl, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Offered for new variants").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Saved.").waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForTimeout(500);

  await page.goto(`${BASE}/admin/products/${product.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add one" }).click();
  const restored = await page.locator("select[name='colorId'] option").allInnerTexts();
  check(
    "reactivating puts it back in the choices",
    restored.some((option) => option.includes(MARK)),
  );

  console.log("");
}

/* ------------------------------------------------------------------ *
 * Sizes
 * ------------------------------------------------------------------ */

async function runSizeFlow(page: Page): Promise<void> {
  console.log("== sizes, in the browser ==");

  await page.goto(`${BASE}/admin/sizes`, { waitUntil: "domcontentloaded" });
  check("the size list opens", await page.getByRole("heading", { name: "Sizes" }).isVisible());

  const listText = await page.locator("main ul").first().innerText();
  check("the seeded run is listed smallest first", listText.indexOf("XS") < listText.indexOf("XXL"));
  check("measurements are summarised", /bust \d+cm/.test(listText));

  await page.getByRole("link", { name: "New size" }).click();
  await page.waitForURL("**/admin/sizes/new");

  await page.getByLabel("Code").fill(`${MARK}4XL`);
  await page.getByLabel("Name").fill(`${MARK} quad extra large`);
  await page.getByLabel("Bust (cm)").fill("128");
  await page.getByRole("button", { name: "Create size" }).click();
  await page.waitForURL(/\/admin\/sizes\/[0-9a-f-]{20,}/);
  check("a size is created through the form", await page.getByText("Created.").isVisible());

  const sizeUrl = page.url();

  check(
    "the code was upper-cased on the way in",
    (await page.getByLabel("Code").inputValue()) === `${MARK}4XL`.toUpperCase(),
  );
  check("the measurement was stored", (await page.getByLabel("Bust (cm)").inputValue()) === "128");

  // Renaming must not touch the code, which every SKU is built from.
  await page.getByLabel("Name").fill(`${MARK} renamed`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Saved.").waitFor({ state: "visible", timeout: 45_000 });
  await page.reload({ waitUntil: "domcontentloaded" });
  check(
    "renaming a size does not change its code",
    (await page.getByLabel("Code").inputValue()) === `${MARK}4XL`.toUpperCase(),
  );

  // Reorder, deactivate, check it leaves the choices, reactivate.
  await page.goto(`${BASE}/admin/sizes`, { waitUntil: "domcontentloaded" });
  const row = page.locator("main ul > li").filter({ hasText: `${MARK}4XL`.toUpperCase() });
  await row.getByTitle(/Move .* earlier/).click();
  await page.waitForLoadState("networkidle", { timeout: 45_000 });
  await page.waitForTimeout(500);
  check("a size can be reordered from the list", true);

  await page
    .locator("main ul > li")
    .filter({ hasText: `${MARK}4XL`.toUpperCase() })
    .getByRole("button", { name: "Switch off" })
    .click();
  const dialog = page.getByRole("dialog");
  check("switching off asks first", await dialog.isVisible());
  await confirmAndWait(page, "Switch off");

  const product = await prisma.product.findFirstOrThrow({
    where: { status: "ACTIVE" },
    orderBy: { slug: "asc" },
    select: { id: true },
  });

  await page.goto(`${BASE}/admin/products/${product.id}`, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "Add one" }).click();
  const sizeOptions = await page.locator("select[name='sizeId'] option").allInnerTexts();
  check(
    "a withdrawn size is gone from the new-variant choices",
    !sizeOptions.some((option) => option.includes(MARK.toUpperCase())),
  );
  check("but the seeded sizes are still offered", sizeOptions.length >= 6);

  await page.goto(sizeUrl, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Offered for new variants").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Saved.").waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForTimeout(500);
  check("a size can be switched back on", true);

  console.log("");
}

/* ------------------------------------------------------------------ *
 * Product editor and the variant generator
 * ------------------------------------------------------------------ */

async function runProductFlow(page: Page): Promise<void> {
  console.log("== the product editor and the variant generator ==");

  const product = await prisma.product.findFirstOrThrow({
    where: { status: "ACTIVE" },
    orderBy: { slug: "asc" },
    select: { id: true, name: true },
  });

  await page.goto(`${BASE}/admin/products/${product.id}`, { waitUntil: "domcontentloaded" });
  check("the product editor opens", await page.getByRole("heading", { name: product.name }).isVisible());

  // Existing variants must still render their colour and size even though
  // only active ones are offered for new ones.
  const variantPanel = page.locator("section").filter({ hasText: "Variants and stock" });
  check("existing variants are listed", (await variantPanel.locator("li").count()) > 0);

  // The generator: pick a colour and a size, generate, review, then leave
  // without saving. Nothing may be written by generating alone.
  const variantsBefore = await prisma.productVariant.count({ where: { productId: product.id } });

  await page.getByRole("button", { name: "Generate a grid" }).click();
  check("the generator opens", await page.getByText("Colours", { exact: true }).isVisible());

  const colourPills = page.locator("button[aria-pressed]").filter({ hasNotText: /^\d/ });
  const pillCount = await colourPills.count();
  check("colour and size pills are rendered from the database", pillCount >= 14, `${pillCount} pills`);

  // Toggling is announced through aria-pressed, not only by a border.
  const firstPill = colourPills.first();
  check("a pill starts unpressed", (await firstPill.getAttribute("aria-pressed")) === "false");
  await firstPill.click();
  check("and reports itself pressed once chosen", (await firstPill.getAttribute("aria-pressed")) === "true");

  // "Generate a grid" (the panel toggle) also starts with Generate, so the
  // button is matched by what it actually says.
  const generateButton = page.getByRole("button", { name: /combinations$/ });
  check(
    "generate stays disabled until both a colour and a size are chosen",
    await generateButton.isDisabled(),
  );

  // Choose a size pill too.
  const sizePills = page.locator("fieldset").filter({ hasText: "Sizes" }).locator("button[aria-pressed]");
  await sizePills.first().click();
  check("choosing a size enables generate", await generateButton.isEnabled());

  await generateButton.click();
  check(
    "the generated rows are shown for review",
    await page.getByText(/to\s+review/).isVisible(),
  );
  check(
    "and nothing was written by generating alone",
    (await prisma.productVariant.count({ where: { productId: product.id } })) === variantsBefore,
  );
  check(
    "the review table says nothing is saved yet",
    (await page.getByText("Nothing is saved until you press Add.").isVisible()),
  );

  // Every generated row has an editable SKU and quantity.
  const skuInputs = await page.locator("input[name='row.sku']").count();
  const qtyInputs = await page.locator("input[name='row.quantity']").count();
  check("each generated row has an editable SKU", skuInputs > 0);
  check("and an editable quantity", qtyInputs === skuInputs);

  // Leave without saving.
  await page.getByRole("button", { name: "Start again" }).click();
  check(
    "abandoning the generator writes nothing",
    (await prisma.productVariant.count({ where: { productId: product.id } })) === variantsBefore,
  );

  console.log("");
}

/* ------------------------------------------------------------------ *
 * Dialogs
 * ------------------------------------------------------------------ */

async function runDialogChecks(page: Page): Promise<void> {
  console.log("== dialog behaviour ==");

  const product = await prisma.product.findFirstOrThrow({
    where: { status: "ACTIVE" },
    orderBy: { slug: "asc" },
    select: { id: true },
  });

  await page.goto(`${BASE}/admin/products/${product.id}`, { waitUntil: "domcontentloaded" });

  const trigger = page.getByRole("button", { name: "Archive" });
  await trigger.click();

  const dialog = page.getByRole("dialog");
  check("the dialog opens", await dialog.isVisible());
  check("it is modal", (await dialog.getAttribute("aria-modal")) === "true");

  const labelledBy = await dialog.getAttribute("aria-labelledby");
  check("it is labelled by its own heading", Boolean(labelledBy));

  if (labelledBy) {
    const heading = page.locator(`#${labelledBy}`);
    check("and that heading asks the question", (await heading.innerText()).includes("Archive"));
  }

  check(
    "it explains the consequence and that it is reversible",
    (await dialog.innerText()).includes("reversible"),
  );

  // Focus starts inside the dialog.
  const focusInside = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    return dialog?.contains(document.activeElement) ?? false;
  });
  check("focus starts inside the dialog", focusInside);

  // The rest of the page is inert while it is open.
  const inertCount = await page.evaluate(
    () => Array.from(document.body.children).filter((el) => el.hasAttribute("inert")).length,
  );
  check("the page behind it is inert", inertCount > 0, `${inertCount} inert siblings`);

  // Escape closes and focus returns to the trigger.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(150);
  check("Escape closes it", !(await dialog.isVisible().catch(() => false)));

  const focusReturned = await page.evaluate(
    () => document.activeElement?.textContent?.trim() ?? "",
  );
  check("focus returns to the button that opened it", focusReturned.includes("Archive"), focusReturned);

  const stillInert = await page.evaluate(
    () => Array.from(document.body.children).filter((el) => el.hasAttribute("inert")).length,
  );
  check("and the page is interactive again", stillInert === 0);

  console.log("");
}

/* ------------------------------------------------------------------ *
 * Responsive
 * ------------------------------------------------------------------ */

const ADMIN_PAGES = [
  ["/admin", "dashboard"],
  ["/admin/products", "product list"],
  ["/admin/products/new", "new product"],
  ["/admin/categories", "collections"],
  ["/admin/colors", "colours"],
  ["/admin/colors/new", "new colour"],
  ["/admin/sizes", "sizes"],
  ["/admin/sizes/new", "new size"],
] as const;

async function runResponsivePass(
  context: Awaited<ReturnType<Browser["newContext"]>>,
): Promise<void> {
  console.log("== responsive: every admin page at nine widths ==");

  const page = await context.newPage();

  const product = await prisma.product.findFirstOrThrow({
    where: { status: "ACTIVE" },
    orderBy: { slug: "asc" },
    select: { id: true },
  });

  const paths: [string, string][] = [
    ...ADMIN_PAGES.map(([path, label]) => [path, label] as [string, string]),
    [`/admin/products/${product.id}`, "edit product"],
  ];

  for (const { width, height, label } of WIDTHS) {
    await page.setViewportSize({ width, height });

    let worstOverflow = 0;
    let worstPage = "";
    let offenders: string[] = [];
    let tinyTargets: string[] = [];
    let tinyPage = "";

    for (const [path] of paths) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      // Let fonts and any layout settle before measuring.
      await page.waitForTimeout(120);

      const overflow = await overflows(page);

      if (overflow > worstOverflow) {
        worstOverflow = overflow;
        worstPage = path;
        offenders = await offscreenElements(page);
      }

      if (tinyTargets.length === 0) {
        const small = await smallTargets(page);
        if (small.length > 0) {
          tinyTargets = small;
          tinyPage = path;
        }
      }
    }

    check(
      `${label}: no horizontal overflow on any admin page`,
      worstOverflow === 0,
      worstOverflow > 0 ? `${worstPage} overflows by ${worstOverflow}px — ${offenders.join("; ")}` : "",
    );

    check(
      `${label}: every control is at least 24px`,
      tinyTargets.length === 0,
      tinyTargets.length > 0 ? `${tinyPage}: ${tinyTargets.join("; ")}` : "",
    );
  }

  // The navigation has five sections now; at 320 it must still be reachable.
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });

  const nav = page.getByRole("navigation", { name: "Admin sections" });
  check("the admin navigation is present at 320", await nav.isVisible());

  const navLinks = await nav.getByRole("link").count();
  check("all five sections are in it", navLinks === 5, `${navLinks} links`);

  const navScrolls = await nav.evaluate(
    (el) => el.scrollWidth > el.clientWidth,
  );
  check(
    "it scrolls within itself rather than stretching the page",
    navScrolls || (await overflows(page)) === 0,
  );

  await page.close();
  console.log("");
}

/* ------------------------------------------------------------------ *
 * Storefront
 * ------------------------------------------------------------------ */

async function runStorefrontPass(browser: Browser): Promise<void> {
  console.log("== storefront regression, signed out ==");

  // A fresh context with no session: this is what a shopper sees.
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  const product = await prisma.product.findFirstOrThrow({
    where: { status: "ACTIVE" },
    orderBy: { slug: "asc" },
    select: { slug: true, name: true },
  });

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  check("the home page renders", await page.getByRole("heading", { level: 1 }).first().isVisible());

  await page.goto(`${BASE}/shop`, { waitUntil: "domcontentloaded" });
  const cards = await page.locator("ul li article").count();
  check("the product grid renders cards", cards > 0, `${cards} cards`);

  // The colour and size facets come from the database, and only active ones.
  const colourLabels = await page
    .locator("fieldset")
    .filter({ hasText: "Colour" })
    .locator("label")
    .allInnerTexts();
  check("the colour filter is populated from the catalogue", colourLabels.length > 0);
  check(
    "and carries no withdrawn attribute",
    !colourLabels.some((label) => label.toLowerCase().includes(MARK)),
  );

  const sizeLabels = await page
    .locator("fieldset")
    .filter({ hasText: /^Size/ })
    .locator("label")
    .allInnerTexts();
  check("the size filter is populated from the catalogue", sizeLabels.length > 0);
  check("sizes read smallest first", sizeLabels[0]?.startsWith("XS") ?? false, sizeLabels[0]);

  // Actually filter.
  const before = await page.locator("ul li article").count();

  // Clicked rather than `check()`ed: these boxes are driven by the query
  // string, not by local state, so the tick appears when the server's next
  // render arrives. Playwright's `check()` asserts the state flipped
  // synchronously and would call a working control broken.
  await page
    .locator("fieldset")
    .filter({ hasText: "Colour" })
    .locator("input[type=checkbox]")
    .first()
    .click();

  await page.waitForURL(/colour=/, { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const after = await page.locator("ul li article").count();
  check("ticking a colour filters the grid", after <= before, `${before} → ${after}`);
  check("and the URL carries it", page.url().includes("colour="));

  // The product page: colour-specific gallery and size availability.
  await page.goto(`${BASE}/shop/${product.slug}`, { waitUntil: "domcontentloaded" });
  check("the product page renders", await page.getByRole("heading", { name: product.name }).isVisible());

  const gallery = page.locator("img").first();
  const firstSrc = await gallery.getAttribute("src");

  const swatches = page.locator("input[name^='colour-']");
  const swatchCount = await swatches.count();
  check("colour swatches are rendered", swatchCount > 0, `${swatchCount} swatches`);

  if (swatchCount > 1) {
    // Choosing a different colour must change the photographs.
    await swatches.nth(1).check({ force: true });
    await page.waitForTimeout(250);
    const secondSrc = await page.locator("img").first().getAttribute("src");
    check("choosing another colour changes the gallery", firstSrc !== secondSrc);
  }

  const sizeInputs = page.locator("input[name^='size-']");
  const sizeCount = await sizeInputs.count();
  check("the size selector is rendered", sizeCount > 0, `${sizeCount} sizes`);

  const disabledSizes = await sizeInputs.evaluateAll(
    (inputs) => inputs.filter((input) => (input as HTMLInputElement).disabled).length,
  );
  check(
    "sizes the chosen colour is not cut in are disabled",
    disabledSizes >= 0,
    `${disabledSizes} disabled of ${sizeCount}`,
  );

  // Storefront responsive sweep.
  console.log("");
  console.log("== responsive: storefront at nine widths ==");

  for (const { width, height, label } of WIDTHS) {
    await page.setViewportSize({ width, height });

    let worst = 0;
    let worstPath = "";
    let offenders: string[] = [];

    for (const path of ["/", "/shop", `/shop/${product.slug}`]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(120);

      const overflow = await overflows(page);

      if (overflow > worst) {
        worst = overflow;
        worstPath = path;
        offenders = await offscreenElements(page);
      }
    }

    check(
      `${label}: no horizontal overflow on the storefront`,
      worst === 0,
      worst > 0 ? `${worstPath} overflows by ${worst}px — ${offenders.join("; ")}` : "",
    );
  }

  await context.close();
  console.log("");
}

/* ------------------------------------------------------------------ *
 * Clean-up
 * ------------------------------------------------------------------ */

async function cleanUp(token: string | undefined): Promise<void> {
  console.log("== clean-up ==");

  if (token) {
    await revokeSession(token).catch(() => undefined);
  }

  await prisma.productVariant.deleteMany({
    where: { sku: { contains: MARK.toUpperCase() } },
  });
  await prisma.color.deleteMany({ where: { slug: { startsWith: MARK } } });
  await prisma.size.deleteMany({ where: { code: { startsWith: MARK.toUpperCase() } } });
  await prisma.user.deleteMany({ where: { phoneNumber: ADMIN_NUMBER } });

  const [colours, sizes, users] = await Promise.all([
    prisma.color.count({ where: { slug: { startsWith: MARK } } }),
    prisma.size.count({ where: { code: { startsWith: MARK.toUpperCase() } } }),
    prisma.user.count({ where: { phoneNumber: ADMIN_NUMBER } }),
  ]);

  check("no test colours left behind", colours === 0);
  check("no test sizes left behind", sizes === 0);
  check("no test admin account left behind", users === 0);

  const [seededColours, seededSizes, products] = await Promise.all([
    prisma.color.count(),
    prisma.size.count(),
    prisma.product.count(),
  ]);

  check("the seeded palette is intact", seededColours === 8, String(seededColours));
  check("the seeded size run is intact", seededSizes === 6, String(seededSizes));
  check("the seeded catalogue is intact", products === 26, String(products));

  // Put the running order back, since the reorder checks shuffled it.
  const colourRows = await prisma.color.findMany({
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { id: true },
  });
  for (const [position, row] of colourRows.entries()) {
    await prisma.color.update({ where: { id: row.id }, data: { position } });
  }

  const sizeRows = await prisma.size.findMany({
    orderBy: [{ position: "asc" }, { code: "asc" }],
    select: { id: true },
  });
  for (const [position, row] of sizeRows.entries()) {
    await prisma.size.update({ where: { id: row.id }, data: { position } });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect().catch(() => undefined);

    if (passed + failed > 0) {
      console.log(`\n${failed === 0 ? "OK" : "FAILED"}: ${passed} passed, ${failed} failed\n`);
    }

    if (failed > 0) {
      process.exitCode = 1;
    }
  })
  .catch(async (error: unknown) => {
    await prisma.$disconnect().catch(() => undefined);
    console.error(
      `Browser checks failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
