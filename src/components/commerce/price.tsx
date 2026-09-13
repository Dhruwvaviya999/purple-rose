import { discountPercent, formatPrice } from "@/lib/utils/format-price";
import { cn } from "@/lib/utils/cn";

/**
 * A price, with the previous price and the saving when there is a genuine
 * reduction.
 *
 * Formatting is not done here: it comes from `formatPrice`, which reads the
 * currency from site configuration, so no component carries a currency symbol.
 *
 * The old price is struck through for sighted readers and introduced by
 * hidden text for everyone else, because a line through a number means
 * nothing when it is read aloud.
 */
type PriceProps = {
  price: number;
  compareAtPrice?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = {
  sm: { current: "text-sm", was: "text-xs" },
  md: { current: "text-base", was: "text-sm" },
  lg: { current: "text-xl sm:text-2xl", was: "text-base" },
} as const;

export function Price({
  price,
  compareAtPrice,
  size = "md",
  className,
}: PriceProps) {
  const saving = discountPercent(price, compareAtPrice);
  const scale = SIZES[size];

  return (
    <p className={cn("flex flex-wrap items-baseline gap-x-2 gap-y-1", className)}>
      <span className={cn("font-sans font-medium text-ink", scale.current)}>
        {formatPrice(price)}
      </span>

      {saving !== null && compareAtPrice !== undefined ? (
        <>
          <span className={cn("font-sans text-ink-subtle", scale.was)}>
            <span className="sr-only">Was </span>
            <s>{formatPrice(compareAtPrice)}</s>
          </span>
          <span className={cn("font-sans font-medium text-brand", scale.was)}>
            {saving}% off
          </span>
        </>
      ) : null}
    </p>
  );
}
