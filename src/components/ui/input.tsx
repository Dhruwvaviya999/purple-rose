import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

/** Shared control shape, so future selects and textareas match inputs. */
const controlClasses = [
  "block w-full rounded-control border border-line-strong bg-canvas",
  "px-3.5 py-2.5 font-sans text-sm text-ink",
  "placeholder:text-ink-subtle",
  "transition-colors hover:border-line-strong/80",
  "disabled:cursor-not-allowed disabled:bg-surface disabled:text-ink-subtle",
];

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return (
    <input type={type} className={cn(controlClasses, className)} {...props} />
  );
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return (
    <label
      className={cn(
        "block font-sans text-sm font-medium text-ink",
        className,
      )}
      {...props}
    />
  );
}

/** Help or error text tied to a control via `aria-describedby`. */
export function FieldHint({ className, ...props }: ComponentProps<"p">) {
  return (
    <p
      className={cn("font-sans text-xs leading-relaxed text-ink-subtle", className)}
      {...props}
    />
  );
}

type FieldProps = ComponentProps<"div">;

/** Groups a label, control and hint with consistent spacing. */
export function Field({ className, ...props }: FieldProps) {
  return <div className={cn("space-y-2", className)} {...props} />;
}
