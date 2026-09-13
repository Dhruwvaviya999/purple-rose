"use client";

import { useId } from "react";

import type { ProductSize } from "@/types/commerce";
import { cn } from "@/lib/utils/cn";

/**
 * Choose a size.
 *
 * A radio group, not a row of buttons. Radios are what a browser and a screen
 * reader already understand as "pick exactly one of these", which brings arrow
 * key navigation, a single tab stop for the whole group and a correct
 * announcement, none of which would need writing.
 *
 * The component knows nothing about clothing. It renders the options it is
 * given, so a garment sized 28 to 36, or one that comes in Free size only,
 * works without a change here. Which sizes exist and which are sold out are
 * facts about a product, and they arrive as props.
 */
type SizeSelectorProps = {
  sizes: readonly ProductSize[];
  value: string | null;
  onChange: (value: string) => void;
  /** Groups the radios; must be unique per rendered product. */
  name: string;
  className?: string;
};

export function SizeSelector({
  sizes,
  value,
  onChange,
  name,
  className,
}: SizeSelectorProps) {
  const labelId = useId();

  if (sizes.length === 0) {
    return null;
  }

  return (
    <fieldset className={className}>
      <legend id={labelId} className="sr-only">
        Choose a size
      </legend>

      <div className="flex flex-wrap gap-2">
        {sizes.map((size) => {
          const checked = value === size.value;

          return (
            <label
              key={size.value}
              className={cn(
                "relative flex min-w-14 cursor-pointer items-center justify-center rounded-control border px-4 py-2.5 font-sans text-sm transition-colors",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
                checked
                  ? "border-ink bg-ink text-canvas"
                  : "border-line-strong bg-canvas text-ink hover:border-ink-400",
                !size.available &&
                  "cursor-not-allowed border-line bg-surface text-ink-300 hover:border-line",
              )}
            >
              <input
                type="radio"
                name={name}
                value={size.value}
                checked={checked}
                disabled={!size.available}
                onChange={() => onChange(size.value)}
                className="sr-only"
              />
              {/* The visible label is hidden from assistive technology and
                  restated below, so that sold-out is spoken rather than
                  conveyed only by a faded box and a diagonal line. */}
              <span aria-hidden="true">{size.label}</span>
              <span className="sr-only">
                {size.available ? size.label : `${size.label}, sold out`}
              </span>
              {!size.available ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 m-auto h-px w-[85%] -rotate-12 bg-line-strong"
                />
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
