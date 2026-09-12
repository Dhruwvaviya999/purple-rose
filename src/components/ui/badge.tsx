import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

const badgeStyles = cva(
  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-sans text-xs font-medium",
  {
    variants: {
      variant: {
        brand: "bg-brand-soft text-brand-strong",
        neutral: "bg-surface-strong text-ink-muted",
        outline: "border border-line-strong text-ink-muted",
      },
    },
    defaultVariants: { variant: "brand" },
  },
);

type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badgeStyles>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeStyles({ variant }), className)} {...props} />
  );
}
