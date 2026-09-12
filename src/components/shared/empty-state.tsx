import type { ElementType, ReactNode } from "react";

import { cn } from "@/lib/utils/cn";
import { Heading, Text } from "@/components/ui/typography";

type EmptyStateProps = {
  /** Decorative glyph rendered above the title. */
  icon?: ReactNode;
  title: string;
  /**
   * The element used for the title. Standalone pages pass "h1" so the
   * document still has a top-level heading; in-page states keep "h2".
   */
  titleAs?: Extract<ElementType, "h1" | "h2" | "h3">;
  description: string;
  /** Optional recovery or next-step controls. */
  action?: ReactNode;
  className?: string;
};

/**
 * The shared shape for "there is nothing here yet" surfaces: empty listings,
 * not-found pages and error fallbacks.
 */
export function EmptyState({
  icon,
  title,
  titleAs = "h2",
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "mx-auto flex max-w-md flex-col items-center text-center",
        className,
      )}
    >
      {icon ? (
        <span className="mb-6 flex size-14 items-center justify-center rounded-full bg-brand-soft text-brand [&_svg]:size-6">
          {icon}
        </span>
      ) : null}

      <Heading as={titleAs} level="md">
        {title}
      </Heading>

      <Text size="sm" className="mt-3">
        {description}
      </Text>

      {action ? <div className="mt-7 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}
