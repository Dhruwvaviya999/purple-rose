import type { ReactNode } from "react";

import { getCategoryNavigation } from "@/lib/services/category-service";
import { getCartForRequest } from "@/lib/cart/page-state";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

/**
 * Storefront shell: every customer-facing page renders inside the header and
 * footer chrome. The admin area and authentication screens deliberately sit
 * outside this group so they can carry their own chrome.
 */
export default async function StoreLayout({ children }: { children: ReactNode }) {
  // Read here rather than inside the header, so no component queries the
  // database. The header, the mobile drawer, the search panel and the footer
  // all take the same list as props, which is why it is fetched once for the
  // whole storefront instead of four times.
  //
  // The bag follows the same rule, and one more: `getCartForRequest` is
  // request-scoped, so `/cart` rendering underneath this reuses the very same
  // read rather than issuing a second. A visitor who has never added anything
  // costs no query at all. See `lib/cart/page-state.ts`.
  const [categories, cart] = await Promise.all([
    getCategoryNavigation(),
    getCartForRequest(),
  ]);

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-brand focus:px-4 focus:py-2 focus:font-sans focus:text-sm focus:text-on-brand"
      >
        Skip to content
      </a>

      <SiteHeader categories={categories} cart={cart} />

      <main id="main-content" className="flex-1">
        {children}
      </main>

      <SiteFooter categories={categories} />
    </>
  );
}
