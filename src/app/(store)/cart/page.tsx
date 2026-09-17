import type { Metadata } from "next";

import { getCartForRequest } from "@/lib/cart/page-state";
import { formatPrice } from "@/lib/utils/format-price";
import { Breadcrumbs } from "@/components/commerce/breadcrumbs";
import { CartLineItem } from "@/components/commerce/cart-line-item";
import { ClearBagButton } from "@/components/commerce/clear-bag-button";
import { EmptyState } from "@/components/shared/empty-state";
import { BagIcon } from "@/components/shared/icons";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Heading, Text } from "@/components/ui/typography";

/**
 * `noindex`, like the wishlist and for the same reason.
 *
 * A bag is one person's, and for most of them there is not even an account
 * behind it. There is nothing here a search result should point at, and nothing
 * about a particular shopper belongs in metadata: the title and description
 * below describe the *page* and are identical for everyone.
 */
export const metadata: Metadata = {
  title: "Bag",
  description: "The pieces you are ready to order.",
  robots: { index: false, follow: true },
};

/**
 * The bag, full size.
 *
 * A Server Component. The lines, the totals and the empty state are all
 * server-rendered; the only JavaScript on the page is the quantity controls and
 * the remove buttons, which have to be interactive.
 *
 * ## Rendering
 *
 * Per request, and it must be. Its entire content is one shopper's — identified
 * by a session for some and by an opaque cookie for the rest — so a cached copy
 * served to anybody else would be a data leak rather than a stale page.
 *
 * ## Queries
 *
 * **None of its own.** The store layout above it already read the bag through
 * the request-scoped `getCartForRequest`, so this call returns that same result.
 * The whole page, header badge and drawer included, is one cart query.
 *
 * ## What it deliberately does not do
 *
 * No checkout. The button says so, and leads nowhere, because a checkout that
 * collects an address and then apologises is worse than a button that is honest
 * about the release it is waiting for. No tax line, no shipping line and no
 * discount line either: none of those exist, and a fabricated number next to a
 * real subtotal is how a total stops being believable.
 */
export const dynamic = "force-dynamic";

export default async function CartPage() {
  const cart = await getCartForRequest();

  if (cart.items.length === 0) {
    return (
      <Section>
        <Container>
          <Breadcrumbs
            items={[{ label: "Home", href: "/" }, { label: "Bag" }]}
          />

          <div className="mt-6 max-w-2xl">
            <Heading as="h1" level="xl">
              Your bag
            </Heading>
          </div>

          <div className="mt-12 rounded-card border border-dashed border-line-strong bg-surface px-6 py-16 sm:py-20">
            <EmptyState
              icon={<BagIcon />}
              title="Your bag is empty"
              description="Discover pieces you will want to wear on repeat. Whatever you add is kept for you, signed in or not."
              action={
                <ButtonLink href="/shop" variant="secondary">
                  Explore the collection
                </ButtonLink>
              }
            />
          </div>
        </Container>
      </Section>
    );
  }

  return (
    <Section>
      <Container>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Bag" }]} />

        <div className="mt-6 max-w-2xl">
          <Heading as="h1" level="xl">
            Your bag
          </Heading>
          <Text size="lg" className="mt-4">
            {cart.count} {cart.count === 1 ? "piece" : "pieces"}, ready when you
            are.
          </Text>
        </div>

        {cart.hasPriceChanges ? (
          <Notice>
            Prices have changed for some pieces since you added them. Your bag
            shows the current price.
          </Notice>
        ) : null}

        {cart.hasUnavailableItems ? (
          <Notice>
            Some pieces are no longer available. They are marked below and are
            not counted in the subtotal — remove them whenever you are ready.
          </Notice>
        ) : null}

        <div className="mt-10 lg:flex lg:items-start lg:gap-12">
          <div className="min-w-0 flex-1">
            <h2 className="sr-only">Items in your bag</h2>

            <ul>
              {cart.items.map((item) => (
                <CartLineItem key={item.id} item={item} layout="page" />
              ))}
            </ul>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
              <ButtonLink href="/shop" variant="link" size="sm" className="px-0">
                Continue shopping
              </ButtonLink>

              <ClearBagButton />
            </div>
          </div>

          <CartSummary
            subtotal={cart.subtotal}
            savings={cart.savings}
            count={cart.count}
          />
        </div>
      </Container>
    </Section>
  );
}

/** A quiet, explained change. Not an error, so it is not styled as one. */
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="mt-6 max-w-2xl rounded-control border border-line-strong bg-surface px-4 py-3 font-sans text-sm leading-relaxed text-ink-muted"
    >
      {children}
    </p>
  );
}

/**
 * What it comes to.
 *
 * Sticky on a wide screen so it stays beside the lines while they are adjusted,
 * and an ordinary block below the lines on a phone, where sticking it to the
 * viewport would eat the screen.
 *
 * The subtotal covers what can actually be bought. Withdrawn and sold-out lines
 * are visible above and excluded here, so the figure never promises something
 * that would change at checkout for reasons nobody explained.
 */
function CartSummary({
  subtotal,
  savings,
  count,
}: {
  subtotal: number;
  savings: number;
  count: number;
}) {
  return (
    <aside
      aria-labelledby="bag-summary"
      className="mt-12 lg:mt-0 lg:w-80 lg:shrink-0 lg:sticky lg:top-24"
    >
      <div className="rounded-card border border-line bg-surface p-6">
        <h2
          id="bag-summary"
          className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle"
        >
          Summary
        </h2>

        <dl className="mt-5 space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="font-sans text-sm text-ink-muted">
              Items ({count})
            </dt>
            <dd className="font-sans text-sm text-ink">
              {formatPrice(subtotal)}
            </dd>
          </div>

          {savings > 0 ? (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="font-sans text-sm text-ink-muted">
                You are saving
              </dt>
              <dd className="font-sans text-sm font-medium text-brand">
                {formatPrice(savings)}
              </dd>
            </div>
          ) : null}

          <div className="flex items-baseline justify-between gap-3 border-t border-line pt-3">
            <dt className="font-sans text-base font-medium text-ink">
              Subtotal
            </dt>
            <dd className="font-sans text-base font-medium text-ink">
              {formatPrice(subtotal)}
            </dd>
          </div>
        </dl>

        <p className="mt-3 font-sans text-xs leading-relaxed text-ink-subtle">
          Inclusive of all taxes. Delivery is worked out at checkout.
        </p>

        {/*
          Not a link, and not a button that does something. Checkout does not
          exist, and a flow that collects an address before apologising would be
          worse than saying so here. `aria-disabled` keeps it reachable by
          keyboard so the explanation is heard rather than skipped past — the
          same convention the placeholders in Phase 4 used.
        */}
        <button
          type="button"
          aria-disabled="true"
          aria-describedby="checkout-note"
          className="mt-6 flex h-12 w-full cursor-not-allowed items-center justify-center rounded-control bg-brand/60 font-sans text-base font-medium text-on-brand"
        >
          Proceed to checkout
        </button>

        <p
          id="checkout-note"
          className="mt-3 font-sans text-xs leading-relaxed text-ink-subtle"
        >
          Checkout and payment open in a later release. Your bag is kept until
          then, and nothing is reserved.
        </p>
      </div>
    </aside>
  );
}
