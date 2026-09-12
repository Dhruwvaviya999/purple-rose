/**
 * Read-time access to the browser-safe environment.
 *
 * Only variables that are safe in a client bundle belong here, because this
 * module is imported by shared configuration that client components can pull
 * in. Server-only values (the database URL, auth secrets, provider keys) live
 * in `env.server.ts`, which is marked `server-only` so an accidental client
 * import fails at build time instead of shipping.
 */

const DEFAULT_APP_URL = "http://localhost:3000";

function readAppUrl(): string {
  const value = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!value) {
    return DEFAULT_APP_URL;
  }

  // A malformed value would break `metadataBase` and every absolute URL built
  // from it, so fall back rather than crash the render.
  try {
    return new URL(value).origin;
  } catch {
    return DEFAULT_APP_URL;
  }
}

export const env = {
  appUrl: readAppUrl(),
  isProduction: process.env.NODE_ENV === "production",
} as const;
