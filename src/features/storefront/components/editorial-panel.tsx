import Image from "next/image";

import { brandMedia } from "@/config/media";
import type { StorefrontImage } from "@/types/commerce";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";
import { cn } from "@/lib/utils/cn";

/**
 * A wide image with a short piece of writing beside it.
 *
 * Used twice on the home page, once for the brand story and once for the
 * season, with the image on opposite sides so the page does not read as two
 * copies of the same block. One component with a `reverse` flag rather than
 * two near-identical sections.
 *
 * A server component. Images here are below the fold, so they stay lazy.
 */
type EditorialPanelProps = {
  eyebrow: string;
  title: string;
  body: string;
  image: StorefrontImage;
  cta?: { label: string; href: "/shop" | "/shop?sort=newest" | "/shop?sale=true" };
  /** Puts the image on the left instead of the right. */
  reverse?: boolean;
  surface?: "canvas" | "surface" | "brand";
};

export function EditorialPanel({
  eyebrow,
  title,
  body,
  image,
  cta,
  reverse = false,
  surface = "surface",
}: EditorialPanelProps) {
  return (
    <Section surface={surface}>
      <Container>
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div
            className={cn(
              "relative aspect-[3/2] w-full overflow-hidden rounded-card bg-surface-strong",
              reverse ? "lg:order-1" : "lg:order-2",
            )}
          >
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(min-width: 1024px) 45vw, 100vw"
              className="object-cover"
            />
          </div>

          <div className={cn(reverse ? "lg:order-2" : "lg:order-1")}>
            <Eyebrow>{eyebrow}</Eyebrow>
            <Heading as="h2" level="lg" className="mt-4">
              {title}
            </Heading>
            <Text className="mt-5 max-w-lg">{body}</Text>

            {cta ? (
              <ButtonLink href={cta.href} variant="secondary" className="mt-7">
                {cta.label}
              </ButtonLink>
            ) : null}
          </div>
        </div>
      </Container>
    </Section>
  );
}

/** The brand story panel, with its copy in one place. */
export function BrandStoryPanel() {
  return (
    <EditorialPanel
      eyebrow="How we make things"
      title="Fewer pieces, chosen properly"
      body="We put out small collections a few times a year instead of something new every week. Every fabric is worn and washed before it goes into production, and anything that pills, creases badly or loses its shape does not make it. It means less to choose from, and less that disappoints."
      image={brandMedia.editorial}
      surface="surface"
    />
  );
}

/** The seasonal panel. Copy changes here when the season does. */
export function SeasonalPanel() {
  return (
    <EditorialPanel
      eyebrow="This season"
      title="Built for heat, and for the rain after it"
      body="Cottons and light blends that breathe through a long afternoon, in prints that hide a crease. Cut loose through the body, with pockets where you would actually put your hands."
      image={brandMedia.seasonal}
      cta={{ label: "See what is new", href: "/shop?sort=newest" }}
      reverse
      surface="canvas"
    />
  );
}
