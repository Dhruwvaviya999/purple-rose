/**
 * Read-time access to the environment.
 *
 * Only variables that are safe in the browser are exposed here. Server-only
 * secrets (database URLs, auth secrets, provider keys) must be read inside
 * server code from `process.env` directly and never re-exported through this
 * module, so they cannot leak into a client bundle.
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
