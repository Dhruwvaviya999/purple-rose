import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { siteConfig } from "@/config/site";
import { requireAdmin } from "@/lib/auth/current-user";
import { BrandWordmark } from "@/components/layout/brand-wordmark";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { Badge } from "@/components/ui/badge";
import { Container } from "@/components/ui/container";

export const metadata: Metadata = {
  title: { default: "Admin", template: `%s — ${siteConfig.name} Admin` },
  // The admin area must never be indexed, at any depth.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Admin shell.
 *
 * Kept outside the storefront route group and outside `(auth)` because it will
 * be protected by its own access checks and will never share the shop chrome.
 * Only the overview route exists today; the remaining sections are listed to
 * fix the information architecture, and are not linked.
 */
const adminSections = [
  "Products",
  "Inventory",
  "Orders",
  "Customers",
  "Coupons",
  "Reviews",
] as const;

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // The real gate. `proxy.ts` turns away requests with no session cookie, but
  // that is an optimistic filter with no idea who the cookie belongs to. This
  // resolves the session against the database and enforces the role, so a
  // customer with a perfectly valid session still cannot get in.
  const admin = await requireAdmin("/admin");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line bg-canvas">
        <Container className="flex h-16 items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <BrandWordmark />
            <Badge variant="neutral">Admin</Badge>
          </div>
          <div className="flex items-center gap-5">
            <span className="hidden font-sans text-sm text-ink-muted sm:inline">
              {admin.phoneNumber}
            </span>
            <Link
              href="/"
              className="font-sans text-sm font-medium text-ink-muted transition-colors hover:text-brand-strong"
            >
              View store
            </Link>
            <SignOutButton />
          </div>
        </Container>
      </header>

      <div className="flex-1 bg-surface">
        <Container className="flex flex-col gap-10 py-10 lg:flex-row lg:gap-14 lg:py-14">
          <nav aria-label="Admin sections" className="lg:w-52 lg:shrink-0">
            <ul className="flex flex-wrap gap-x-5 gap-y-2 lg:flex-col lg:gap-2">
              <li>
                <Link
                  href="/admin"
                  className="font-sans text-sm font-medium text-ink transition-colors hover:text-brand-strong"
                >
                  Overview
                </Link>
              </li>
              {adminSections.map((section) => (
                <li key={section}>
                  <span
                    title="Opens in a later release"
                    className="font-sans text-sm text-ink-subtle"
                  >
                    {section}
                    <span className="sr-only"> — opens in a later release</span>
                  </span>
                </li>
              ))}
            </ul>
          </nav>

          <main className="min-w-0 flex-1">{children}</main>
        </Container>
      </div>
    </div>
  );
}
