/**
 * Database seed.
 *
 * Run with `pnpm db:seed`. Safe to run repeatedly: every write is an upsert
 * keyed on a natural unique column, so a second run changes nothing.
 *
 * This script deliberately does NOT import `src/lib/db/client.ts`. That module
 * is marked `server-only` for the Next.js compiler and holds a long-lived
 * singleton meant for request handling. A CLI script runs outside Next and
 * should own its connection, so it builds a client and closes it again.
 *
 * Two things are seeded: the catalogue, and optionally one administrator.
 *
 * The catalogue lives in `./catalog/data.ts` (what it contains) and
 * `./catalog/seed.ts` (how it is written). It is development content: real
 * garment names, real prices and real relationships, with placeholder
 * photography that is replaced by swapping the URLs in one file.
 *
 * There is still no customer data here, and there never will be. Inventing
 * people would be inventing people.
 *
 * This is the only sanctioned way to create an administrator. Roles are never
 * accepted from a request, so no sign-in, form or URL can grant ADMIN; it is
 * set here, by an operator who already controls the environment and the
 * database, or by a direct database change.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { Role } from "../src/generated/prisma/enums";
import { normalisePhoneNumber } from "../src/lib/auth/phone";
import { seedCatalog } from "./catalog/seed";

/** Optional. When unset, the admin step is skipped rather than guessed. */
const ADMIN_PHONE_ENV = "SEED_ADMIN_PHONE_NUMBER";

function requireDatabaseUrl(): string {
  const value = process.env.DATABASE_URL?.trim();

  if (!value) {
    throw new Error(
      "Missing required environment variable DATABASE_URL. " +
        "Copy .env.example to .env.local and set it before seeding.",
    );
  }

  return value;
}

async function seedAdminUser(prisma: PrismaClient): Promise<void> {
  const configured = process.env[ADMIN_PHONE_ENV]?.trim();

  if (!configured) {
    console.info(
      `- admin user: skipped, ${ADMIN_PHONE_ENV} is not set. ` +
        `Set it to an E.164 number (for example +919876543210) to create one.`,
    );
    return;
  }

  // Normalised with exactly the same function the sign-in flow uses. Storing
  // the raw value would create a row that no sign-in could ever match: someone
  // typing that number would be normalised to a different string, miss this
  // row, and be given a fresh CUSTOMER account instead.
  const phone = normalisePhoneNumber(configured);

  if (!phone) {
    throw new Error(
      `${ADMIN_PHONE_ENV} is not a valid phone number. ` +
        `Use international format, for example +919876543210.`,
    );
  }

  const user = await prisma.user.upsert({
    where: { phoneNumber: phone.e164 },
    // An existing row keeps its name; only the role is asserted, so a re-run
    // never overwrites something a person has since set.
    update: { role: Role.ADMIN },
    create: { phoneNumber: phone.e164, role: Role.ADMIN },
    select: { id: true, phoneNumber: true, role: true },
  });

  console.info(`- admin user: ${user.role} ready for ${user.phoneNumber}`);
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: requireDatabaseUrl() });
  const prisma = new PrismaClient({ adapter });

  try {
    console.info("Seeding Purple Rose database...");

    await seedAdminUser(prisma);

    const written = await seedCatalog(prisma);
    console.info(
      `- catalogue: ${written.categories} categories, ${written.sizes} sizes, ` +
        `${written.colors} colours, ${written.products} products, ` +
        `${written.variants} variants, ${written.images} images`,
    );

    // Counted back out of the database rather than reported from the input, so
    // the numbers below are what is actually stored. Running the seed twice
    // has to print the same line both times.
    const [users, categories, products, active, variants, inStock, images] =
      await Promise.all([
        prisma.user.count(),
        prisma.category.count(),
        prisma.product.count(),
        prisma.product.count({ where: { status: "ACTIVE" } }),
        prisma.productVariant.count(),
        prisma.inventory.count({ where: { quantity: { gt: 0 } } }),
        prisma.productImage.count(),
      ]);

    console.info(
      `Done. users=${users} categories=${categories} products=${products} ` +
        `(active=${active}) variants=${variants} in-stock=${inStock} images=${images}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Print the reason without a stack dump of connection internals.
  console.error(
    `Seed failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
