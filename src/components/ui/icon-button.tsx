import type { ComponentProps } from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

const iconButtonStyles = cva(
  [
    "inline-flex items-center justify-center rounded-control",
    "text-ink transition-colors hover:bg-surface-strong hover:text-brand-strong",
    "aria-disabled:cursor-not-allowed aria-disabled:text-ink-subtle aria-disabled:hover:bg-transparent aria-disabled:hover:text-ink-subtle",
  ],
  {
    variants: {
      size: {
        md: "size-10 [&_svg]:size-5",
        lg: "size-11 [&_svg]:size-[1.375rem]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

type IconButtonVariants = VariantProps<typeof iconButtonStyles>;

type IconButtonProps = ComponentProps<"button"> &
  IconButtonVariants & {
    /** Required: the icon itself is hidden from assistive technology. */
    label: string;
  };

/** Square, icon-only control. The accessible name comes from `label`. */
export function IconButton({
  className,
  size,
  label,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      className={cn(iconButtonStyles({ size }), className)}
      {...props}
    />
  );
}

type IconLinkProps = ComponentProps<typeof Link> &
  IconButtonVariants & {
    label: string;
  };

export function IconLink({ className, size, label, ...props }: IconLinkProps) {
  return (
    <Link
      aria-label={label}
      className={cn(iconButtonStyles({ size }), className)}
      {...props}
    />
  );
}
