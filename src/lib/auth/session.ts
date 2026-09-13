import "server-only";

import { cookies } from "next/headers";

import { sessionConfig } from "./config";
import {
  createSession,
  revokeSession,
  type IssuedSession,
} from "@/lib/services/session-service";

/**
 * The session cookie: how a session record reaches and leaves the browser.
 *
 * Kept apart from `session-service.ts`, which owns the database rows, so the
 * transport can change without touching the record lifecycle.
 *
 * Cookies can only be written from a Server Action or a Route Handler. Server
 * Components may read them, which is why `getCurrentUser` only reads.
 */

/** Written once here so every call site cannot drift apart. */
function cookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    // Never sent over plain HTTP in production. Left off in development so the
    // flow works on http://localhost.
    secure: process.env.NODE_ENV === "production",
    // "lax" keeps the cookie on top-level navigations, which is what the
    // redirect after sign-in is, while withholding it from cross-site form
    // posts and subresource requests.
    sameSite: "lax" as const,
    path: "/",
    expires: expiresAt,
  };
}

/** Read the raw token. Returns an empty string when there is no cookie. */
export async function readSessionToken(): Promise<string> {
  const store = await cookies();
  return store.get(sessionConfig.cookieName)?.value ?? "";
}

/**
 * Create a session for a user and attach it to the response.
 *
 * The cookie holds only the opaque token. No user id, role, phone number or
 * any other claim travels in it, so nothing in the cookie can be read or
 * tampered with to gain authority; every request resolves the token against
 * the database instead.
 */
export async function startSession(userId: string): Promise<IssuedSession> {
  const issued = await createSession(userId);
  const store = await cookies();

  store.set(
    sessionConfig.cookieName,
    issued.token,
    cookieOptions(issued.expiresAt),
  );

  return issued;
}

/**
 * End the current session: revoke the record, then clear the cookie.
 *
 * Revoking first means an interrupted sign-out still invalidates the session
 * server-side, which is the half that matters.
 */
export async function endSession(): Promise<void> {
  const token = await readSessionToken();

  if (token) {
    await revokeSession(token);
  }

  const store = await cookies();
  store.delete(sessionConfig.cookieName);
}
