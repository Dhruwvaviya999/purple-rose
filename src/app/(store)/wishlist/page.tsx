import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/commerce/breadcrumbs";
import { EmptyState } from "@/components/shared/empty-state";
import { HeartIcon } from "@/components/shared/icons";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Heading, Text } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "Wishlist",
  description: "Pieces you have saved to come back to.",
  robots: { index: false, follow: true },
};

/**
 * Wishlist shell.
 *
 * The page and its empty state exist; the saving does not. There is no
 * wishlist table and no action to write one, so rather than show a list that
 * would always be empty and never fill, this says what the state of it is.
 *
 * When persistence arrives, the empty state stays for shoppers who have saved
 * nothing and a `ProductGrid` renders above it for everyone else. This file is
 * where that branch goes.
 */
export default function WishlistPage() {
  return (
    <Section>
      <Container>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Wishlist" }]} />

        <div className="mt-6 max-w-2xl">
          <Heading as="h1" level="xl">
            Wishlist
          </Heading>
          <Text size="lg" className="mt-4">
            Somewhere to keep the pieces you are thinking about.
          </Text>
        </div>

        <div className="mt-12 rounded-card border border-dashed border-line-strong bg-surface px-6 py-16 sm:py-20">
          <EmptyState
            icon={<HeartIcon />}
            title="Nothing saved yet"
            description="Saving pieces needs somewhere to keep them, which arrives with customer accounts. The heart on a product card is switched off until then."
            action={
              <ButtonLink href="/shop" variant="secondary">
                Browse the shop
              </ButtonLink>
            }
          />
        </div>
      </Container>
    </Section>
  );
}
