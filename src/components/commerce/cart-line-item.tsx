"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";

import {
  removeCartItemAction,
  updateCartItemAction,
} from "@/actions/cart";
import { cartFailureMessage } from "@/features/cart/cart-state";
import type { CartItemData } from "@/types/cart";
import { cartConfig } from "@/lib/cart/limits";
import { formatPrice } from "@/lib/utils/format-price";
import { cn } from "@/lib/utils/cn";
import { SpinnerIcon } from "@/components/shared/icons";

/**
 * One line of a bag, with its controls.
 *
 * The same component in the drawer and on the cart page — `layout` only changes
 * how much room it takes. Two implementations of "a line in a bag" would drift,
 * and the quantity rules are the part that must not.
 *
 * ## Server-confirmed, like everything else that writes
 *
 * The quantity shown is the quantity the database reported. A `+` that fails
 * leaves the number where it was and says why, rather than counting up and
 * quietly counting back down. The controls refuse a second press while one is in
 * flight, which is what keeps `+ + +` from becoming three round trips racing
 * each other — and the server computes the new quantity from the row rather than
 * from anything sent, so even if they did race the result would be correct.
 *
 * ## Accessibility
 *
 * Every control names the piece it acts on, because "Increase quantity" repeated
 * down a list of six is six identical buttons to anybody reading them out of
 * context. The quantity itself is text, not a bare number between two icons.
 * Controls are marked `aria-disabled` rather than `disabled` while working, so
 * focus stays where the shopper put it — the same reasoning as the wishlist
 * heart, and the same bug avoided.
 */
type CartLineItemProps = {
  item: CartItemData;
  layout?: "drawer" | "page";
};

