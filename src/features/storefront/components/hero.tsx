import Image from "next/image";

import { brandMedia } from "@/config/media";
import { ArrowRightIcon } from "@/components/shared/icons";
import { ButtonLink } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { Eyebrow, Heading, Text } from "@/components/ui/typography";

/**
 * The opening statement.
 *
 * Text beside the image rather than over it. An overlay reads differently on
 * every photograph and every screen width, and holding contrast means either
 * darkening the image or adding a scrim, both of which fight the photography.
 * Side by side, the type stays legible and the image stays untouched.
 *
 * On a phone the image comes first and the words follow, which is the order a
 * fashion shopper reads in.
 *
 * A server component. The image carries `priority` because it is the largest
 * thing above the fold, and a fixed aspect box so nothing moves as it loads.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-heading" className="border-b border-line">
      <Container className="py-10 sm:py-14 lg:py-20">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="order-2 lg:order-1">
            <Eyebrow>Everyday, considered</Eyebrow>

            <Heading as="h1" id="hero-heading" level="display" className="mt-5">
              Fresh prints.
              <br />
              <span className="text-brand">Easy</span> cotton.
              <br />
              Worn on repeat.
            </Heading>

            <Text size="lg" className="mt-6 max-w-lg">
              Small collections of dresses, co-ords and tops in fabrics that
              survive an Indian summer and a washing machine. Made to be worn
              often, not saved for later.
            </Text>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <ButtonLink href="/shop" size="lg">
                Shop the collection
                <ArrowRightIcon className="size-4" />
              </ButtonLink>
              <ButtonLink
                href="/shop?sort=newest"
                variant="secondary"
                size="lg"
              >
                New in
              </ButtonLink>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-card bg-surface sm:aspect-[3/2] lg:aspect-[4/5]">
              <Image
                src={brandMedia.hero.src}
                alt={brandMedia.hero.alt}
                fill
                priority
                sizes="(min-width: 1024px) 45vw, 100vw"
                className="object-cover"
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
