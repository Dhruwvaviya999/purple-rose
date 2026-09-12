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
 * There is no product, category or customer data here. The catalogue does not
 * exist yet, and inventing sample records would misrepresent what the store
 * actually contains.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { Role } from "../src/generated/prisma/enums";

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
  const phoneNumber = process.env[ADMIN_PHONE_ENV]?.trim();

  if (!phoneNumber) {
    console.info(
      `- admin user: skipped, ${ADMIN_PHONE_ENV} is not set. ` +
        `Set it to an E.164 number (for example +919876543210) to create one.`,
    );
    return;
  }

  const user = await prisma.user.upsert({
    where: { phoneNumber },
    // An existing row is left alone apart from its role, so a re-run never
    // overwrites a name someone has since set.
    update: { role: Role.ADMIN },
    create: { phoneNumber, role: Role.ADMIN, name: "Purple Rose Admin" },
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

    const userCount = await prisma.user.count();
    console.info(`Done. users=${userCount}`);
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