export function CartLineItem({ item, layout = "page" }: CartLineItemProps) {
  const [quantity, setQuantity] = useState(item.quantity);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  const compact = layout === "drawer";
  const unavailable = item.status === "unavailable";
  const soldOut = item.status === "out-of-stock";

  function run(operation: () => Promise<{ ok: boolean; message: string }>) {
    // A ref, not `pending`: `pending` only turns true after React re-renders, so
    // two presses in the same frame would both get through. Behind this, the
    // server recomputes from the row and the unique index holds the line
    // together, so a race cannot corrupt anything either.
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    setMessage("");
    setFailed(false);

    startTransition(async () => {
      try {
        const result = await operation();

        if (result.ok) {
          setMessage(result.message);
        } else {
          setFailed(true);
          setMessage(result.message);
        }
      } catch {
        setFailed(true);
        setMessage(cartFailureMessage("UNEXPECTED"));
      } finally {
        inFlight.current = false;
      }
    });
  }

  function setTo(next: number) {
    // The displayed number follows the server, so it is not moved here. The
    // route refresh the action triggers re-renders this line with what the
    // database holds, and `quantity` is only local so the control has something
    // to read between renders.
    run(async () => {
      const result = await updateCartItemAction(item.id, next);

      if (result.ok) {
        setQuantity(next);
      }

      return result;
    });
  }

  function remove() {
    run(() => removeCartItemAction(item.id));
  }

  const atMin = quantity <= cartConfig.minQuantityPerLine;
  const atMax =
    quantity >= cartConfig.maxQuantityPerLine ||
    (item.availableStock > 0 && quantity >= item.availableStock);

  return (
    <li
      className={cn(
        "flex gap-4",
        compact ? "py-4" : "border-b border-line py-6 first:pt-0",
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-card bg-surface",
          compact ? "h-24 w-[4.5rem]" : "h-32 w-24 sm:h-40 sm:w-32",
        )}
      >
        <Image
          src={item.image.src}
          alt={item.image.alt}
          fill
          sizes={compact ? "72px" : "(min-width: 640px) 128px, 96px"}
          className={cn(
            "object-cover",
            (unavailable || soldOut) && "opacity-75",
            unavailable && "grayscale",
          )}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              className={cn(
                "font-sans font-medium leading-snug text-ink",
                compact ? "text-sm" : "text-base",
              )}
            >
              {unavailable ? (
                // No link: the product page answers 404 for anything that is
                // not ACTIVE, so linking would send a shopper to a not-found
                // page and make it look like their mistake.
                item.product.name
              ) : (
                <Link
                  href={item.href as Route}
                  className="transition-colors hover:text-brand-strong"
                >
                  {item.product.name}
                </Link>
              )}
            </h3>

            {/* Colour and size as text, never as a swatch alone. */}
            <p className="mt-1 font-sans text-xs text-ink-subtle">
              {item.colour.name} · Size {item.size.label}
            </p>

            {!compact ? (
              <p className="mt-0.5 font-sans text-xs text-ink-subtle">
                {item.sku}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 text-right">
            <p
              className={cn(
                "font-sans font-medium text-ink",
                compact ? "text-sm" : "text-base",
              )}
            >
              {formatPrice(item.lineSubtotal)}
            </p>

            {item.compareAtPrice ? (
              <p className="mt-0.5 font-sans text-xs text-ink-subtle">
                <span className="sr-only">Was </span>
                <s>{formatPrice(item.compareAtPrice * item.quantity)}</s>
              </p>
            ) : null}

            {quantity > 1 ? (
              <p className="mt-0.5 font-sans text-xs text-ink-subtle">
                {formatPrice(item.unitPrice)} each
              </p>
            ) : null}
          </div>
        </div>

        <LineNotice item={item} />

        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
          {unavailable ? (
            // Nothing to adjust. The quantity is shown so the shopper can see
            // what they had asked for, and removal is the only action offered.
            <p className="font-sans text-sm text-ink-subtle">
              Quantity {quantity}
            </p>
          ) : (
            <QuantityControls
              productName={item.product.name}
              quantity={quantity}
              atMin={atMin}
              atMax={atMax}
              pending={pending}
              onDecrease={() => setTo(quantity - 1)}
              onIncrease={() => setTo(quantity + 1)}
            />
          )}

          <button
            type="button"
            onClick={remove}
            aria-disabled={pending}
            aria-label={`Remove ${item.product.name} from your bag`}
            className={cn(
              // `min-h-9` is not decoration. As a bare underlined span this was
              // 20px tall, below the 24px minimum for a target anybody can hit
              // reliably with a thumb — `pnpm check:cart:ui` measured it at
              // every one of the nine widths. The negative margin keeps the
              // text sitting where it looks right while the box around it is
              // the size a finger needs.
              "-my-2 inline-flex min-h-9 items-center py-2",
              "font-sans text-sm text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors",
              "hover:text-brand-strong hover:decoration-brand",
              "aria-disabled:cursor-wait aria-disabled:opacity-60",
            )}
          >
            Remove
          </button>
        </div>

        {/*
          Polite and always present: a region that appears at the same moment as
          its text is frequently missed. On the page it is shown; in the drawer
          there is no room for a sentence per line, so it is announced only.
        */}
        <p
          role="status"
          aria-live="polite"
          className={cn(
            message && !compact
              ? cn(
                  "mt-3 font-sans text-sm",
                  failed ? "text-brand-strong" : "text-ink-muted",
                )
              : "sr-only",
          )}
        >
          {message}
        </p>
      </div>
    </li>
  );
}

/**
 * Why this line cannot be bought, or what changed about it.
 *
 * One line of text, in words rather than in colour, because a shopper scanning
 * a bag needs to know which of these they have to deal with before checkout.
 */
function LineNotice({ item }: { item: CartItemData }) {
  const notice =
    item.status === "unavailable"
      ? "Currently unavailable — this piece is no longer being sold."
      : item.status === "out-of-stock"
        ? "Currently unavailable — this size has sold out."
        : item.status === "limited"
          ? `Only ${item.availableStock} left. Reduce the quantity to continue.`
          : item.priceChanged
            ? "The price of this piece has changed since you added it."
            : null;

  if (!notice) {
    return null;
  }

  return (
    <p className="mt-2 font-sans text-xs leading-relaxed text-brand-strong">
      {notice}
    </p>
  );
}

/**
 * Minus, the number, plus.
 *
 * A group with its own accessible name, so the three together are announced as
 * the quantity for a particular piece rather than as three loose buttons. The
 * number is real text between them, not a value only the shape of the control
 * implies.
 */
function QuantityControls({
  productName,
  quantity,
  atMin,
  atMax,
  pending,
  onDecrease,
  onIncrease,
}: {
  productName: string;
  quantity: number;
  atMin: boolean;
  atMax: boolean;
  pending: boolean;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={`Quantity for ${productName}`}
      className="inline-flex items-center rounded-control border border-line-strong"
    >
      <StepButton
        label={`Decrease quantity for ${productName}`}
        disabled={atMin || pending}
        onClick={onDecrease}
      >
        <span aria-hidden="true">−</span>
      </StepButton>

      <span className="min-w-10 px-1 text-center font-sans text-sm text-ink">
        {pending ? (
          <SpinnerIcon className="mx-auto size-4 text-ink-muted" />
        ) : (
          <>
            <span className="sr-only">Quantity: </span>
            {quantity}
          </>
        )}
      </span>

      <StepButton
        label={`Increase quantity for ${productName}`}
        disabled={atMax || pending}
        onClick={onIncrease}
      >
        <span aria-hidden="true">+</span>
      </StepButton>
    </div>
  );
}

function StepButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      // `aria-disabled`, not `disabled`: a disabled element cannot hold focus,
      // so a keyboard user pressing `−` down to one would be thrown to the top
      // of the document by their own last press.
      aria-disabled={disabled}
      aria-label={label}
      onClick={() => {
        if (!disabled) {
          onClick();
        }
      }}
      className={cn(
        "flex size-9 items-center justify-center font-sans text-base text-ink transition-colors",
        "hover:text-brand-strong",
        "aria-disabled:cursor-not-allowed aria-disabled:text-ink-subtle aria-disabled:hover:text-ink-subtle",
      )}
    >
      {children}
    </button>
  );
}
