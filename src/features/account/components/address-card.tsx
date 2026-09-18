"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { Route } from "next";

import {
  deleteAddressAction,
  setDefaultAddressAction,
} from "@/actions/addresses";
import {
  accountFailureMessage,
  type AccountActionState,
} from "@/features/account/account-state";
import type { AddressData } from "@/types/account";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";

/**
 * One saved address, with its controls.
 *
 * A client component because two of its three actions are buttons rather than
 * navigations. The card's *content* is plain text throughout — every field is
 * rendered as a string and nothing in an address is ever interpreted as markup.
 *
 * ## Server-confirmed
 *
 * Neither control moves the card before the database says so. The badge appears
 * when the list re-renders from the server, so two cards can never both look
 * default — the same rule the bag and the wishlist follow, and the one that
 * matters most here because "which address does this go to" is a question a
 * customer has to be able to trust.
 *
 * ## Deleting asks first
 *
 * Through the shared `Modal`, which names the address, says whether it is the
 * current default and what will happen afterwards. A one-click destructive
 * action on a card sitting next to "Edit" is a mis-tap away from losing
 * somebody's address.
 */
export function AddressCard({ address }: { address: AddressData }) {
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const inFlight = useRef(false);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  function run(operation: () => Promise<AccountActionState>) {
    // A ref, not `pending`: `pending` only turns true after React re-renders,
    // so two presses in the same frame would both get through.
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    setMessage("");
    setFailed(false);

    startTransition(async () => {
      try {
        const result = await operation();

        setFailed(result.status === "error");
        setMessage(result.message ?? "");
      } catch {
        setFailed(true);
        setMessage(accountFailureMessage("UNEXPECTED"));
      } finally {
        inFlight.current = false;
        setConfirming(false);
      }
    });
  }

  return (
    <li
      // Read by `pnpm check:account:ui`, which needs to find a card without
      // depending on "a list item containing this word" — the breadcrumb and
      // the account navigation are list items too.
      data-address-card={address.label}
      data-default={address.isDefault ? "true" : "false"}
      className={cn(
        "rounded-card border bg-canvas p-5 transition-colors sm:p-6",
        address.isDefault ? "border-brand/50 bg-brand-soft/30" : "border-line",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-sans text-base font-medium text-ink">
            {address.label}
          </h3>
          <p className="mt-1 font-sans text-sm text-ink">
            {address.recipientName}
          </p>
          <p className="mt-0.5 font-sans text-sm text-ink-muted">
            {address.phoneNumber}
          </p>
        </div>

        {address.isDefault ? (
          // Words, not only a colour: the badge says "Default" and the card's
          // tint merely agrees with it.
          <Badge>Default</Badge>
        ) : null}
      </div>

      <address className="mt-4 font-sans text-sm not-italic leading-relaxed text-ink-muted">
        {address.addressLine1}
        {address.addressLine2 ? (
          <>
            <br />
            {address.addressLine2}
          </>
        ) : null}
        {address.landmark ? (
          <>
            <br />
            Near {address.landmark}
          </>
        ) : null}
        <br />
        {address.city}, {address.state} {address.postalCode}
        <br />
        {address.countryName}
      </address>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
        <Link
          href={`/account/addresses/${address.id}` as Route}
          className="flex min-h-11 items-center rounded-control border border-line-strong bg-canvas px-4 font-sans text-sm font-medium text-ink transition-colors hover:bg-surface-strong"
        >
          Edit
          <span className="sr-only"> {address.label}</span>
        </Link>

        {address.isDefault ? null : (
          <button
            type="button"
            onClick={() => run(() => setDefaultAddressAction(address.id))}
            aria-disabled={pending}
            className={cn(
              "flex min-h-11 items-center rounded-control px-4",
              "font-sans text-sm font-medium text-ink transition-colors hover:bg-surface-strong",
              "aria-disabled:cursor-wait aria-disabled:opacity-60",
            )}
          >
            Set as default
            <span className="sr-only"> — {address.label}</span>
          </button>
        )}

        <button
          ref={deleteButtonRef}
          type="button"
          onClick={() => setConfirming(true)}
          aria-disabled={pending}
          className={cn(
            "ml-auto flex min-h-11 items-center rounded-control px-4",
            "font-sans text-sm text-ink-muted transition-colors hover:text-brand-strong",
            "aria-disabled:cursor-wait aria-disabled:opacity-60",
          )}
        >
          Delete
          <span className="sr-only"> {address.label}</span>
        </button>
      </div>

      {/* Always present, so the announcement is not competing with the
          region's own insertion. */}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          message
            ? cn(
                "mt-4 font-sans text-sm",
                failed ? "text-brand-strong" : "text-ink-muted",
              )
            : "sr-only",
        )}
      >
        {message}
      </p>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Remove ${address.label}?`}
        returnFocusRef={deleteButtonRef}
        description={
          <>
            <span className="block">{address.recipientName}</span>
            <span className="mt-1 block text-ink-subtle">{address.summary}</span>
            <span className="mt-3 block">
              {address.isDefault
                ? "This is your default address. If you have another saved, the one you changed most recently becomes the default instead."
                : "This cannot be undone. Your other addresses are not affected."}
            </span>
          </>
        }
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setConfirming(false)}
              disabled={pending}
            >
              Keep it
            </Button>
            <Button
              onClick={() => run(() => deleteAddressAction(address.id))}
              disabled={pending}
              aria-busy={pending}
            >
              {pending ? "Removing…" : "Remove address"}
            </Button>
          </div>
        }
      />
    </li>
  );
}
