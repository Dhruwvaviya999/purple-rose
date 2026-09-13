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
 * Category links point at `/shop` with a `category` parameter, which the shop
 * page already reads. They keep working unchanged when categories become
 * database rows: only where the list comes from changes.
 */
export const primaryNav: readonly NavLink[] = [
  { label: "Shop", href: "/shop" },
  { label: "New in", href: "/shop?sort=newest" },
  { label: "Sale", href: "/shop?sale=true" },
] as const;

export const footerNav: readonly NavGroup[] = [
  {
    title: "Shop",
    items: [
      { label: "Everything", href: "/shop" },
      { label: "New in", href: "/shop?sort=newest" },
      { label: "Cotton dresses", href: "/shop?category=cotton-dresses" },
      { label: "Co-ord sets", href: "/shop?category=co-ord-sets" },
      { label: "Short tops", href: "/shop?category=short-tops" },
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
