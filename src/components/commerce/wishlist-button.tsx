"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { Route } from "next";

import { toggleWishlistAction } from "@/actions/wishlist";
import { wishlistFailureMessage } from "@/features/wishlist/wishlist-state";
import { HeartIcon, SpinnerIcon } from "@/components/shared/icons";
import { cn } from "@/lib/utils/cn";

/**
 * Save for later.
 *
 * The one control that writes to the wishlist, used on product cards and on the
 * product page. Everything about what it does lives here: no page duplicates
 * the logic, and no page queries the database to decide what it should look
 * like — the state arrives as a prop, read once per page for every card at
 * once. See `getWishlistStateFor` in `lib/wishlist/page-state.ts`.
 *
 * ## Signed out
 *
 * It becomes a link to `/login`, carrying where to come back to. Not a button
 * that fails, and not a button that quietly does nothing: somebody tapping a
 * heart is asking for an account's worth of memory, so the honest answer is to
 * offer them one. `returnTo` is a fixed internal path the server builds from a
 * slug, and `safeRedirectPath` checks it again on the way back, so there is no
 * way to steer it off-site.
 *
 * ## Signed in
 *
 * **Server-confirmed, not optimistic.** The heart fills when the database says
 * it is filled, which is the action's result rather than the fact of the click.
 * Optimism here would mean a filled heart over a product that was never saved
 * whenever the network dropped, and rolling that back correctly is more
 * machinery than the 200ms it saves is worth. While the write is in flight the
 * control shows a spinner, reports `aria-busy`, and refuses a second click, so
 * nothing is ambiguous and a double click cannot send a second request. If one
 * ever did — two tabs, two devices, a retry — the action is idempotent and
 * `WishlistItem`'s unique index is what finally prevents a duplicate row.
 *
 * It is marked `aria-disabled` rather than `disabled` while it waits. A
 * disabled element cannot hold focus, so `disabled` would throw a keyboard user
 * back to the top of the document on their own click, and the live region's
 * announcement would arrive with focus somewhere else entirely.
 *
 * On failure the previous confirmed state is kept and the reason is announced,
 * and the control re-enables so it can be tried again. A failed mutation never
 * changes the heart.
 *
 * ## Being told what happened
 *
 * The outcome goes into a live region rather than into a toast system, which
 * would be a lot of machinery for two sentences. The region is rendered empty
 * from the start rather than inserted when there is something to say: a live
 * region that appears at the same moment as its text is frequently missed.
 *
 * Nothing is carried by colour alone. The heart goes from outline to solid, the
 * accessible name changes between "Save" and "Saved — remove", and
 * `aria-pressed` reports the state to anyone reading the control directly.
 */
type WishlistButtonProps = {
  productId: string;
  /** Used in the accessible name, so the control is never just "Save". */
  productName: string;
  /**
   * Whether this product is saved. `null` means nobody is signed in, which is
   * a different thing from "not saved" and gets a different control.
   */
  wishlisted: boolean | null;
  /** Internal path to return to after signing in. */
  returnTo: string;
  size?: "sm" | "md";
  /**
   * Where the outcome is shown. `"sr-only"` on a card, which has no room for a
   * sentence; `"inline"` on the product page, where it is rendered as text
   * under the control for everyone.
   */
  status?: "sr-only" | "inline";
  /** Classes for the control itself: position, size, border. */
  className?: string;
};

/**
 * The wrapper is `display: contents`.
 *
 * The control needs a sibling live region, but it is dropped into layouts that
 * expect a single element: absolutely positioned on a card, a flex item on the
 * product page. `contents` makes the wrapper disappear from layout entirely, so
 * the button and its status land as direct children of whatever the caller
 * built, and the caller's own classes still describe the button rather than an
 * invisible box around it.
 */
const WRAPPER = "contents";

const SHELL =
  "inline-flex items-center justify-center rounded-full bg-canvas/90 text-ink-muted shadow-subtle transition-colors hover:text-brand-strong";

const SIZES = {
  sm: "size-9 [&_svg]:size-4",
  md: "size-11 [&_svg]:size-5",
} as const;

export function WishlistButton({
  productId,
  productName,
  wishlisted,
  returnTo,
  size = "md",
  status = "sr-only",
  className,
}: WishlistButtonProps) {
  if (wishlisted === null) {
    return (
      <SignInToSave
        productName={productName}
        returnTo={returnTo}
        size={size}
        className={className}
      />
    );
  }

  return (
    <SaveToggle
      productId={productId}
      productName={productName}
      wishlisted={wishlisted}
      size={size}
      status={status}
      className={className}
    />
  );
}

/**
 * The anonymous control.
 *
 * A link, because it navigates. A button here would look identical to the real
 * one and behave differently, and would put a round trip in front of an answer
 * already known at render time.
 */
