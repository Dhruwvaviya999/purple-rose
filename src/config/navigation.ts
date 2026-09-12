import type { NavGroup, NavLink } from "@/types/navigation";

/**
 * Navigation is configuration, not content.
 *
 * Product categories will be read from the database in a later phase and
 * merged into the shop navigation at render time. The entries below are only
 * the fixed structural routes of the application.
 */
export const primaryNav: readonly NavLink[] = [
  { label: "Shop", href: "/shop" },
] as const;

/**
 * Header utilities that are designed but not wired up yet. They render as
 * non-interactive controls so the shell never advertises behaviour it lacks.
 */
export const headerPlaceholders = {
  search: { label: "Search", note: "Search opens in a later release" },
  wishlist: { label: "Wishlist", note: "Wishlist opens in a later release" },
  cart: { label: "Cart", note: "Cart opens in a later release" },
} as const;

export const footerNav: readonly NavGroup[] = [
  {
    title: "Shop",
    items: [
      { label: "All pieces", href: "/shop" },
      { label: "New arrivals", note: "Published with the catalogue" },
      { label: "Gift cards", note: "Published with the catalogue" },
    ],
  },
  {
    title: "Account",
    items: [
      { label: "Sign in", href: "/login" },
      { label: "Orders", note: "Opens with customer accounts" },
      { label: "Wishlist", note: "Opens with customer accounts" },
    ],
  },
  {
    title: "Help",
    items: [
      { label: "Shipping", note: "Policy pages land in a later phase" },
      { label: "Returns", note: "Policy pages land in a later phase" },
      { label: "Contact", note: "Policy pages land in a later phase" },
    ],
  },
] as const;
