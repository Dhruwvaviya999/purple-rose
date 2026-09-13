import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/lib/auth/cookie";

/**
 * Request-level guard.
 *
 * Next.js 16 renamed Middleware to Proxy; this file is the current convention
 * and replaces the older `middleware.ts`.
 *
 * This is an optimistic filter, not the security boundary. It runs on every
 * matched request including prefetches, so it only looks at whether a session
 * cookie is present. It never opens a database connection, never decodes the
 * token, and therefore has no idea who the cookie belongs to or whether it is
 * still valid.
 *
 * The real check lives in `requireAdmin()`, called from the admin layout, which
 * resolves the session against the database and enforces the role. A forged or
 * expired cookie gets past this file and is stopped there.
 *
 * Its job is narrow: send visitors who are plainly not signed in to the sign-in
 * page, so they get a useful redirect instead of a flash of an admin shell.
 */

/** Path prefixes that require a session. The storefront is not among them. */
const PROTECTED_PREFIXES = ["/admin"] as const;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  // Presence only. Validity is decided by the server component that renders.
  if (request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  const signIn = new URL("/login", request.nextUrl);
  signIn.searchParams.set("next", pathname);

  return NextResponse.redirect(signIn);
}

export const config = {
  // Static assets and the generated metadata routes never need a guard.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|opengraph-image).*)"],
};
