import Link from "next/link";

import { siteConfig } from "@/config/site";
import { cn } from "@/lib/utils/cn";

/**
 * The Purple Rose text logo, linking home.
 *
 * Set in the display serif with the second word in the brand accent, so the
 * identity reads without an image asset. The visible mark is hidden from
 * assistive technology and replaced by a single clear link name.
 */
export function BrandWordmark({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "text-ink transition-colors hover:text-brand-strong",
        className,
      )}
    >
      <span className="sr-only">{siteConfig.name} — home</span>
      <span
        aria-hidden="true"
        className="font-display text-xl font-normal tracking-tight sm:text-2xl"
      >
        Purple <span className="text-brand">Rose</span>
      </span>
    </Link>
  );
}
