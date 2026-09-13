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

function getPrismaClient(): PrismaClient {
  const existing = globalForPrisma.purpleRosePrisma;

  if (existing) {
    return existing;
  }

  const client = createPrismaClient();

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.purpleRosePrisma = client;
  }

  return client;
}

/**
 * Construction is deferred until the first query.
 *
 * Importing this module must never require a database, because `next build`
 * loads every route module to collect its metadata, and Prisma Client is also
 * generated during builds that have no `DATABASE_URL` at all. Building the
 * client eagerly would make a missing connection string a build failure
 * instead of a runtime condition the health endpoint can report.
 *
 * The proxy forwards to the real client on first use and binds methods to it,
 * so callers see an ordinary `PrismaClient`.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property) as unknown;

    return typeof value === "function" ? value.bind(client) : value;
  },
});
