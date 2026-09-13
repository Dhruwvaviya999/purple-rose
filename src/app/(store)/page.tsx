import {
  listMockCategories,
  listMockNewArrivals,
} from "@/features/storefront/mock/query";
import { CategoryTiles } from "@/features/storefront/components/category-tiles";
import {
  BrandStoryPanel,
  SeasonalPanel,
} from "@/features/storefront/components/editorial-panel";
import { Hero } from "@/features/storefront/components/hero";
import { NewsletterSignup } from "@/features/storefront/components/newsletter-signup";
import { ProductRail } from "@/components/commerce/product-grid";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";

/**
 * The home page.
 *
 * Entirely server-rendered: a Server Component composing Server Components.
 * Nothing on this page needs client state, so nothing on it ships JavaScript
 * beyond the header controls it inherits from the store layout.
 *
 * The order is the order a fashion shopper reads in: a statement, then ways
 * into the catalogue, then actual pieces, then why the brand exists, then the
 * season, then a way to hear about the next one.
 *
 * Both data calls here are the mock layer, and both are what Phase 5 swaps for
 * service calls returning the same types.
 */
export default function HomePage() {
  const categories = listMockCategories();
  const newArrivals = listMockNewArrivals(4);

  return (
    <>
      <Hero />

      <CategoryTiles categories={categories} />

      <Section surface="surface">
        <Container>
          <ProductRail
            title="New this week"
            headingId="new-arrivals"
            products={newArrivals}
            action={
              <ButtonLink href="/shop?sort=newest" variant="link" size="sm" className="px-0">
                See everything new
              </ButtonLink>
            }
          />
        </Container>
      </Section>

      <BrandStoryPanel />
      <SeasonalPanel />
      <NewsletterSignup />
    </>
  );
}
