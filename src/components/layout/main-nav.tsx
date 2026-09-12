import Link from "next/link";

import { primaryNav } from "@/config/navigation";
import { cn } from "@/lib/utils/cn";

type MainNavProps = {
  className?: string;
};

/** Desktop primary navigation. Mirrors `primaryNav` from configuration. */
export function MainNav({ className }: MainNavProps) {
  return (
    <nav aria-label="Main" className={cn("hidden md:block", className)}>
      <ul className="flex items-center gap-7">
        {primaryNav.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="font-sans text-sm font-medium text-ink transition-colors hover:text-brand-strong"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
