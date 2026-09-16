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
 * This file configures the **CLI only**.
 *
 * The application never reads it. `src/lib/db/client.ts` builds its own client
 * from `DATABASE_URL` through the driver adapter, so `datasource.url` here is
 * the connection that migrations, introspection and Studio use, and nothing
 * else.
 *
 * That is why it prefers `DIRECT_URL`: the migration engine opens long-lived
 * sessions and issues DDL that a transaction pooler cannot carry. Against
 * Neon's pooled endpoint it fails with `permission denied for schema pg_toast`.
 * Runtime queries still go through the pooled `DATABASE_URL`, which is what a
 * serverless deployment needs.
 *
 * `DIRECT_URL` is optional. Without it this falls back to `DATABASE_URL`,
 * which is correct for a single-endpoint database.
 *
 * Note for anyone extending this: Prisma 7's `datasource` block accepts only
 * `url` and `shadowDatabaseUrl`. There is **no `directUrl` key** — the field of
 * that name in `schema.prisma` did not survive into the config file, and
 * passing one here is silently ignored rather than rejected, so every schema
 * command quietly runs against the pooler.
 */
const migrationUrl =
  process.env.DIRECT_URL?.trim() || process.env.DATABASE_URL?.trim();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: migrationUrl,
  },
});
