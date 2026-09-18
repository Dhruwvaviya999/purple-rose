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
 * The real check lives in `requireAdmin()`, called from the admin layout, and
 * in `requireUser()` on the wishlist page. Both resolve the session against the
 * database and enforce what they need to. A forged or expired cookie gets past
 * this file and is stopped there.
 *
 * Its job is narrow: send visitors who are plainly not signed in to the sign-in
 * page, so they get a useful redirect instead of a flash of a shell they cannot
 * use.
 *
 * It also makes that refusal an ordinary HTTP redirect. A `redirect()` from
 * inside a streaming page arrives after the response has begun, so the status
 * is 200 and the navigation happens in the browser: correct for a person, and
 * indistinguishable from "served the page" to anything checking the response.
 * Catching the cookie-less case here means an anonymous request for a private
 * route is answered 307 before any of it is rendered.
 */

/**
 * Path prefixes that require a session.
 *
 * `/wishlist` joined `/admin` in Phase 8: it is the first storefront route that
 * is one person's rather than everyone's. `/account` joined them in Phase 10 —
 * it is the most personal area in the application, holding a name, a phone
 * number and somebody's home address.
 *
 * `/cart` is deliberately **not** here. A bag belongs to whoever is carrying it,
 * signed in or not, and demanding a sign-in to look at one is how a sale is
 * lost. The rest of the storefront is public for the same reason: an anonymous
 * shopper browses the whole catalogue without this file doing anything.
 */
const PROTECTED_PREFIXES = ["/admin", "/wishlist", "/account"] as const;

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
