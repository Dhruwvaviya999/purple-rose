"use client";

import { useRef, useState, useTransition } from "react";

import { clearCartAction } from "@/actions/cart";
import { cartFailureMessage } from "@/features/cart/cart-state";
import { cn } from "@/lib/utils/cn";

/**
 * Empty the bag.
 *
 * Two presses rather than one. Clearing is the only destructive thing on this
 * page that cannot be undone by pressing something else — a removed line can be
 * added back from the product page, a whole bag cannot — and it sits next to
 * "Continue shopping", which is exactly where a mis-tap comes from.
 *
 * The confirmation is inline rather than a dialog: it is one decision with two
 * outcomes, and borrowing the modal machinery for it would be more interruption
 * than the action deserves. Focus is not moved, so a keyboard user presses the
 * same control twice and nothing jumps.
 *
 * It takes no arguments. There is nothing to say but "mine", and who that is
 * comes from the session or the guest cookie on the server.
 */
export function ClearBagButton() {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);

  function onClick() {
    if (!confirming) {
      setConfirming(true);
      return;
    }

    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    setMessage("");

    startTransition(async () => {
      try {
        const result = await clearCartAction();
        setMessage(result.message);
      } catch {
        setMessage(cartFailureMessage("UNEXPECTED"));
      } finally {
        inFlight.current = false;
        setConfirming(false);
      }
    });
  }

  return (
    <div className="flex items-center gap-3">
      {confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="font-sans text-sm text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
        >
          Keep it
        </button>
      ) : null}

      <button
        type="button"
        onClick={onClick}
        aria-disabled={pending}
        className={cn(
          "font-sans text-sm underline decoration-line-strong underline-offset-4 transition-colors",
          confirming
            ? "font-medium text-brand-strong decoration-brand"
            : "text-ink-muted hover:text-brand-strong hover:decoration-brand",
          "aria-disabled:cursor-wait aria-disabled:opacity-60",
        )}
      >
        {pending
          ? "Emptying…"
          : confirming
            ? "Empty the bag — are you sure?"
            : "Empty bag"}
      </button>

      <p role="status" aria-live="polite" className="sr-only">
        {message}
      </p>
    </div>
  );
}
