/**
 * Where catalogue photography is allowed to come from.
 *
 * One list, two consumers: `next.config.ts` turns it into
 * `images.remotePatterns`, and the admin validation schema refuses a URL whose
 * host is not on it. That pairing is the point. `next/image` throws at render
 * time for an unconfigured host, so without the check an administrator could
 * save a perfectly well-formed URL and break the product page for everyone.
 * Failing in a form, next to the field, is much better than failing in the
 * storefront.
 *
 * It is deliberately **not** configurable from the browser or from the
 * database. Letting the admin panel widen the set of hosts the application
 * will fetch and proxy images from turns a catalogue form into an SSRF and
 * content-injection surface. Adding a host is a code change and a deploy,
 * which is the correct amount of friction.
 *
 * Today the list holds the development photography host. When real image
 * storage arrives it gains that bucket's domain, and this comment can lose
 * this paragraph.
 *
 * This module is plain data with no imports, so both the Next config (which
 * runs outside the app's module graph) and client components can read it.
 */
export const allowedImageHosts = ["images.unsplash.com"] as const;

export type AllowedImageHost = (typeof allowedImageHosts)[number];

/** The only schemes a stored image URL may use. */
export const allowedImageProtocols = ["https:"] as const;

/**
 * Is this a URL the storefront can actually render?
 *
 * Rejects anything that is not absolute HTTPS on a configured host, which
 * covers the dangerous schemes (`javascript:`, `data:`, `vbscript:`) by only
 * ever allowing one, rather than by trying to list what to block.
 */
export function isAllowedImageUrl(value: string): boolean {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (!(allowedImageProtocols as readonly string[]).includes(url.protocol)) {
    return false;
  }

  return (allowedImageHosts as readonly string[]).includes(url.hostname);
}

/** For an error message that tells the admin what would work. */
export const allowedImageHostList = allowedImageHosts.join(", ");
