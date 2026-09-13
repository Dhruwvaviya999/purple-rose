"use client";

import { useRef, useState } from "react";

import { BagIcon } from "@/components/shared/icons";
import { ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { IconButton } from "@/components/ui/icon-button";
import { Text } from "@/components/ui/typography";

/**
 * The bag.
 *
 * There is no cart storage yet: no table, no action, nothing to add to. So the
 * drawer opens, and says so. It does not show a count, because a count of
 * nothing is still a claim, and it does not invent lines.
 *
 * The empty state is the real empty state this drawer will keep using once
 * carts exist; only the populated branch is missing. When it arrives, the
 * lines, the subtotal and the checkout button go where the notice is now, and
 * the trigger gains a count from real state.
 */
export function CartDrawer() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <IconButton
        ref={triggerRef}
        label="Bag"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <BagIcon />
      </IconButton>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title="Your bag"
        returnFocusRef={triggerRef}
      >
        <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand [&_svg]:size-6">
            <BagIcon />
          </span>

          <h2 className="mt-6 font-sans text-lg font-medium text-ink">
            Your bag is empty
          </h2>

          <Text size="sm" className="mt-3 max-w-xs">
            Adding pieces to a bag opens with checkout. For now, have a look at
            what is coming.
          </Text>

          <ButtonLink
            href="/shop"
            variant="secondary"
            className="mt-7"
            onClick={() => setOpen(false)}
          >
            Browse the shop
          </ButtonLink>
        </div>
      </Drawer>
    </>
  );
}
