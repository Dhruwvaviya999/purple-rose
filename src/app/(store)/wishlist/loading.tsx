import { Breadcrumbs } from "@/components/commerce/breadcrumbs";
import { ProductGridSkeleton } from "@/components/commerce/product-grid";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Heading } from "@/components/ui/typography";

/**
 * What is shown while the wishlist is being read.
 *
 * The page is rendered per request and reads two queries against a database
 * that may be on another continent, so there is a real moment to fill. The
 * shell that does not depend on the data — breadcrumb and heading — is drawn
 * immediately, and only the grid is a placeholder, so the page does not appear
 * to jump when the content lands.
 *
 * `ProductGridSkeleton` announces "Loading products" once, politely, and hides
 * the boxes themselves from assistive technology, so nobody hears a run of
 * empty list items.
 *
 * Eight cards rather than a guess at the real number: the count is not known
 * yet, and inventing one would mean the layout shifting when it turns out to be
 * wrong.
 */
export default function WishlistLoading() {
  return (
    <Section>
      <Container>
        <Breadcrumbs
          items={[{ label: "Home", href: "/" }, { label: "Wishlist" }]}
        />

        <div className="mt-6 max-w-2xl">
          <Heading as="h1" level="xl">
            Wishlist
          </Heading>
        </div>

        <ProductGridSkeleton count={8} className="mt-10" />
      </Container>
    </Section>
  );
}
