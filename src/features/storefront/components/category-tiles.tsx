import Image from "next/image";
import Link from "next/link";

import type { StorefrontCategory } from "@/types/commerce";
import { Container } from "@/components/ui/container";
import { Section } from "@/components/ui/section";
import { Heading } from "@/components/ui/typography";

/**
 * The four ways in.
 *
 * Two columns on a phone and four from the tablet breakpoint, matching the
 * product grid so the page has one rhythm rather than a different column count
 * per section.
 *
 * The whole tile is the link, so the tap target is the image and not the line
 * of text beneath it. The caption sits below the photograph rather than on it,
 * for the same contrast reasons as the hero.
 *
 * Categories are passed in, so this component works unchanged when they come
 * from the database.
 */
export function CategoryTiles({
  categories,
}: {
  categories: readonly StorefrontCategory[];
}) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <Section spacing="md" surface="canvas">
      <Container>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <Heading as="h2" level="lg" id="shop-by-category">
            Shop by category
          </Heading>
        </div>

        <ul
          aria-labelledby="shop-by-category"
          className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-5 md:grid-cols-4 lg:gap-x-6"
        >
          {categories.map((category) => (
            <li key={category.slug} className="group">
              <Link
                href={{ pathname: "/shop", query: { category: category.slug } }}
                className="block"
              >
                <div className="relative aspect-[4/5] w-full overflow-hidden rounded-card bg-surface">
                  <Image
                    src={category.image.src}
                    alt={category.image.alt}
                    fill
                    sizes="(min-width: 768px) 23vw, 45vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.03]"
                  />
                </div>

                <h3 className="mt-3.5 font-sans text-sm font-medium text-ink">
                  {category.name}
                </h3>
                <p className="mt-1 font-sans text-xs leading-relaxed text-ink-subtle">
                  {category.tagline}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </Section>
  );
}
