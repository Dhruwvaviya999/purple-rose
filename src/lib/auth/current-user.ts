import "server-only";

import { cache } from "react";
import type { Route } from "next";
import { redirect } from "next/navigation";

import { Role } from "@/generated/prisma/enums";
import { findSessionUser, type SessionUser } from "@/lib/services/session-service";
import { readSessionToken } from "./session";

/**
 * The authorisation gate. Everything that needs to know who is asking goes
 * through here, so the rules exist once rather than in every route.
 *
 * Authentication ("who is this?") is `getCurrentUser`. Authorisation ("may
 * they do this?") is `requireUser` and `requireAdmin`. Keeping them apart
 * means a page that merely wants to greet someone does not accidentally become
 * a security boundary.
 *
 * Every one of these runs on the server and resolves the session against the
 * database. None of them trusts anything the client sent beyond the opaque
 * token itself.
 */

/**
 * The signed-in user, or null.
 *
 * Wrapped in React's `cache` so a layout, a page and a component in one render
 * share a single database lookup instead of issuing one each.
 */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = await readSessionToken();

  if (!token) {
    return null;
  }

  return findSessionUser(token);
});

/**
 * The signed-in user, or a redirect to sign in.
 *
 * `next` carries where they were heading so they land there afterwards. It is
 * validated on the way back out, in `safeRedirectPath`.
 */
export async function requireUser(returnTo?: string): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!user) {
    const target = returnTo
      ? `/login?next=${encodeURIComponent(returnTo)}`
      : "/login";
    // Typed routes cannot check a string built at runtime. The literal part is
    // a real route and the query is encoded, so the cast is safe.
    redirect(target as Route);
  }

  return user;
}

/**
 * The signed-in administrator, or a redirect.
 *
 * A signed-in customer is sent to the storefront rather than to sign-in: they
 * are authenticated, so asking them to authenticate again would loop and would
 * suggest the problem is their session rather than their permissions.
 */
export async function requireAdmin(returnTo?: string): Promise<SessionUser> {
  const user = await requireUser(returnTo);

  if (user.role !== Role.ADMIN) {
    redirect("/");
  }

  return user;
}

export type { SessionUser };
