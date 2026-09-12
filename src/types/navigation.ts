import type { Route } from "next";

/**
 * A navigation entry that points at a route which exists today.
 * `href` is typed against the generated route map, so a link to a route that
 * has not been built yet fails at compile time instead of in production.
 */
export type NavLink = {
  label: string;
  href: Route;
};

/**
 * A navigation entry that is part of the information architecture but is not
 * routable yet. Rendered as a non-interactive item so the shell never links
 * to a dead URL.
 */
export type NavPlaceholder = {
  label: string;
  /** Short reason shown to assistive technology and as a tooltip. */
  note: string;
};

export type NavItem = NavLink | NavPlaceholder;

export function isNavLink(item: NavItem): item is NavLink {
  return "href" in item;
}

export type NavGroup = {
  title: string;
  items: NavItem[];
};
