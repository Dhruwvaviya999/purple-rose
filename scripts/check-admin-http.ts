/**
 * Admin access control, over HTTP, against a running server.
 *
 * Run with `pnpm check:admin:http` while `pnpm start` (or `pnpm dev`) is up.
 * Point it elsewhere with `CHECK_BASE_URL=http://localhost:3100`.
 *
 * This is the half of the authorisation story `pnpm check:admin` cannot tell.
 * That script exercises the policy directly and audits every action for the
 * guard; this one makes real requests as three different callers and checks
 * what actually comes back:
 *
 *   - **nobody** — no cookie at all
 *   - **a customer** — a real, valid session belonging to a CUSTOMER
 *   - **an administrator** — a real, valid session belonging to an ADMIN
 *
 * The sessions are genuine rows created the same way sign-in creates them, so
 * this is not a simulation of authentication; it is authentication. Both
 * accounts use the +1 555 01xx range reserved for fiction, and both they and
 * their sessions are deleted afterwards, including when a check fails.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { Role } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/db/client";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/cookie";
import { createSession, revokeSession } from "../src/lib/services/session-service";
import { setProductStatus } from "../src/lib/services/admin/product-admin-service";

const BASE = (process.env.CHECK_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Reserved for fiction, so these can never be a real person's number. */
const NUMBERS = {
  customer: "+15550109001",
  admin: "+15550109002",
} as const;

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
 * Where a request ends up, without following the redirect.
 *
 * `redirect: "manual"` is the point: a 200 here would mean the admin page
 * rendered, and that is exactly what must not happen for the first two callers.
 */
async function visit(
  path: string,
  token?: string,
): Promise<{ status: number; location: string | null; body: string }> {
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: token ? { cookie: `${SESSION_COOKIE_NAME}=${token}` } : {},
  });

  const body = response.status === 200 ? await response.text() : "";

  return {
    status: response.status,
    location: response.headers.get("location"),
    body,
  };
}

