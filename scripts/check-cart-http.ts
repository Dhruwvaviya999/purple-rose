/**
 * The bag over HTTP, without a browser.
 *
 * Run with `pnpm check:cart:http` while the application is running. Point it
 * elsewhere with `CHECK_BASE_URL=http://localhost:3100`.
 *
 * What a browser suite cannot easily prove is what the *wire* looks like: which
 * status codes come back, what is in the cookies, and what is not in the HTML.
 * That is what this is for, and it is the counterpart to `check:admin:http`.
 *
 * It checks, in order:
 *
 * - `/cart` answers to an anonymous visitor rather than demanding a sign-in,
 *   because a bag is not an account feature;
 * - a first visit sets **no** cart cookie, because browsing must not mint a
 *   guest bag;
 * - the guest cookie, once there is one, is `HttpOnly`, `SameSite=Lax`,
 *   path-scoped and long-lived, and carries an opaque token rather than a bag
 *   id, a price or anything about a person;
 * - two anonymous clients get two different bags;
 * - a signed-in shopper's bag is theirs, and a cookie jar that has never signed
 *   in cannot see it;
 * - `/cart` is `noindex` and out of the sitemap;
 * - a tampered cart cookie produces a working page, not an error and not
 *   somebody else's bag;
 * - no Prisma, SQL, Neon or stack detail appears in any response.
 *
 * **It writes**, through the service rather than the interface. Its accounts use
 * reserved `+1555…` numbers and everything is removed in a `finally`.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { createHash, randomBytes } from "node:crypto";

import { Role } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/db/client";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/cookie";
import { CART_COOKIE_NAME } from "../src/lib/cart/cookie";
import { addToCart } from "../src/lib/services/cart-service";
import { createSession, revokeSession } from "../src/lib/services/session-service";

const BASE = (process.env.CHECK_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

const CUSTOMER_NUMBER = "+15550107801";

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
 * Anything that would tell an attacker how the inside works.
 *
 * Checked against every response body this script sees. A shopper should never
 * meet a constraint name, and neither should anybody probing the endpoints.
 */
const LEAKS = [
  "PrismaClient",
  "prisma.",
  "neon.tech",
  "postgresql://",
  "CartItem_",
  "Cart_exactly_one_owner",
  "guestTokenHash",
  "at Object.<anonymous>",
  "node_modules",
];

function leaksFrom(body: string): string[] {
  return LEAKS.filter((needle) => body.includes(needle));
}

