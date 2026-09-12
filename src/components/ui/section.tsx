import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

const sectionStyles = cva("", {
  variants: {
    spacing: {
      sm: "py-12 sm:py-16",
      md: "py-16 sm:py-20 lg:py-24",
      lg: "py-20 sm:py-28 lg:py-32",
    },
    surface: {
      canvas: "bg-canvas",
      surface: "bg-surface",
      brand: "bg-brand-soft",
    },
  },
  defaultVariants: { spacing: "md", surface: "canvas" },
});

type SectionProps = ComponentProps<"section"> &
  VariantProps<typeof sectionStyles>;

/** Vertical rhythm wrapper. Pair with `Container` for the horizontal gutter. */
export function Section({
  className,
  spacing,
  surface,
  ...props
}: SectionProps) {
  return (
    <section
      className={cn(sectionStyles({ spacing, surface }), className)}
      {...props}
    />
  );
}
