"use client";

import { useRef, useState, useTransition } from "react";

import { addToCartAction } from "@/actions/cart";
import { cartFailureMessage } from "@/features/cart/cart-state";
import { Button } from "@/components/ui/button";
import { SpinnerIcon } from "@/components/shared/icons";
import { cn } from "@/lib/utils/cn";

/**
 * The button that puts a chosen variant in the bag.
 *
 * Used on the product page, where a colour and a size have been picked, and on
 * a product card for the rare piece that is made in exactly one combination. It
 * takes a `variantId` and nothing else about the piece: **no price, no name, no
 * stock figure**, because the server derives every one of those from the
 * catalogue and would ignore them if they were sent.
 *
 * ## Server-confirmed
 *
 * The bag badge moves when the database says it moved. Nothing counts up here
 * and quietly counts back down if the write failed. While the write is in
 * flight the button shows a spinner, reports `aria-busy`, and refuses a second
 * press — and behind that the server computes the new quantity from the row it
 * holds, so even a press that slipped through could not double anything.
 *
 * It is `aria-disabled` rather than `disabled` while working, so a keyboard user
 * keeps focus on the control they just pressed and hears the outcome in place.
 *
 * ## When there is nothing to add
 *
 * `variantId` is null until a size is chosen. The control stays visible and
 * says what it is waiting for rather than disappearing, because a button that
 * vanishes as you change a colour is a button people stop trusting.
 */
type AddToBagButtonProps = {
  /** The variant to add, or null when the selection is incomplete. */
  variantId: string | null;
  productName: string;
  /** Shown when `variantId` is null: "Select a size". */
  incompleteLabel?: string;
  /** Shown when the piece cannot be bought at all. */
  soldOut?: boolean;
  size?: "md" | "lg";
  className?: string;
  /** Where the outcome is rendered. A card has no room for a sentence. */
  status?: "sr-only" | "inline";
};

export function AddToBagButton({
  variantId,
  productName,
  incompleteLabel = "Select a size",
  soldOut = false,
  size = "lg",
  className,
  status = "inline",
}: AddToBagButtonProps) {
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  const ready = variantId !== null && !soldOut;

  function onClick() {
    if (!ready || inFlight.current) {
      return;
    }

    inFlight.current = true;
    setMessage("");
    setFailed(false);

    startTransition(async () => {
      try {
        const result = await addToCartAction(variantId, 1);

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

  const label = soldOut ? "Sold out" : ready ? "Add to bag" : incompleteLabel;

  return (
    <>
      <Button
        size={size}
        onClick={onClick}
        aria-disabled={!ready || pending}
        aria-busy={pending}
        aria-label={
          ready ? `Add ${productName} to your bag` : `${label} — ${productName}`
        }
        data-add-to-bag={ready ? "ready" : "blocked"}
        className={cn(
          "aria-disabled:cursor-not-allowed",
          // `aria-disabled` alone does not stop pointer events, and the shared
          // Button styles it at reduced opacity; the click handler is what
          // actually refuses.
          className,
        )}
      >
        {pending ? (
          <>
            <SpinnerIcon className="size-4" />
            <span>Adding…</span>
          </>
        ) : (
          label
        )}
      </Button>

      {/*
        Always rendered, so the announcement is not competing with the region's
        own insertion. Polite: it reports the outcome of something just done.
      */}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          status === "sr-only" || !message
            ? "sr-only"
            : cn(
                "mt-2 font-sans text-sm",
                failed ? "text-brand-strong" : "text-ink-muted",
              ),
        )}
      >
        {message}
      </p>
    </>
  );
}