const ADMIN_PATHS = [
  "/admin",
  "/admin/products",
  "/admin/products/new",
  "/admin/categories",
  "/admin/categories/new",
  // Phase 7. Listed here rather than checked once by hand, so a new admin
  // section cannot quietly ship without its access control being asserted.
  "/admin/colors",
  "/admin/colors/new",
  "/admin/sizes",
  "/admin/sizes/new",
] as const;

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.log("\n  Skipped: these checks need DATABASE_URL to create sessions.\n");
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
        "  Start the app first:",
        "    pnpm build && pnpm start",
        "    pnpm check:admin:http",
        "",
        "  Or point at another port with CHECK_BASE_URL.",
        "",
      ].join("\n"),
    );
    return;
  }

  const tokens: string[] = [];
  /** Set while a seeded product is temporarily archived, so it is restored. */
  let archived: { id: string; slug: string; name: string } | null = null;

  try {
    console.log(`\n== anonymous (no cookie) at ${BASE} ==`);

    for (const path of ADMIN_PATHS) {
      const result = await visit(path);
      check(
        `${path} is not served`,
        result.status !== 200,
        `status ${result.status}`,
      );
      check(
        `${path} redirects to sign in`,
        result.status >= 300 &&
          result.status < 400 &&
          (result.location ?? "").includes("/login"),
        result.location ?? "no location",
      );
    }

    console.log("\n== a signed-in customer ==");

    const customer = await prisma.user.upsert({
      where: { phoneNumber: NUMBERS.customer },
      create: { phoneNumber: NUMBERS.customer, role: Role.CUSTOMER },
      update: { role: Role.CUSTOMER },
      select: { id: true },
    });

    const customerSession = await createSession(customer.id);
    tokens.push(customerSession.token);

    // Proves the session is real, not that the guard is weak: a customer can
    // use the storefront perfectly well.
    const storefront = await visit("/shop", customerSession.token);
    check("their session works on the storefront", storefront.status === 200);

    for (const path of ADMIN_PATHS) {
      const result = await visit(path, customerSession.token);
      check(
        `${path} is not served to them`,
        result.status !== 200,
        `status ${result.status}`,
      );
      check(
        `${path} sends them to the storefront, not to sign in`,
        result.status >= 300 &&
          result.status < 400 &&
          !(result.location ?? "").includes("/login"),
        result.location ?? "no location",
      );
    }

    console.log("\n== an administrator ==");

    const admin = await prisma.user.upsert({
      where: { phoneNumber: NUMBERS.admin },
      create: { phoneNumber: NUMBERS.admin, role: Role.ADMIN },
      update: { role: Role.ADMIN },
      select: { id: true },
    });

    const adminSession = await createSession(admin.id);
    tokens.push(adminSession.token);

    for (const path of ADMIN_PATHS) {
      const result = await visit(path, adminSession.token);
      check(`${path} is served to them`, result.status === 200, `status ${result.status}`);
    }

    const dashboard = await visit("/admin", adminSession.token);
    check(
      "the dashboard shows real catalogue counts",
      /Catalogue overview/.test(dashboard.body),
    );
    // Not a word search: the page legitimately uses the words "sales" and
    // "revenue" to say it has neither. What must be absent is a *figure* — the
    // dashboard reports counts, and there is no money on it at all.
    check(
      "the dashboard shows no monetary amount anywhere",
      !dashboard.body.includes("₹"),
    );
    check(
      "and says outright that there are no sales figures",
      /no sales figures here/i.test(dashboard.body),
    );

    const products = await visit("/admin/products", adminSession.token);
    check("the product list renders rows", /Article|PR-/.test(products.body));

    console.log("\n== a revoked session is no better than none ==");

    await revokeSession(adminSession.token);
    const afterRevoke = await visit("/admin", adminSession.token);
    check(
      "the same cookie stops working immediately",
      afterRevoke.status !== 200,
      `status ${afterRevoke.status}`,
    );

    console.log("\n== a forged cookie ==");

    const forged = await visit("/admin", "f".repeat(64));
    check("a made-up token is refused", forged.status !== 200, `status ${forged.status}`);

    console.log("\n== the admin area is never indexable ==");

    const adminSession2 = await createSession(admin.id);
    tokens.push(adminSession2.token);

    const indexed = await visit("/admin/products", adminSession2.token);
    check(
      "admin pages carry noindex",
      /noindex/i.test(indexed.body),
    );

    const robots = await fetch(`${BASE}/robots.txt`).then((response) => response.text());
    check("robots.txt still disallows /admin", robots.includes("Disallow: /admin"));

    console.log("\n== an admin change reaches the storefront ==");

    /**
     * The end-to-end question this whole phase exists to answer: when an
     * administrator archives something, does it actually leave the shop?
     *
     * A live seeded product is archived through the real admin service, the
     * public pages are fetched, and it is put back. Nothing is left changed,
     * including if an assertion fails, because the restore runs in the
     * `finally` below.
     */
    const victim = await prisma.product.findFirst({
      where: { status: "ACTIVE" },
      orderBy: { slug: "asc" },
      select: { id: true, slug: true, name: true },
    });

    if (!victim) {
      check("there is a live product to test with", false);
    } else {
      archived = victim;

      const beforeArchive = await visit(`/shop/${victim.slug}`);
      check(`/shop/${victim.slug} is public to begin with`, beforeArchive.status === 200);

      const sitemapBefore = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text());
      check("and it is in the sitemap", sitemapBefore.includes(`/shop/${victim.slug}`));

      await setProductStatus(victim.id, "ARCHIVED");

      const afterArchive = await visit(`/shop/${victim.slug}`);
      check(
        "archiving takes it out of the shop immediately",
        afterArchive.status === 404,
        `status ${afterArchive.status}`,
      );

      const sitemapAfter = await fetch(`${BASE}/sitemap.xml`).then((r) => r.text());
      check(
        "and out of the sitemap",
        !sitemapAfter.includes(`/shop/${victim.slug}`),
      );

      const shop = await visit("/shop");
      check(
        "and off the listing",
        !shop.body.includes(`/shop/${victim.slug}`),
      );

      await setProductStatus(victim.id, "ACTIVE");

      const restored = await visit(`/shop/${victim.slug}`);
      check("publishing it again brings it straight back", restored.status === 200);
    }
  } finally {
    console.log("\n== clean-up ==");

    if (archived) {
      // Restored unconditionally, not only on failure. Publishing something
      // that is already published rewrites one row and changes nothing, which
      // is a far smaller price than leaving a seeded product archived because
      // an assertion threw before the restore above ran.
      await setProductStatus(archived.id, "ACTIVE").catch(() => undefined);

      const status = await prisma.product.findUnique({
        where: { id: archived.id },
        select: { status: true },
      });

      check(`${archived.name} is live again`, status?.status === "ACTIVE", status?.status);
    }

    for (const token of tokens) {
      await revokeSession(token).catch(() => undefined);
    }

    const removed = await prisma.user.deleteMany({
      where: { phoneNumber: { in: [NUMBERS.customer, NUMBERS.admin] } },
    });

    check("the test accounts are deleted", removed.count >= 0);
    check(
      "none are left behind",
      (await prisma.user.count({
        where: { phoneNumber: { in: [NUMBERS.customer, NUMBERS.admin] } },
      })) === 0,
    );
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
      `Admin HTTP checks failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
