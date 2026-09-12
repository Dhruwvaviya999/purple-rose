import type { ComponentProps } from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

const buttonStyles = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "font-sans font-medium transition-colors",
    "disabled:pointer-events-none disabled:opacity-50",
    "aria-disabled:pointer-events-none aria-disabled:opacity-60",
  ],
  {
    variants: {
      variant: {
        primary: "bg-brand text-on-brand hover:bg-brand-strong",
        secondary:
          "border border-line-strong bg-canvas text-ink hover:bg-surface-strong",
        ghost: "text-ink hover:bg-surface-strong",
        link: "text-brand underline decoration-line-strong underline-offset-4 hover:decoration-brand",
      },
      size: {
        sm: "h-9 rounded-control px-3.5 text-sm",
        md: "h-11 rounded-control px-5 text-sm",
        lg: "h-12 rounded-control px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

type ButtonVariantProps = VariantProps<typeof buttonStyles>;

type ButtonProps = ComponentProps<"button"> & ButtonVariantProps;

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonStyles({ variant, size }), className)}
      {...props}
    />
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & ButtonVariantProps;

/** A `next/link` that wears the button styles. Keeps links as links. */
export function ButtonLink({
  className,
  variant,
  size,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={cn(buttonStyles({ variant, size }), className)}
      {...props}
    />
  );
}
