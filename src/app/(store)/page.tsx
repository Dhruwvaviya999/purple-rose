import { getCategoryTiles } from "@/lib/services/category-service";
import { listMerchandisedProducts } from "@/lib/services/product-service";
import { getWishlistStateFor } from "@/lib/wishlist/page-state";
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
 * into the catalogue, then actual pieces, then why the brand exists, then
 * more pieces, then the season, then a way to hear about the next one.
 *
 * Every rail is driven by a merchandising flag somebody set on a product. In
 * particular, the second rail is **not** a sales ranking: no order system
 * exists, nothing has been sold, and `bestSeller` is an editorial choice about
 * what to put in front of people. Its heading says so.
 *
 * ## Rendering
 *
 * Rendered per request rather than prerendered at build.
 *
 * Prerendering it would be better for a shopper — three queries an hour
 * instead of three a visit — but it would mean `next build` could not finish
 * without a reachable database, and Phase 2 deliberately arranged for the
 * opposite: `src/lib/db/client.ts` defers construction precisely so that a
 * missing connection string is a runtime condition rather than a build
 * failure. A deployment that breaks because the database was briefly
 * unreachable during the build is a worse trade than three indexed queries.
 *
 * The three queries are small, hit indexed columns and run together. The
 * product pages, which is where the traffic and the cost actually are, are
 * cached: see `/shop/[slug]`.
 *
 * The way to have both is Cache Components (`cacheComponents: true` plus
 * `use cache`), which prerenders the shell and fills cached data at runtime.
 * That changes how every route in the application renders, including the
 * authenticated ones, so it is its own piece of work rather than a side
 * effect of connecting the catalogue.
 */
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // Independent reads, so they go together rather than in sequence.
  const [categories, newArrivals, picks] = await Promise.all([
    getCategoryTiles(4),
    listMerchandisedProducts("new-arrivals", 4),
    listMerchandisedProducts("best-sellers", 4),
  ]);

  // One query for every heart on the page, and none at all for a visitor who
  // is not signed in. It has to follow the product reads because it needs the
  // ids, which is why it is not in the batch above; it is a single indexed
  // lookup on a set of eight.
  const wishlisted = await getWishlistStateFor([
    ...newArrivals.map((product) => product.id),
    ...picks.map((product) => product.id),
  ]);

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
            wishlisted={wishlisted}
            action={
              <ButtonLink href="/shop?new=true" variant="link" size="sm" className="px-0">
                See everything new
              </ButtonLink>
            }
          />
        </Container>
      </Section>

      <BrandStoryPanel />

      <Section surface="canvas">
        <Container>
          <ProductRail
            title="Purple Rose picks"
            headingId="shop-picks"
            products={picks}
            wishlisted={wishlisted}
            action={
              <ButtonLink href="/shop" variant="link" size="sm" className="px-0">
                See everything
              </ButtonLink>
            }
          />
        </Container>
      </Section>

      <SeasonalPanel />
      <NewsletterSignup />
    </>
  );
}
