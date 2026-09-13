import type { ComponentProps } from "react";

import { cn } from "@/lib/utils/cn";

/**
 * A placeholder block for content that has not arrived.
 *
 * Skeletons reserve the space the real content will take, so nothing jumps
 * when it loads. They are hidden from assistive technology: a screen reader
 * should hear the loading status announced once, not read six grey rectangles.
 *
 * The pulse is a Tailwind animation, and the global reduced-motion rule in
 * globals.css stops it for anyone who has asked for less movement.
 */
export function Skeleton({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-control bg-surface-strong", className)}
      {...props}
    />
  );
}
