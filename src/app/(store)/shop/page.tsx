import type { Metadata } from "next";

import { CompassIcon } from "@/components/shared/icons";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Heading, Text } from "@/components/ui/typography";

export const metadata: Metadata = {
  title: "Shop",
  description:
    "The Purple Rose catalogue. Product listings open once the collection is published.",
};

/**
 * Catalogue route.
 *
 * Categories and products will be read from the database, so nothing is
 * listed here yet. The page shows an honest empty state rather than sample
 * merchandise.
 */
export default function ShopPage() {
  return (
    <Section>
      <Container>
        <div className="max-w-2xl">
          <Badge variant="outline">Catalogue in preparation</Badge>
          <Heading as="h1" level="xl" className="mt-5">
            The shop
          </Heading>
          <Text size="lg" className="mt-5">
            Every piece, filterable by category, size and fabric. Listings are
            generated from the catalogue, which is not connected yet.
          </Text>
        </div>

        <div className="mt-14 rounded-card border border-dashed border-line-strong bg-surface px-6 py-16 sm:py-20">
          <EmptyState
            icon={<CompassIcon />}
            title="Nothing to browse just yet"
            description="Categories and products load from the store database. Once it is connected, this page becomes the full catalogue with filtering and sorting."
            action={
              <ButtonLink href="/" variant="secondary">
                Back to home
              </ButtonLink>
            }
          />
        </div>
      </Container>
    </Section>
  );
}
