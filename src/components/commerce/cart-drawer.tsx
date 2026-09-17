"use client";

import { useRef, useState } from "react";

import type { CartData } from "@/types/cart";
import { formatPrice } from "@/lib/utils/format-price";
import { BagIcon } from "@/components/shared/icons";
import { Button, ButtonLink } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { IconButton } from "@/components/ui/icon-button";
import { Text } from "@/components/ui/typography";
import { CartLineItem } from "./cart-line-item";

/**
 * The bag, in the header.
 *
 * A client component for one reason — something has to remember whether the
 * panel is open — and it holds no cart data of its own. The bag arrives as a
 * prop, read once per request by the store layout, so opening the drawer costs
 * nothing and every page pays for exactly one cart query rather than one for the
 * badge and another for the contents. See `lib/cart/page-state.ts`.
 *
 * The panel itself is the shared `Drawer` from Phase 4, unchanged: portalled out
 * of the header, Escape to close, background scroll locked, everything behind it
 * `inert`, focus starting on the close button and returning to the trigger. A
 * second drawer implementation would be a second set of those behaviours to keep
 * correct.
 *
 * It is a bag, not a checkout. Lines, quantities, a subtotal and two ways out —
 * nothing that collects an address or asks for money.
 */
export function CartDrawer({ cart }: { cart: CartData }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const close = () => setOpen(false);
  const empty = cart.items.length === 0;

  return (
    <>
      <IconButton
        ref={triggerRef}
        // The count is in the accessible name rather than only in the badge, so
        // it is not information carried by a small pink circle alone.
        label={
          cart.count > 0
            ? `Bag, ${cart.count} ${cart.count === 1 ? "item" : "items"}`
            : "Bag"
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span className="relative inline-flex">
          <BagIcon />

          {cart.count > 0 ? (
            /* Hidden from assistive technology: the number is already in the
               button's name, and hearing it twice is worse than once. */
            <span
              aria-hidden="true"
              data-cart-count={cart.count}
              className="absolute -right-1.5 -top-1 min-w-4 rounded-full bg-brand px-1 text-center font-sans text-[0.625rem] font-medium leading-4 text-on-brand"
            >
              {cart.count > 99 ? "99+" : cart.count}
            </span>
          ) : null}
        </span>
      </IconButton>

      <Drawer
        open={open}
        onClose={close}
        title="Your bag"
        returnFocusRef={triggerRef}
        footer={empty ? undefined : <DrawerSummary cart={cart} onClose={close} />}
      >
        {empty ? (
          <EmptyBag onClose={close} />
        ) : (
          <div className="px-5">
            {cart.hasUnavailableItems ? (
              <p className="mt-4 rounded-control border border-line bg-surface px-3.5 py-2.5 font-sans text-xs leading-relaxed text-ink-muted">
                Some pieces in your bag are no longer available. They are not
                included in the subtotal.
              </p>
            ) : null}

            <ul className="divide-y divide-line">
              {cart.items.map((item) => (
                <CartLineItem key={item.id} item={item} layout="drawer" />
              ))}
            </ul>
          </div>
        )}
      </Drawer>
    </>
  );
}

/**
 * The subtotal and the two ways out.
 *
 * In the drawer's footer, so it stays put while the lines scroll — a total that
 * scrolls away is a total nobody can see while they are adjusting quantities.
 */
function DrawerSummary({
  cart,
  onClose,
}: {
  cart: CartData;
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-sans text-sm text-ink-muted">Subtotal</span>
        <span className="font-sans text-base font-medium text-ink">
          {formatPrice(cart.subtotal)}
        </span>
      </div>

      <p className="font-sans text-xs leading-relaxed text-ink-subtle">
        Delivery is worked out at checkout.
      </p>

      <ButtonLink href="/cart" className="w-full" onClick={onClose}>
        View bag
      </ButtonLink>

      <Button variant="ghost" className="w-full" onClick={onClose}>
        Continue shopping
      </Button>
    </div>
  );
}

function EmptyBag({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand [&_svg]:size-6">
        <BagIcon />
      </span>

      <h2 className="mt-6 font-sans text-lg font-medium text-ink">
        Your bag is empty
      </h2>

      <Text size="sm" className="mt-3 max-w-xs">
        Discover pieces you will want to wear on repeat.
      </Text>

      <ButtonLink
        href="/shop"
        variant="secondary"
        className="mt-7"
        onClick={onClose}
      >
        Explore the collection
      </ButtonLink>
    </div>
  );
}
