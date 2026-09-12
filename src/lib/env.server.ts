import "server-only";

/**
 * Server-only environment access.
 *
 * This is the counterpart to `src/lib/env.ts`, which holds the values that are
 * safe to reach a browser bundle. The two are separate files rather than one
 * module because `env.ts` is imported by shared configuration that client
 * components can pull in. Keeping secrets in their own `server-only` module
 * means an accidental client import fails at build time instead of shipping.
 *
 * Nothing here is read at module scope, so importing this file never throws.
 * Each value is validated at the moment it is used, which lets a caller such
 * as the health endpoint report a missing variable as an operational problem
 * rather than crashing the route.
 */

function required(name: "DATABASE_URL"): string {
  const value = process.env[name]?.trim();

  if (!value) {
    // The name only, never a value: this message reaches logs.
    throw new Error(
      `Missing required environment variable ${name}. ` +
        `Copy .env.example to .env.local and set it to your Neon connection string.`,
    );
  }

  return value;
}

/**
 * Pooled connection string used for application queries.
 * On Neon this is the endpoint whose host contains `-pooler`.
 */
export function databaseUrl(): string {
  return required("DATABASE_URL");
}

/**
 * Unpooled connection string used only by the Prisma CLI for schema changes.
 * Optional: the CLI falls back to `DATABASE_URL` when it is not set.
 *
 * Read here so the variable has a single documented home, even though the
 * migration engine reads it through `prisma7.config.ts`.
 */
export function directUrl(): string | undefined {
  return process.env.DIRECT_URL?.trim() || undefined;
}
