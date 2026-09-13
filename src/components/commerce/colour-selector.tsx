"use client";

import { useId } from "react";

import type { ProductColour } from "@/types/commerce";
import { cn } from "@/lib/utils/cn";

/**
 * Choose a colour.
 *
 * A radio group for the same reasons as the size selector: one tab stop,
 * arrow-key movement and a correct announcement, all from the browser.
 *
 * Colour is never conveyed by the swatch alone. Each option carries its name
 * as text for screen readers, the selected one is named in the heading above
 * the row, and the selected state is a ring rather than a shade change, so it
 * survives any kind of colour vision.
 *
 * The number of colours and their values come entirely from props. A swatch is
 * the one place a raw colour value belongs, because it describes the garment
 * rather than the interface.
 */
type ColourSelectorProps = {
  colours: readonly ProductColour[];
  value: string | null;
  onChange: (value: string) => void;
  name: string;
  className?: string;
};

export function ColourSelector({
  colours,
  value,
  onChange,
  name,
  className,
}: ColourSelectorProps) {
  const labelId = useId();

  if (colours.length === 0) {
    return null;
  }

  return (
    <fieldset className={className}>
      <legend id={labelId} className="sr-only">
        Choose a colour
      </legend>

      <div className="flex flex-wrap gap-2.5">
        {colours.map((colour) => {
          const checked = value === colour.slug;

          return (
            <label
              key={colour.slug}
              title={colour.name}
              className={cn(
                "relative flex size-10 cursor-pointer items-center justify-center rounded-full transition-all",
                "has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand",
                checked
                  ? "ring-2 ring-ink ring-offset-2 ring-offset-canvas"
                  : "ring-1 ring-inset ring-ink-950/15 hover:ring-ink-400",
                !colour.available && "cursor-not-allowed opacity-40",
              )}
            >
              <input
                type="radio"
                name={name}
                value={colour.slug}
                checked={checked}
                disabled={!colour.available}
                onChange={() => onChange(colour.slug)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                style={{ backgroundColor: colour.hex }}
                className="size-full rounded-full"
              />
              <span className="sr-only">
                {colour.available ? colour.name : `${colour.name}, sold out`}
              </span>
              {!colour.available ? (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 m-auto h-px w-8 -rotate-45 bg-ink-900"
                />
              ) : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
