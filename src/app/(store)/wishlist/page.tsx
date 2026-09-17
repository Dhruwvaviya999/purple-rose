import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { getWishlist } from "@/lib/services/wishlist-service";
import { Breadcrumbs } from "@/components/commerce/breadcrumbs";
import { ProductGrid } from "@/components/commerce/product-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { HeartIcon } from "@/components/shared/icons";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Heading, Text } from "@/components/ui/typography";

/**
 * `noindex`, and `/wishlist` is also disallowed in `robots.ts`.
 *
 * Not because the contents are secret from the person reading them, but because
 * this page is one customer's and nobody else's. There is nothing here a search
 * result should ever point at, and nothing about a particular customer belongs
 * in metadata: the title and description below describe the *page*, and are the
 * same for everyone, whether they have saved forty pieces or none.
 *
 * `follow` stays on, so the products linked from here are still discovered
 * through their own canonical `/shop/[slug]` URLs.
 */
export const metadata: Metadata = {
  title: "Wishlist",
  description: "Pieces you have saved to come back to.",
  robots: { index: false, follow: true },
};

/**
 * The wishlist.
 *
 * A Server Component, and almost all of it is server-rendered: the heading, the
 * count, the grid and the empty state. The only JavaScript on the page is the
 * heart on each card, which is the one thing that has to be interactive.
 *
 * ## Who is looking
 *
 * `requireUser("/wishlist")` first. A signed-out visitor is sent to sign in and
 * brought back here afterwards, which `safeRedirectPath` permits because
 * `/wishlist` is on its allow-list. The customer is then whoever the session
 * resolved to, and `getWishlist` is scoped to their id — there is no parameter
 * on this route, and nothing in the URL names a list.
 *
 * ## Rendering and caching
 *
 * Rendered per request, and it must be. This is the first page in the
 * application whose entire content is one person's, so a cached copy served to
 * anybody else would be a data leak rather than a stale page.
 *
 * ## Queries
 *
 * Two: one to find the wishlist, one to read every item with its product, its
 * images and its variants joined in the same statement. Not one query per
 * saved piece. See `getWishlist`.
 *
 * ## Order
 *
 * Newest saved first, by `WishlistItem.createdAt`. What somebody saved last is
 * what they came back for, and it is stable — ordering by the product's own
 * dates would reshuffle a customer's list every time an admin edited something.
 */
export const dynamic = "force-dynamic";

export default async function WishlistPage() {
  const user = await requireUser("/wishlist");
  const { entries, count, unavailableCount } = await getWishlist(user.id);

  const products = entries.map((entry) => entry.product);

  // Everything on this page is saved by definition, so every heart is filled.
  const wishlisted = new Set(products.map((product) => product.id));

  const unavailableIds = new Set(
    entries.filter((entry) => !entry.available).map((entry) => entry.product.id),
  );

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

          <Text size="lg" className="mt-4">
            {count === 0
              ? "Somewhere to keep the pieces you are thinking about."
              : "Saved to your account, so they are here on any device you sign in on."}
          </Text>

          {count > 0 ? (
            <p className="mt-4 font-sans text-sm text-ink-muted">
              {count} {count === 1 ? "piece" : "pieces"} saved
              {unavailableCount > 0 ? (
                <>
                  {" · "}
                  {unavailableCount}{" "}
                  {unavailableCount === 1
                    ? "is not available right now"
                    : "are not available right now"}
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        {count > 0 ? (
          <ProductGrid
            products={products}
            wishlisted={wishlisted}
            unavailableIds={unavailableIds}
            priorityCount={4}
            className="mt-10"
          />
        ) : (
          <div className="mt-12 rounded-card border border-dashed border-line-strong bg-surface px-6 py-16 sm:py-20">
            <EmptyState
              icon={<HeartIcon />}
              title="Your wishlist is waiting"
              description="Save the pieces you keep coming back to and they will be here, on whichever device you sign in on."
              action={
                <ButtonLink href="/shop" variant="secondary">
                  Explore the collection
                </ButtonLink>
              }
            />
          </div>
        )}
      </Container>
    </Section>
  );
}
