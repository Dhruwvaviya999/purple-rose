import type { NavGroup, NavLink } from "@/types/navigation";

/**
 * Navigation is configuration, not content.
 *
 * Two rules hold here, and they are what keep the chrome honest:
 *
 * 1. **Every `href` is a route that exists.** `href` is typed against the
 *    generated route map, so a link to a page nobody has built fails the
 *    typecheck instead of giving a shopper a 404.
 * 2. **Anything not built yet is a `note`, not a link.** Those render as
 *    non-interactive text with the reason attached, so the footer never
 *    advertises a policy page that is not written.
 *
 * There are deliberately **no category links in this file.** Categories are
 * database rows, so a list of them here would be a second source of truth that
 * goes stale the moment one is renamed, added or disabled. The header, the
 * mobile drawer and the footer all receive the live list from
 * `category-service.ts` and build their own links, which always point at
 * `/shop` with a `category` parameter.
 */
export const primaryNav: readonly NavLink[] = [
  { label: "Shop", href: "/shop" },
  // The new-arrival flag rather than a newest-first sort: "New in" is the
  // pieces the shop has chosen to present as new, not simply the last rows
  // that happened to be created.
  { label: "New in", href: "/shop?new=true" },
  { label: "Sale", href: "/shop?sale=true" },
] as const;

export const footerNav: readonly NavGroup[] = [
  {
    title: "Shop",
    items: [
      { label: "Everything", href: "/shop" },
      { label: "New in", href: "/shop?new=true" },
      { label: "Sale", href: "/shop?sale=true" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Sign in", href: "/login" },
      { label: "Wishlist", href: "/wishlist" },
      { label: "Bag", href: "/cart" },
      { label: "Orders", note: "Opens with checkout" },
    ],
  },
  {
    title: "Help",
    items: [
      { label: "Size guide", note: "Published with the catalogue" },
      { label: "Shipping", note: "Published with checkout" },
      { label: "Returns", note: "Published with checkout" },
      { label: "Contact", note: "Published with the policy pages" },
    ],
  },
] as const;
