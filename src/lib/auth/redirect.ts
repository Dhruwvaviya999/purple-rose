/**
 * Where a user may be sent after signing in.
 *
 * The destination arrives in a query string, which means an attacker controls
 * it. Handing it to `redirect()` unchecked is an open redirect: a link to our
 * own trusted domain that lands the victim on the attacker's site, still
 * believing they are dealing with us. Everything is refused except a path on
 * this site.
 */

/**
 * Paths a signed-in user may be returned to.
 *
 * An allow-list of prefixes, not a "is it on our domain" test. Every entry is a
 * page it makes sense to be sent back to after signing in: the admin area, a
 * product or listing, and — since Phase 8 — the wishlist, which is where
 * somebody who tapped a heart while signed out was trying to get to.
 *
 * `/wishlist` earns its place because the wishlist control builds the `next`
 * value itself, and `/account` because every page under it redirects a
 * signed-out visitor to sign in and should bring them back where they were
 * going. Adding a prefix here is the only way a destination becomes reachable,
 * which is what keeps the check a decision rather than a pattern match.
 */
const ALLOWED_PREFIXES = ["/admin", "/shop", "/wishlist", "/account"] as const;

export function safeRedirectPath(
  candidate: string | null | undefined,
): string | null {
  if (!candidate) {
    return null;
  }

  // Must be a rooted path. "//evil.com" and "/\evil.com" are browser-relative
  // to another host, and anything with a scheme leaves the site entirely.
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.startsWith("/\\") ||
    candidate.includes("\\")
  ) {
    return null;
  }

  // A backslash or encoded slash can smuggle a host past the checks above once
  // the browser normalises it, so decode before matching and refuse anything
  // that fails to decode.
  let decoded: string;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return null;
  }

  if (decoded.startsWith("//") || decoded.includes("\\")) {
    return null;
  }

  const path = decoded.split("?")[0]?.split("#")[0] ?? "";

  const allowed = ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );

  return allowed ? decoded : null;
}

/**
 * The default landing page for a role.
 *
 * Customers go to the storefront: there is no account area yet, and inventing
 * one would be pretending a feature exists.
 */
export function defaultDestinationForRole(role: "ADMIN" | "CUSTOMER"): string {
  return role === "ADMIN" ? "/admin" : "/";
}
