import type { ComponentProps, ElementType } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils/cn";

/**
 * The type scale. Visual weight is chosen with `level`, while the rendered
 * element is chosen with `as`, so heading order stays correct for screen
 * readers and outline tools regardless of how large a heading looks.
 */
const headingStyles = cva("font-display font-light tracking-tight", {
  variants: {
    level: {
      display: "text-4xl leading-[1.05] sm:text-5xl lg:text-6xl",
      xl: "text-3xl leading-[1.1] sm:text-4xl lg:text-5xl",
      lg: "text-2xl leading-tight sm:text-3xl",
      md: "font-sans text-lg font-medium leading-snug tracking-normal sm:text-xl",
      sm: "font-sans text-base font-medium leading-snug tracking-normal",
    },
  },
  defaultVariants: { level: "lg" },
});

type HeadingProps = ComponentProps<"h2"> &
  VariantProps<typeof headingStyles> & {
    as?: Extract<ElementType, "h1" | "h2" | "h3" | "h4" | "h5" | "h6">;
  };

export function Heading({
  as: Tag = "h2",
  level,
  className,
  ...props
}: HeadingProps) {
  return <Tag className={cn(headingStyles({ level }), className)} {...props} />;
}

const textStyles = cva("font-sans", {
  variants: {
    size: {
      lg: "text-lg leading-relaxed",
      md: "text-base leading-relaxed",
      sm: "text-sm leading-relaxed",
    },
    tone: {
      default: "text-ink",
      muted: "text-ink-muted",
      subtle: "text-ink-subtle",
    },
  },
  defaultVariants: { size: "md", tone: "muted" },
});

type TextProps = ComponentProps<"p"> &
  VariantProps<typeof textStyles> & {
    as?: Extract<ElementType, "p" | "span" | "div">;
  };

export function Text({
  as: Tag = "p",
  size,
  tone,
  className,
  ...props
}: TextProps) {
  return <Tag className={cn(textStyles({ size, tone }), className)} {...props} />;
}

/** Small uppercase label that sits above a heading. */
export function Eyebrow({
  className,
  ...props
}: ComponentProps<"p">) {
  return (
    <p
      className={cn(
        "font-sans text-xs font-medium uppercase tracking-eyebrow text-brand",
        className,
      )}
      {...props}
    />
  );
}
