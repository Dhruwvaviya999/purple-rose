import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  findMockProductBySlug,
  listMockProductSlugs,
  listMockRelatedProducts,
} from "@/features/storefront/mock/query";
import { Breadcrumbs } from "@/components/commerce/breadcrumbs";
import { Price } from "@/components/commerce/price";
import { ProductBadge, pickPrimaryBadge } from "@/components/commerce/product-badge";
import { ProductGallery } from "@/components/commerce/product-gallery";
import { ProductPurchasePanel } from "@/components/commerce/product-purchase-panel";
import { ProductRail } from "@/components/commerce/product-grid";
import { ReturnIcon, StarIcon, TruckIcon } from "@/components/shared/icons";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Heading, Text } from "@/components/ui/typography";

/**
 * Product page.
 *
 * A Server Component that composes presentation components and passes typed
 * data down. The two interactive parts, the gallery and the purchase panel,
 * are their own client components, so the description, the details, the
 * delivery notes and the related rail are all server-rendered.
 *
 * Data comes from the mock layer, which is the only line Phase 5 changes here:
 * `findMockProductBySlug` becomes a service call returning the same
 * `ProductDetailData`, and nothing below it moves.
 */

/** Only the slugs that exist are routable; anything else is a 404. */
export function generateStaticParams() {
  return listMockProductSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  props: PageProps<"/shop/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const product = findMockProductBySlug(slug);

  if (!product) {
    return { title: "Piece not found" };
  }

  return {
    title: product.name,
    description: product.description.slice(0, 155),
    openGraph: {
      title: product.name,
      description: product.description.slice(0, 155),
      images: [{ url: product.image.src, alt: product.image.alt }],
    },
  };
}

export default async function ProductPage(props: PageProps<"/shop/[slug]">) {
  const { slug } = await props.params;
  const product = findMockProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const badge = pickPrimaryBadge(product.badges, product.inStock);
  const related = listMockRelatedProducts(slug);

  return (
    <>
      <Section spacing="sm">
        <Container>
          <Breadcrumbs
            items={[
              { label: "Home", href: "/" },
              { label: "Shop", href: "/shop" },
              {
                label: product.category.name,
                href: `/shop?category=${product.category.slug}`,
              },
              { label: product.name },
            ]}
          />

          <div className="mt-7 grid gap-10 lg:grid-cols-2 lg:gap-14">
            <ProductGallery images={product.images} productName={product.name} />

            <div className="lg:pt-2">
              {badge ? <ProductBadge kind={badge} className="mb-4" /> : null}

              <Heading as="h1" level="lg">
                {product.name}
              </Heading>

              <p className="mt-2 font-sans text-sm text-ink-subtle">
                {product.category.name}
              </p>

              <Price
                price={product.price}
                compareAtPrice={product.compareAtPrice}
                size="lg"
                className="mt-5"
              />

              <p className="mt-2 font-sans text-xs text-ink-subtle">
                Inclusive of all taxes
              </p>

              <Text className="mt-7">{product.description}</Text>

              <div className="mt-9">
                <ProductPurchasePanel product={product} />
              </div>

              <div className="mt-10 space-y-8 border-t border-line pt-8">
                <section aria-labelledby="product-details">
                  <h2
                    id="product-details"
                    className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle"
                  >
                    Details
                  </h2>
                  <ul className="mt-4 space-y-2">
                    {product.details.map((detail) => (
                      <li
                        key={detail}
                        className="font-sans text-sm leading-relaxed text-ink-muted"
                      >
                        {detail}
                      </li>
                    ))}
                  </ul>
                </section>

                <DeliveryNotes />
                <ReviewsPlaceholder />
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {related.length > 0 ? (
        <Section surface="surface">
          <Container>
            <ProductRail
              title="You might also like"
              headingId="related-products"
              products={related}
              action={
                <ButtonLink href="/shop" variant="link" size="sm" className="px-0">
                  See everything
                </ButtonLink>
              }
            />
          </Container>
        </Section>
      ) : null}
    </>
  );
}

/**
 * Shipping and returns.
 *
 * Written as statements of intent rather than promises with numbers attached,
 * because no shipping is integrated and no returns policy is published. A
 * "delivered in 3 days" line would be an invented commitment.
 */
function DeliveryNotes() {
  const notes = [
    {
      icon: <TruckIcon />,
      title: "Shipping",
      body: "Rates and timelines are confirmed when checkout opens.",
    },
    {
      icon: <ReturnIcon />,
      title: "Returns",
      body: "The returns window is published alongside the policy pages.",
    },
  ];

  return (
    <section aria-labelledby="product-delivery">
      <h2
        id="product-delivery"
        className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle"
      >
        Shipping and returns
      </h2>

      <ul className="mt-4 space-y-4">
        {notes.map((note) => (
          <li key={note.title} className="flex gap-3">
            <span
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-ink-subtle [&_svg]:size-5"
            >
              {note.icon}
            </span>
            <div>
              <p className="font-sans text-sm font-medium text-ink">
                {note.title}
              </p>
              <p className="font-sans text-sm leading-relaxed text-ink-muted">
                {note.body}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Where reviews will go. No ratings are shown, because none have been left. */
function ReviewsPlaceholder() {
  return (
    <section aria-labelledby="product-reviews">
      <h2
        id="product-reviews"
        className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle"
      >
        Reviews
      </h2>
      <div className="mt-4 flex gap-3">
        <span
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-ink-subtle [&_svg]:size-5"
        >
          <StarIcon />
        </span>
        <p className="font-sans text-sm leading-relaxed text-ink-muted">
          No reviews yet. Customers can leave one once orders exist.
        </p>
      </div>
    </section>
  );
}
