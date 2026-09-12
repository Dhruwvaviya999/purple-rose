// Prisma CLI configuration.
//
// Prisma 7 reads this file (named `prisma7.config.ts` by this CLI version)
// instead of taking connection details from `schema.prisma`. It also no longer
// loads .env files on its own, so dotenv is loaded explicitly below.
//
// Next.js reads `.env.local` for the application. The Prisma CLI is a separate
// process, so the same file is loaded here to keep one source of truth for the
// connection string.
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { defineConfig } from "prisma/config";

/**
 * Runtime queries use `DATABASE_URL`, which should be Neon's pooled endpoint.
 *
 * Schema changes use `DIRECT_URL`, Neon's unpooled endpoint, because the
 * migration engine opens long-lived sessions and issues DDL that a transaction
 * pooler cannot carry. It is optional: when it is absent Prisma falls back to
 * `DATABASE_URL`, which is what a single-endpoint local database wants.
 */
const directUrl = process.env.DIRECT_URL?.trim();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
    ...(directUrl ? { directUrl } : {}),
  },
});
