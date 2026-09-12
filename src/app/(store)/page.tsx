import { siteConfig } from "@/config/site";
import { ArrowRightIcon } from "@/components/shared/icons";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";

/**
 * Brand shell for the home route.
 *
 * This establishes identity, hierarchy and responsive behaviour only. The
 * merchandised homepage — collections, editorial rails, product carousels —
 * arrives once the catalogue exists.
 */

const brandPromises = [
  {
    title: "Considered fabrics",
    body: "Breathable cottons and soft blends chosen for how they wear on the tenth day, not the first.",
  },
  {
    title: "Fits that move",
    body: "Relaxed silhouettes cut on real proportions, graded carefully across the full size range.",
  },
  {
    title: "Quietly seasonal",
    body: "Small, intentional drops instead of endless newness, so your wardrobe stays wearable.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <Section spacing="lg" className="border-b border-line">
        <Container>
          <div className="max-w-3xl">
            <Eyebrow>{siteConfig.tagline}</Eyebrow>

            <Heading as="h1" level="display" className="mt-5">
              Clothes for the life you
              <span className="text-brand"> actually</span> live
            </Heading>

            <Text size="lg" className="mt-6 max-w-xl">
              {siteConfig.description}
            </Text>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <ButtonLink href="/shop" size="lg">
                Enter the shop
                <ArrowRightIcon className="size-4" />
              </ButtonLink>
              <ButtonLink href="/login" variant="secondary" size="lg">
                Sign in
              </ButtonLink>
            </div>
          </div>
        </Container>
      </Section>

      <Section surface="surface">
        <Container>
          <div className="max-w-2xl">
            <Heading as="h2" level="lg">
              What we are building
            </Heading>
            <Text className="mt-4">
              Purple Rose is being built in the open, one layer at a time. This
              is the storefront foundation: the brand, the navigation and the
              design language that every page will inherit.
            </Text>
          </div>

          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {brandPromises.map((promise) => (
              <li key={promise.title}>
                <Card variant="outline" padding="lg" className="h-full">
                  <CardHeader>
                    <Heading as="h3" level="sm">
                      {promise.title}
                    </Heading>
                    <Text size="sm">{promise.body}</Text>
                  </CardHeader>
                </Card>
              </li>
            ))}
          </ul>
        </Container>
      </Section>
    </>
  );
}
