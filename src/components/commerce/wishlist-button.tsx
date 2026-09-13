import { HeartIcon } from "@/components/shared/icons";
import { cn } from "@/lib/utils/cn";

/**
 * Save-for-later control.
 *
 * The wishlist has no storage yet: there is no table, no action and nothing to
 * write to. So this renders the real control in its real position and marks
 * itself unavailable rather than pretending. A heart that fills in and then
 * loses the item on refresh would be worse than one that is honestly off.
 *
 * `aria-disabled` rather than `disabled` keeps the control reachable by
 * keyboard, so someone tabbing through a card still meets it and hears why it
 * does nothing. This follows the convention the header placeholders already
 * use.
 *
 * When persistence arrives this becomes a client component wrapping a Server
 * Action, with `pressed` driven by real state. The markup and the position do
 * not change.
 */
type WishlistButtonProps = {
  /** Used in the accessible name so the control is not just "Save". */
  productName: string;
  className?: string;
  size?: "sm" | "md";
};

const NOTE = "Saving to a wishlist opens in a later release";

export function WishlistButton({
  productName,
  className,
  size = "md",
}: WishlistButtonProps) {
  return (
    <button
      type="button"
      aria-disabled="true"
      title={NOTE}
      aria-label={`Save ${productName} — ${NOTE}`}
      className={cn(
        "inline-flex items-center justify-center rounded-full bg-canvas/90 text-ink-muted shadow-subtle backdrop-blur-none transition-colors",
        "hover:text-brand-strong",
        "aria-disabled:cursor-not-allowed aria-disabled:text-ink-subtle aria-disabled:hover:text-ink-subtle",
        size === "sm" ? "size-9 [&_svg]:size-4" : "size-11 [&_svg]:size-5",
        className,
      )}
    >
      <HeartIcon />
    </button>
  );
}
