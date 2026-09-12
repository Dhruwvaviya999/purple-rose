import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * The single horizontal gutter for the whole application. Page content is
 * never padded ad hoc; it is wrapped in a Container so every surface lines up.
 * Semantic landmarks wrap the Container rather than replacing it.
 */
export function Container({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-page px-5 sm:px-8 lg:px-12",
        className,
      )}
      {...props}
    />
  );
}