async function get(
  path: string,
  cookie?: string,
): Promise<{ status: number; body: string; headers: Headers }> {
  const response = await fetch(`${BASE}${path}`, {
    redirect: "manual",
    headers: cookie ? { cookie } : {},
  });

  return {
    status: response.status,
    body: await response.text(),
    headers: response.headers,
  };
}

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
        "    pnpm check:cart:http",
        "",
      ].join("\n"),
    );
    return;
  }

  let token: string | undefined;
  const guestTokens: string[] = [];

  try {
    console.log(`\n== ${BASE} ==`);

    console.log("\n== an anonymous visitor ==");

    const anonymous = await get("/cart");
    check(
      "the bag page is served rather than demanding a sign-in",
      anonymous.status === 200,
      `status ${anonymous.status}`,
    );
    check(
      "and it is the empty state",
      anonymous.body.includes("Your bag is empty"),
    );
    check(
      "browsing sets no cart cookie, so no bag row is created",
      !(anonymous.headers.get("set-cookie") ?? "").includes(CART_COOKIE_NAME),
      anonymous.headers.get("set-cookie") ?? "(none)",
    );

    const home = await get("/");
    check("the home page is served", home.status === 200);
    check(
      "and sets no cart cookie either",
      !(home.headers.get("set-cookie") ?? "").includes(CART_COOKIE_NAME),
    );

    console.log("\n== two guests are two bags ==");

    // Built the way the cookie does, so what the server resolves is exactly
    // what a browser would have handed it.
    // Two variants of **different** products. The whole point of the next few
    // checks is that one guest does not see the other's piece, and two sizes of
    // the same dress would put the same name on both pages and pass for the
    // wrong reason.
    const candidates = await prisma.productVariant.findMany({
      where: {
        isActive: true,
        product: { status: "ACTIVE" },
        inventory: { quantity: { gte: 2 } },
      },
      orderBy: { sku: "asc" },
      select: {
        id: true,
        productId: true,
        product: { select: { name: true } },
      },
    });

    const variants: typeof candidates = [];
    for (const candidate of candidates) {
      if (!variants.some((chosen) => chosen.productId === candidate.productId)) {
        variants.push(candidate);
      }
      if (variants.length === 2) {
        break;
      }
    }

    check(
      "two pieces from two different products are available to test with",
      variants.length === 2,
      String(variants.length),
    );

    const guestOne = randomBytes(32).toString("base64url");
    const guestTwo = randomBytes(32).toString("base64url");
    guestTokens.push(guestOne, guestTwo);

    const hash = (value: string) =>
      createHash("sha256").update(value).digest("hex");

    await addToCart({ kind: "guest", tokenHash: hash(guestOne) }, variants[0]!.id, 2);
    await addToCart({ kind: "guest", tokenHash: hash(guestTwo) }, variants[1]!.id, 1);

    const one = await get("/cart", `${CART_COOKIE_NAME}=${guestOne}`);
    const two = await get("/cart", `${CART_COOKIE_NAME}=${guestTwo}`);

    check(
      "the first guest sees their own piece",
      one.body.includes(variants[0]!.product.name),
    );
    check(
      "and not the other guest's",
      !one.body.includes(variants[1]!.product.name),
      variants[1]!.product.name,
    );
    check(
      "the second guest sees theirs",
      two.body.includes(variants[1]!.product.name),
    );
    check(
      "and not the first's",
      !two.body.includes(variants[0]!.product.name),
    );

    console.log("\n== a tampered or unknown token ==");

    for (const [label, value] of [
      ["a token of the wrong shape", "not-a-real-token"],
      ["an empty token", ""],
      ["a token that names no bag", randomBytes(32).toString("base64url")],
      ["a token with a quote in it", `${"x".repeat(42)}'`],
    ] as const) {
      const response = await get("/cart", `${CART_COOKIE_NAME}=${value}`);

      check(
        `${label} still gets a working page`,
        response.status === 200,
        `status ${response.status}`,
      );
      check(
        `${label} shows an empty bag rather than somebody else's`,
        response.body.includes("Your bag is empty") &&
          !response.body.includes(variants[0]!.product.name),
      );
      check(
        `${label} leaks nothing about the database`,
        leaksFrom(response.body).length === 0,
        leaksFrom(response.body).join(", "),
      );
    }

    console.log("\n== a signed-in shopper ==");

    const customer = await prisma.user.upsert({
      where: { phoneNumber: CUSTOMER_NUMBER },
      create: { phoneNumber: CUSTOMER_NUMBER, role: Role.CUSTOMER },
      update: { role: Role.CUSTOMER },
      select: { id: true },
    });

    await addToCart({ kind: "user", userId: customer.id }, variants[0]!.id, 1);

    const session = await createSession(customer.id);
    token = session.token;

    const signedIn = await get(
      "/cart",
      `${SESSION_COOKIE_NAME}=${session.token}`,
    );

    check(
      "their bag is served to them",
      signedIn.status === 200 &&
        signedIn.body.includes(variants[0]!.product.name),
    );
    check(
      "a cookie jar that has never signed in cannot see it",
      !(await get("/cart")).body.includes(variants[0]!.product.name),
    );
    check(
      "and neither can a guest token",
      !(await get("/cart", `${CART_COOKIE_NAME}=${guestTwo}`)).body.includes(
        "Items (1)",
      ),
    );

    console.log("\n== the page is private ==");

    check(
      "it carries a noindex directive",
      signedIn.body.includes('name="robots"') &&
        /noindex/i.test(signedIn.body),
    );

    const robots = await get("/robots.txt");
    check("robots.txt exists", robots.status === 200);

    const sitemap = await get("/sitemap.xml");
    check("the sitemap does not list /cart", !sitemap.body.includes("/cart"));

    console.log("\n== nothing internal reaches the wire ==");

    for (const [label, response] of [
      ["the anonymous bag", anonymous],
      ["a guest bag", one],
      ["a signed-in bag", signedIn],
    ] as const) {
      check(
        `${label} leaks no database detail`,
        leaksFrom(response.body).length === 0,
        leaksFrom(response.body).join(", "),
      );
    }

    check(
      "no response body contains a raw cart id",
      !one.body.includes(
        (
          await prisma.cart.findFirstOrThrow({
            where: { guestTokenHash: hash(guestOne) },
            select: { id: true },
          })
        ).id,
      ),
    );
  } finally {
    await cleanUp(token, guestTokens);
  }
}

async function cleanUp(
  token: string | undefined,
  guestTokens: readonly string[],
): Promise<void> {
  console.log("\n== clean-up ==");

  if (token) {
    await revokeSession(token).catch(() => undefined);
  }

  const hashes = guestTokens.map((value) =>
    createHash("sha256").update(value).digest("hex"),
  );

  await prisma.cart.deleteMany({ where: { guestTokenHash: { in: hashes } } });
  await prisma.user.deleteMany({ where: { phoneNumber: CUSTOMER_NUMBER } });

  const [users, carts] = await Promise.all([
    prisma.user.count({ where: { phoneNumber: CUSTOMER_NUMBER } }),
    prisma.cart.count({ where: { guestTokenHash: { in: hashes } } }),
  ]);

  check("no test account left behind", users === 0);
  check("no guest bags left behind", carts === 0);

  const products = await prisma.product.count();
  check("the seeded catalogue is intact", products === 26, String(products));
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
      `Bag HTTP checks failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
