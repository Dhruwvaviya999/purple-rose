import type { StorefrontCategory } from "@/types/commerce";
import { Container } from "@/components/ui/container";
import { AnnouncementBar } from "./announcement-bar";
import { BrandWordmark } from "./brand-wordmark";
import { HeaderActions } from "./header-actions";
import { MainNav } from "./main-nav";
import { MobileNav } from "./mobile-nav";

/**
 * Storefront header.
 *
 * A server component. The controls that need state are their own small client
 * components, so the header, the navigation and the announcement bar ship no
 * JavaScript.
 *
 * Sticky, with the announcement bar scrolling away above it: a shopper deep in
 * a listing needs search and the bag, not a shipping notice.
 *
 * Deliberately **not** translucent and **not** blurred. A `backdrop-filter`
 * makes an element a containing block for fixed descendants, which is exactly
 * what trapped the mobile drawer inside the header in Phase 1. The drawers are
 * portalled out of this subtree now, so it would not break again, but a solid
 * header is also simply cleaner behind a scrolling product grid.
 *
 * Categories arrive as props from the store layout, so nothing under
 * `components/` imports catalogue data or knows whether it came from a file or
 * a table.
 */
export function SiteHeader({
  categories,
}: {
  categories: readonly Pick<StorefrontCategory, "slug" | "name">[];
}) {
  return (
    <>
      <AnnouncementBar />

      <header className="sticky top-0 z-40 border-b border-line bg-canvas">
        <Container className="flex h-16 items-center gap-3 lg:h-18">
          {/* Order differs by breakpoint: the wordmark leads on desktop, and
              on a phone the menu comes first where a thumb reaches. */}
          <div className="flex items-center gap-2 lg:hidden">
            <MobileNav categories={categories} />
          </div>

          <div className="flex flex-1 items-center gap-8 lg:flex-none lg:gap-10">
            <BrandWordmark className="lg:shrink-0" />
            <MainNav categories={categories} />
          </div>

          <div className="ml-auto flex items-center">
            <HeaderActions searchSuggestions={categories} />
          </div>
        </Container>
      </header>
    </>
  );
}
