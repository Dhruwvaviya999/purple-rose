import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { siteConfig } from "@/config/site";
import {
  getProductBySlug,
  listRelatedProducts,
} from "@/lib/services/product-service";
import { getWishlistStateFor } from "@/lib/wishlist/page-state";
import { Breadcrumbs } from "@/components/commerce/breadcrumbs";
import { Price } from "@/components/commerce/price";
import { ProductBadge, pickPrimaryBadge } from "@/components/commerce/product-badge";
import {
  ProductColourGallery,
  ProductVariantProvider,
} from "@/components/commerce/product-variant-selection";
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
 * data down. The interactive parts, the gallery and the purchase panel, are
 * client components sharing one selection, so the description, the details,
 * the delivery notes and the related rail are all server-rendered and are
 * handed through the provider as children.
 *
 * ## Rendering
 *
 * Rendered per request, like every other page in the storefront.
 *
 * Not for want of trying to cache it. A product page is the obvious candidate
 * for incremental regeneration: the data changes when somebody edits it, not
 * when somebody looks at it. What rules it out is the header. `AccountMenu` is
 * a Server Component that reads the session cookie to decide between "Sign in"
 * and the account panel, it lives in the store layout, and a cached response
 * cannot contain a personalised header. Marking this route static produced a
 * `DYNAMIC_SERVER_USAGE` failure on the first real request, which is the
 * framework saying exactly that.
 *
 * Phase 4 recorded the same trade-off for the whole storefront. Caching the
 * catalogue means separating the personalised part from the cacheable part:
 * Partial Prerendering or Cache Components, so the header is a dynamic hole in
 * a prerendered shell, or moving the account control to the client. Either is
 * its own piece of work, and neither belongs in a phase about the catalogue.
 *
 * The cost is bounded and small: four or five queries on indexed columns, with
 * the product itself fetched once and shared between the metadata and the page.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: PageProps<"/shop/[slug]">,
): Promise<Metadata> {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);

  if (!product) {
    return { title: "Piece not found", robots: { index: false, follow: false } };
  }

  // Copy written for a search result where there is any, and the product's own
  // description where there is not. Nothing here is invented from the name.
  const description = product.seoDescription ?? product.description.slice(0, 155);
  const canonical = `/shop/${product.slug}`;

  return {
    title: product.seoTitle ?? product.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      url: canonical,
      title: product.name,
      description,
      siteName: siteConfig.name,
      images: [
        {
          url: product.image.src,
          alt: product.image.alt,
          width: product.image.width,
          height: product.image.height,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: product.name,
      description,
      images: [product.image.src],
    },
    other: {
      // Real values read off the row, so a shopping crawler is told the same
      // price and availability the page shows. Amounts are converted from
      // paise to the major unit once, here, as an exact integer division.
      "product:price:amount": (product.price / 100).toFixed(2),
      "product:price:currency": siteConfig.currency.code,
      "product:availability": product.inStock ? "in stock" : "out of stock",
      "product:retailer_item_id": product.articleNumber,
    },
  };
}

export default async function ProductPage(props: PageProps<"/shop/[slug]">) {
  const { slug } = await props.params;
  const product = await getProductBySlug(slug);

  // Missing, still a draft or archived all end here. One response for all
  // three, so the existence of an unpublished piece is not revealed by a
  // different reply.
  if (!product) {
    notFound();
  }

  const badge = pickPrimaryBadge(product.badges, product.inStock);
  const related = await listRelatedProducts(slug);

  // This product and the related rail in one lookup, so the page does not ask
  // twice. Anonymous visitors get `null` without a query, and the panel and the
  // cards then render the sign-in variant of the heart.
  const wishlisted = await getWishlistStateFor([
    product.id,
    ...related.map((entry) => entry.id),
  ]);

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

          {/* The provider is a client component; everything inside it that is
              not a control stays server-rendered and is passed through as
              children. It exists so one colour choice moves both the gallery
              and the size row. */}
          <ProductVariantProvider product={product}>
            <div className="mt-7 grid gap-10 lg:grid-cols-2 lg:gap-14">
              <ProductColourGallery productName={product.name} />

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
                  <ProductPurchasePanel
                    product={product}
                    wishlisted={wishlisted ? wishlisted.has(product.id) : null}
                  />
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
          </ProductVariantProvider>
        </Container>
      </Section>

      {related.length > 0 ? (
        <Section surface="surface">
          <Container>
            <ProductRail
              title="You might also like"
              headingId="related-products"
              products={related}
              wishlisted={wishlisted}
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
