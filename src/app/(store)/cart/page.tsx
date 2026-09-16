import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/commerce/breadcrumbs";
import { EmptyState } from "@/components/shared/empty-state";
import { BagIcon } from "@/components/shared/icons";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Heading, Text } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "Bag",
  description: "The pieces you are ready to order.",
  robots: { index: false, follow: true },
};

/**
 * Bag shell.
 *
 * The full-page counterpart to the header drawer, for reviewing an order
 * before checkout. No cart storage exists, so there is nothing to list and no
 * total to add up; inventing either would be the kind of fake behaviour that
 * makes a demo untrustworthy.
 *
 * When carts exist, the line items and the summary render here and the empty
 * state stays for an empty bag.
 *
 * Rendered per request. A bag belongs to one person and is different for
 * every one of them, so there has never been anything here to prerender; the
 * declaration is made now because the storefront shell around it reads the
 * live category list.
 */
export const dynamic = "force-dynamic";

export default function CartPage() {
  return (
    <Section>
      <Container>
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Bag" }]} />

        <div className="mt-6 max-w-2xl">
          <Heading as="h1" level="xl">
            Your bag
          </Heading>
          <Text size="lg" className="mt-4">
            Everything you are ready to order, in one place.
          </Text>
        </div>

        <div className="mt-12 rounded-card border border-dashed border-line-strong bg-surface px-6 py-16 sm:py-20">
          <EmptyState
            icon={<BagIcon />}
            title="Your bag is empty"
            description="Adding pieces to a bag opens together with checkout, so there is nothing here to total up yet."
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
