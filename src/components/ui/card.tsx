import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

const cardStyles = cva("rounded-card", {
  variants: {
    variant: {
      outline: "border border-line bg-canvas",
      soft: "border border-line/70 bg-surface",
      raised: "border border-line bg-canvas shadow-raised",
    },
    padding: {
      none: "",
      sm: "p-5",
      md: "p-6 sm:p-7",
      lg: "p-7 sm:p-9",
    },
  },
  defaultVariants: { variant: "outline", padding: "md" },
});

type CardProps = ComponentProps<"div"> & VariantProps<typeof cardStyles>;

export function Card({ className, variant, padding, ...props }: CardProps) {
  return (
    <div
      className={cn(cardStyles({ variant, padding }), className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("space-y-2", className)} {...props} />;
}