function SignInToSave({
  productName,
  returnTo,
  size,
  className,
}: {
  productName: string;
  returnTo: string;
  size: "sm" | "md";
  className?: string;
}) {
  const href = `/login?next=${encodeURIComponent(returnTo)}` as Route;

  return (
    <Link
      href={href}
      aria-label={`Sign in to save ${productName} to your wishlist`}
      title="Sign in to save this"
      className={cn(SHELL, SIZES[size], className)}
    >
      <HeartIcon />
    </Link>
  );
}

function SaveToggle({
  productId,
  productName,
  wishlisted,
  size,
  status,
  className,
}: {
  productId: string;
  productName: string;
  wishlisted: boolean;
  size: "sm" | "md";
  status: "sr-only" | "inline";
  className?: string;
}) {
  /**
   * The last state the server confirmed.
   *
   * Seeded from the prop, which is what the page read when it rendered, and
   * replaced only by a result that came back `ok`. A failed mutation leaves it
   * exactly as it was.
   */
  const [saved, setSaved] = useState(wishlisted);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const pathname = usePathname();

  /**
   * The guard that makes a second click a no-op.
   *
   * A ref rather than `pending`, because `pending` only becomes true after
   * React has re-rendered, and two clicks dispatched in the same frame both see
   * the old value. A ref is set on the line after it is read. `pending` still
   * drives what the control *looks* like; this decides what it *does*.
   *
   * It is the first of three defences, and the weakest: it only knows about
   * this component. Behind it, the action is idempotent, and behind that the
   * unique index catches anything neither of them can see — another tab,
   * another device, a retried request.
   */
  const inFlight = useRef(false);

  function onClick() {
    if (inFlight.current) {
      return;
    }

    inFlight.current = true;
    setMessage("");
    setFailed(false);

    startTransition(async () => {
      try {
        const result = await toggleWishlistAction(productId);

        if (result.ok) {
          setSaved(result.wishlisted);
          setMessage(result.message);
          return;
        }

        // The session ended between render and click. Send them to sign in
        // rather than showing a message they cannot act on.
        if (result.code === "SIGNED_OUT") {
          router.push(`/login?next=${encodeURIComponent(pathname)}` as Route);
          return;
        }

        setFailed(true);
        setMessage(result.message);
      } catch {
        // A transport failure rather than a refusal. Same treatment as any
        // other: keep the confirmed state, say so, allow a retry.
        setFailed(true);
        setMessage(wishlistFailureMessage("UNEXPECTED"));
      } finally {
        inFlight.current = false;
      }
    });
  }

  const label = saved
    ? `Saved — remove ${productName} from your wishlist`
    : `Save ${productName} to your wishlist`;

  return (
    <span className={WRAPPER}>
      <button
        type="button"
        onClick={onClick}
        // `aria-disabled`, not `disabled`. A disabled element cannot hold
        // focus, so the browser moves focus to the body the moment the write
        // starts — somebody operating this by keyboard would be thrown back to
        // the top of the document by their own click. This keeps the control
        // focused and announced, and `onClick` refuses while a write is in
        // flight, which is what actually prevents the second request.
        aria-disabled={pending}
        aria-pressed={saved}
        aria-busy={pending}
        aria-label={label}
        title={saved ? "Remove from wishlist" : "Save to wishlist"}
        // Read by `pnpm check:wishlist:ui`, which needs to assert the state
        // without depending on the wording of a label.
        data-wishlisted={saved ? "true" : "false"}
        className={cn(
          SHELL,
          SIZES[size],
          saved && "text-brand hover:text-brand-strong",
          "aria-disabled:cursor-wait aria-disabled:opacity-70",
          className,
        )}
      >
        {pending ? (
          <SpinnerIcon />
        ) : (
          // Outline when it is not saved, solid when it is, so the state does
          // not rest on the colour change alone.
          <HeartIcon fill={saved ? "currentColor" : "none"} />
        )}
      </button>

      {/*
        Polite, not assertive: this reports the outcome of something the person
        just did, so it should wait its turn rather than interrupt. Always
        present, so the announcement is not competing with the region's own
        insertion.
      */}
      <span
        role="status"
        aria-live="polite"
        className={cn(
          status === "sr-only" && "sr-only",
          status === "inline" &&
            (message
              ? cn(
                  // `basis-full` so it takes its own line in the flex row the
                  // product page puts it in, rather than squeezing the button
                  // beside it.
                  "mt-1 block basis-full rounded-control border px-3.5 py-2.5 font-sans text-sm leading-relaxed",
                  failed
                    ? "border-brand/40 bg-brand-soft text-brand-strong"
                    : "border-line-strong bg-surface text-ink",
                )
              : "sr-only"),
        )}
      >
        {message}
      </span>
    </span>
  );
}
