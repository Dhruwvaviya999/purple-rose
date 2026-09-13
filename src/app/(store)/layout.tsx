import type { ReactNode } from "react";

import { listMockCategories } from "@/features/storefront/mock/query";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

/**
 * Storefront shell: every customer-facing page renders inside the header and
 * footer chrome. The admin area and authentication screens deliberately sit
 * outside this group so they can carry their own chrome.
 */
export default function StoreLayout({ children }: { children: ReactNode }) {
  // Read here rather than inside the header, so no component imports
  // catalogue data. Phase 5 swaps this one call for a service call.
  const categories = listMockCategories().map((category) => ({
    slug: category.slug,
    name: category.name,
  }));

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-control focus:bg-brand focus:px-4 focus:py-2 focus:font-sans focus:text-sm focus:text-on-brand"
      >
        Skip to content
      </a>

      <SiteHeader categories={categories} />

      <main id="main-content" className="flex-1">
        {children}
      </main>

      <SiteFooter />
    </>
  );
}
