import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";

import { siteConfig } from "@/config/site";
import { requireAdmin } from "@/lib/auth/current-user";
import { BrandWordmark } from "@/components/layout/brand-wordmark";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { AdminNav } from "@/features/admin/components/admin-nav";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = {
  title: { default: "Admin", template: `%s — ${siteConfig.name} Admin` },
  // The admin area must never be indexed, at any depth.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Admin shell.
 *
 * Outside the storefront route group and outside `(auth)` because it shares
 * neither their chrome nor their manner. The storefront is editorial; this is
 * a workspace, and it is laid out like one: a fixed sidebar on a wide screen,
 * a horizontal strip of sections on a narrow one, and content that fills
 * whatever is left.
 *
 * Reads the session, so every page under it renders per request. That is the
 * correct answer for an authenticated area and it is not a caching decision to
 * revisit.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  // The real gate. `proxy.ts` turns away requests with no session cookie, but
  // that is an optimistic filter with no idea who the cookie belongs to. This
  // resolves the session against the database and enforces the role, so a
  // customer with a perfectly valid session still cannot get in.
  //
  // Each page underneath checks again. A layout and the page beneath it render
  // concurrently, so a layout that redirects does not reliably stop the page
  // from producing output, and every mutation checks a third time in its own
  // Server Action, which is the only check an attacker cannot route around.
  const admin = await requireAdmin("/admin");

  return (
    <div className="flex min-h-full flex-1 flex-col bg-surface">
      <header className="border-b border-line bg-canvas">
        <div className="mx-auto flex h-16 w-full max-w-[100rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <BrandWordmark />
            <Badge variant="neutral">Admin</Badge>
          </div>

          <div className="flex shrink-0 items-center gap-4">
            <span className="hidden font-sans text-sm text-ink-muted md:inline">
              {admin.phoneNumber}
            </span>
            <Link
              href="/"
              // `inline-block` and vertical padding so the tap target clears
              // 24px on a phone. Inline text defaults to its line box, which
              // is 20px here and too small to hit reliably.
              className="inline-block py-1 font-sans text-sm font-medium text-ink-muted transition-colors hover:text-brand-strong"
            >
              View store
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[100rem] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:gap-10 lg:px-8 lg:py-8">
        <AdminNav />
        <main className="min-w-0 flex-1 pb-10">{children}</main>
      </div>
    </div>
  );
}
