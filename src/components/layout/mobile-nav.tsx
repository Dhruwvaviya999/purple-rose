"use client";

import { useRef, useState } from "react";
import Link from "next/link";

import { primaryNav } from "@/config/navigation";
import type { StorefrontCategory } from "@/types/commerce";
import { MenuIcon } from "@/components/shared/icons";
import { ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { IconButton } from "@/components/ui/icon-button";

/** Storefront links that are not categories and not the primary nav. */
const SECONDARY_LINKS = [
  { label: "Wishlist", href: "/wishlist" },
  { label: "Bag", href: "/cart" },
] as const;

/**
 * Navigation on small screens.
 *
 * The accessibility behaviour that was built and verified in Phase 1 is
 * unchanged: rendered into `document.body` so no ancestor can trap its fixed
 * positioning, Escape closes it, background scrolling locks, focus starts on
 * the close button and returns to the trigger. All of that now lives in the
 * shared `Drawer`, which the filter and bag panels use too, so there is one
 * implementation of it rather than three.
 *
 * Categories are passed in rather than fetched, so this component does not
 * know or care whether they come from a file or a table.
 */
export function MobileNav({
  categories,
}: {
  categories: readonly Pick<StorefrontCategory, "slug" | "name">[];
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => setOpen(false);

  return (
    <div className="lg:hidden">
      <IconButton
        ref={triggerRef}
        label="Menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <MenuIcon />
      </IconButton>

      <Drawer
        open={open}
        onClose={close}
        title="Menu"
        side="right"
        returnFocusRef={triggerRef}
        footer={
          <ButtonLink
            href="/login"
            variant="secondary"
            className="w-full"
            onClick={close}
          >
            Sign in
          </ButtonLink>
        }
      >
        <nav aria-label="Mobile" className="px-5 py-6">
          <ul className="space-y-1">
            {primaryNav.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={close}
                  className="block rounded-control py-3 font-display text-2xl font-light text-ink transition-colors hover:text-brand-strong"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          {categories.length > 0 ? (
            <div className="mt-7 border-t border-line pt-6">
              <h2 className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle">
                Categories
              </h2>
              <ul className="mt-3 space-y-1">
                {categories.map((category) => (
                  <li key={category.slug}>
                    <Link
                      href={{
                        pathname: "/shop",
                        query: { category: category.slug },
                      }}
                      onClick={close}
                      className="block rounded-control py-2.5 font-sans text-base text-ink transition-colors hover:text-brand-strong"
                    >
                      {category.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-7 border-t border-line pt-6">
            <ul className="space-y-1">
              {SECONDARY_LINKS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={close}
                    className="block rounded-control py-2.5 font-sans text-base text-ink transition-colors hover:text-brand-strong"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </Drawer>
    </div>
  );
}
