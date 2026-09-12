import { BrandWordmark } from "./brand-wordmark";
import { HeaderActions } from "./header-actions";
import { MainNav } from "./main-nav";
import { MobileNav } from "./mobile-nav";
import { Container } from "@/components/ui/container";

/**
 * Storefront header. A server component: only the mobile drawer inside it
 * needs client-side state.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas">
      <Container className="flex h-16 items-center justify-between gap-4 lg:h-18">
        <div className="flex items-center gap-8 lg:gap-10">
          <BrandWordmark />
          <MainNav />
        </div>

        <div className="flex items-center gap-1">
          <HeaderActions />
          <MobileNav />
        </div>
      </Container>
    </header>
  );
}
