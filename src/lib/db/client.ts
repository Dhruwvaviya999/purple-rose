import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";
import { databaseUrl } from "@/lib/env.server";

/**
 * The single Prisma Client for the application.
 *
 * Prisma 7 has no native query engine: every SQL connection goes through a
 * driver adapter. `@prisma/adapter-pg` speaks the standard PostgreSQL wire
 * protocol, which Neon serves, so the same code path covers Neon in production
 * and any PostgreSQL instance a developer points at locally.
 *
 * Connection management is left to Neon's own pooled endpoint. Nothing extra
 * is layered on top of it.
 */
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: databaseUrl(),
    // Serverless invocations are short-lived and many may run at once, so each
    // instance keeps a small pool and releases idle sockets quickly. Neon's
    // pooler is what actually absorbs concurrency.
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });

  return new PrismaClient({
    adapter,
    // Never `query` in production: statements can carry customer data.
    log: process.env.NODE_ENV === "production" ? ["error"] : ["warn", "error"],
  });
}

/**
 * A module is re-evaluated on every hot reload in development, which would
 * open a new pool each time and exhaust the database. The instance is cached
 * on `globalThis`, which survives reloads, in development only.
 */
const globalForPrisma = globalThis as unknown as {
  purpleRosePrisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.purpleRosePrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.purpleRosePrisma = prisma;
}
