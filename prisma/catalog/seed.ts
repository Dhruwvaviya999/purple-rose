/**
 * Writing the catalogue.
 *
 * Every write below is keyed on a natural unique column — a category slug, a
 * size code, a colour slug, a product slug, a variant SKU — so running the
 * seed twice produces the same catalogue, not two of it. Nothing is keyed on a
 * generated id, and nothing is appended blindly.
 *
 * Three rules keep it repeatable and safe to run against a database somebody
 * has already been editing:
 *
 * - **Nothing is deleted that could be referenced later.** A variant that has
 *   disappeared from the seed is deactivated, not removed, because an order
 *   line will one day point at it. Category memberships and photographs are
 *   the exception: those are pure joins and pure content, owned by the seed.
 * - **Photographs are replaced only when they differ.** The set is
 *   fingerprinted and compared first, so a second run does not churn every
 *   image row for nothing.
 * - **Reads are batched by lookup table.** Categories, sizes and colours are
 *   read once into maps rather than once per variant.
 *
 * What it does *not* do is decide what the catalogue contains. That is
 * `./data.ts`.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";
import {
  categories,
  colors,
  photoUrl,
  portraitSize,
  products,
  sizes,
  type ProductSeed,
} from "./data";

/** A colour hex has to be a real CSS colour; the column only bounds its length. */
const HEX = /^#[0-9a-f]{6}$/;

/** Slugs travel in URLs, so they are checked here rather than at request time. */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type CatalogSeedSummary = {
  categories: number;
  sizes: number;
  colors: number;
  products: number;
  variants: number;
  images: number;
};

export async function seedCatalog(
  prisma: PrismaClient,
): Promise<CatalogSeedSummary> {
  validateCatalogSeed();

  await seedCategories(prisma);
  await seedSizes(prisma);
  await seedColors(prisma);

  const [categoryIds, sizeIds, colorIds] = await Promise.all([
    idsBy(prisma.category.findMany({ select: { id: true, slug: true } }), "slug"),
    idsBy(prisma.size.findMany({ select: { id: true, code: true } }), "code"),
    idsBy(prisma.color.findMany({ select: { id: true, slug: true } }), "slug"),
  ]);

  let variants = 0;
  let images = 0;

  for (const [index, product] of products.entries()) {
    const written = await seedProduct(prisma, product, index, {
      categoryIds,
      sizeIds,
      colorIds,
    });

    variants += written.variants;
    images += written.images;
  }

  return {
    categories: categories.length,
    sizes: sizes.length,
    colors: colors.length,
    products: products.length,
    variants,
    images,
  };
}

/**
 * Check the seed before any of it is written.
 *
 * A seed that fails halfway leaves a half catalogue, and the cheapest place to
 * catch a typo in a colour slug is before the first insert rather than on
 * product nineteen.
 *
 * Exported so `pnpm check:catalog` can run it without a database: everything
 * it checks is a property of the seed content itself.
 */
export function validateCatalogSeed(): void {
  const categorySlugs = new Set(categories.map((entry) => entry.slug));
  const colorSlugs = new Set(colors.map((entry) => entry.slug));
  const sizeCodes = new Set(sizes.map((entry) => entry.code));

  for (const color of colors) {
    if (!HEX.test(color.hex)) {
      throw new Error(`Colour ${color.slug} has an invalid hex value: ${color.hex}`);
    }
  }

  const seenSlugs = new Set<string>();
  const seenArticles = new Set<string>();

  for (const product of products) {
    if (!SLUG.test(product.slug)) {
      throw new Error(`Product slug is not URL-safe: ${product.slug}`);
    }
    if (seenSlugs.has(product.slug)) {
      throw new Error(`Duplicate product slug: ${product.slug}`);
    }
    if (seenArticles.has(product.articleNumber)) {
      throw new Error(`Duplicate article number: ${product.articleNumber}`);
    }
    seenSlugs.add(product.slug);
    seenArticles.add(product.articleNumber);

    if (product.compareAtPrice !== undefined && product.compareAtPrice <= product.price) {
      throw new Error(
        `${product.slug} has a compare-at price that is not a reduction. ` +
          `Leave it unset rather than storing a fake discount.`,
      );
    }

    for (const slug of [product.primaryCategory, ...(product.alsoIn ?? [])]) {
      if (!categorySlugs.has(slug)) {
        throw new Error(`${product.slug} refers to unknown category ${slug}`);
      }
    }

    if (product.colourways.length === 0) {
      throw new Error(`${product.slug} has no colourways, so nothing is sellable`);
    }

    for (const colourway of product.colourways) {
      if (!colorSlugs.has(colourway.colour)) {
        throw new Error(
          `${product.slug} refers to unknown colour ${colourway.colour}`,
        );
      }

      for (const [code, quantity] of Object.entries(colourway.stock)) {
        if (!sizeCodes.has(code)) {
          throw new Error(`${product.slug} refers to unknown size ${code}`);
        }
        if (!Number.isInteger(quantity) || quantity < 0) {
          throw new Error(
            `${product.slug} ${colourway.colour}/${code} has invalid stock: ${quantity}`,
          );
        }
      }
    }
  }
}

async function seedCategories(prisma: PrismaClient): Promise<void> {
  for (const category of categories) {
    const image = category.photo === undefined
      ? { imageUrl: null, imageAlt: null, imageWidth: null, imageHeight: null }
      : {
          imageUrl: photoUrl(category.photo),
          imageAlt: `${category.name}: ${category.description.toLowerCase()}`,
          imageWidth: portraitSize.width,
          imageHeight: portraitSize.height,
        };

    const fields = {
      name: category.name,
      description: category.description,
      seoTitle: category.seoTitle,
      seoDescription: category.seoDescription,
      position: category.position,
      isActive: category.isActive,
      ...image,
    };

    await prisma.category.upsert({
      where: { slug: category.slug },
      create: { slug: category.slug, ...fields },
      update: fields,
    });
  }
}

async function seedSizes(prisma: PrismaClient): Promise<void> {
  for (const size of sizes) {
    const fields = {
      name: size.name,
      position: size.position,
      isActive: true,
      bustCm: size.bustCm,
      waistCm: size.waistCm,
      hipCm: size.hipCm,
    };

    await prisma.size.upsert({
      where: { code: size.code },
      create: { code: size.code, ...fields },
      update: fields,
    });
  }
}

async function seedColors(prisma: PrismaClient): Promise<void> {
  for (const color of colors) {
    const fields = {
      name: color.name,
      hex: color.hex,
      position: color.position,
      isActive: true,
    };

    await prisma.color.upsert({
      where: { slug: color.slug },
      create: { slug: color.slug, ...fields },
      update: fields,
    });
  }
}

type Lookups = {
  categoryIds: Map<string, string>;
  sizeIds: Map<string, string>;
  colorIds: Map<string, string>;
};

async function seedProduct(
  prisma: PrismaClient,
  product: ProductSeed,
  index: number,
  lookups: Lookups,
): Promise<{ variants: number; images: number }> {
  const primaryCategoryId = mustGet(lookups.categoryIds, product.primaryCategory);

  const fields = {
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    careInstructions: product.careInstructions,
    status: product.status,
    publishedAt: daysAgo(product.publishedDaysAgo),
    price: product.price,
    compareAtPrice: product.compareAtPrice ?? null,
    fabric: product.fabric,
    pattern: product.pattern,
    fit: product.fit,
    occasion: product.occasion,
    featured: product.featured ?? false,
    newArrival: product.newArrival ?? false,
    bestSeller: product.bestSeller ?? false,
    seasonal: product.seasonal ?? false,
    seoTitle: product.name,
    seoDescription: product.shortDescription,
    primaryCategoryId,
  };

  const row = await prisma.product.upsert({
    where: { slug: product.slug },
    // `articleNumber` is set on create only. It is printed on a swing tag, so
    // it belongs to the physical garment and is not something a re-import
    // should quietly rewrite.
    create: { slug: product.slug, articleNumber: product.articleNumber, ...fields },
    update: fields,
    select: { id: true },
  });

  await seedMemberships(prisma, row.id, product, lookups);
  const variants = await seedVariants(prisma, row.id, product, lookups);
  const images = await seedImages(prisma, row.id, product, index, lookups);

  return { variants, images };
}

/**
 * Which collections the product is in.
 *
 * The primary category is always a membership too, so a product is always
 * findable under the collection its breadcrumb names. Memberships the seed no
 * longer lists are removed: a join row carries nothing an order could point
 * at, so there is nothing to preserve.
 */
async function seedMemberships(
  prisma: PrismaClient,
  productId: string,
  product: ProductSeed,
  lookups: Lookups,
): Promise<void> {
  const slugs = [product.primaryCategory, ...(product.alsoIn ?? [])];
  const wanted = [...new Set(slugs)].map((slug) =>
    mustGet(lookups.categoryIds, slug),
  );

  await prisma.productCategory.deleteMany({
    where: { productId, categoryId: { notIn: wanted } },
  });

  for (const [position, categoryId] of wanted.entries()) {
    await prisma.productCategory.upsert({
      where: { productId_categoryId: { productId, categoryId } },
      create: { productId, categoryId, position },
      update: { position },
    });
  }
}

/**
 * The sellable combinations, and the stock behind each one.
 *
 * SKUs are derived from the article number, the colour and the size, so they
 * are stable across runs and are the natural key this upserts on:
 * `PR-DR-0001-LAV-M`.
 *
 * A combination that has left the seed is deactivated rather than deleted.
 * Deleting it would be the one destructive act in this file, and it is exactly
 * the row a future order line will reference.
 */
async function seedVariants(
  prisma: PrismaClient,
  productId: string,
  product: ProductSeed,
  lookups: Lookups,
): Promise<number> {
  const skus: string[] = [];
  let position = 0;

  for (const colourway of product.colourways) {
    const colorId = mustGet(lookups.colorIds, colourway.colour);

    // Written in the size order the size table defines, not the order the
    // object literal happens to list, so `position` is meaningful.
    const codes = sizes
      .map((size) => size.code)
      .filter((code) => code in colourway.stock);

    for (const code of codes) {
      const sizeId = mustGet(lookups.sizeIds, code);
      const sku = skuFor(product.articleNumber, colourway.colour, code);
      const quantity = colourway.stock[code] ?? 0;

      skus.push(sku);

      const variant = await prisma.productVariant.upsert({
        where: { sku },
        create: {
          sku,
          productId,
          colorId,
          sizeId,
          isActive: true,
          position: position++,
        },
        update: { productId, colorId, sizeId, isActive: true, position: position++ },
        select: { id: true },
      });

      await prisma.inventory.upsert({
        where: { variantId: variant.id },
        create: { variantId: variant.id, quantity, lowStockThreshold: 3 },
        update: { quantity },
      });
    }
  }

  await prisma.productVariant.updateMany({
    where: { productId, sku: { notIn: skus }, isActive: true },
    data: { isActive: false },
  });

  return skus.length;
}

/** `PR-DR-0001-LAV-M`: article, first three letters of the colour, size code. */
function skuFor(articleNumber: string, colourSlug: string, sizeCode: string): string {
  const colour = colourSlug.replaceAll("-", "").slice(0, 3).toUpperCase();
  return `${articleNumber}-${colour}-${sizeCode}`;
}

/**
 * The photographs, two per colour plus one shared by all of them.
 *
 * Compared before they are written. Images have no natural unique key — a
 * product can genuinely have two shots of the same colour at the same angle —
 * so the alternative to a fingerprint is deleting and recreating every image
 * row on every run, which churns the table to reach the state it was already
 * in.
 */
async function seedImages(
  prisma: PrismaClient,
  productId: string,
  product: ProductSeed,
  index: number,
  lookups: Lookups,
): Promise<number> {
  const wanted: {
    colorId: string | null;
    url: string;
    alt: string;
    width: number;
    height: number;
    position: number;
    isPrimary: boolean;
  }[] = [];

  let position = 0;

  for (const [colourIndex, colourway] of product.colourways.entries()) {
    const colorId = mustGet(lookups.colorIds, colourway.colour);
    const colourName =
      colors.find((entry) => entry.slug === colourway.colour)?.name ??
      colourway.colour;

    for (const [shot, view] of ["front", "back"].entries()) {
      wanted.push({
        colorId,
        url: photoUrl(index * 3 + colourIndex * 2 + shot),
        alt: `${product.name} in ${colourName.toLowerCase()}, ${view} view`,
        width: portraitSize.width,
        height: portraitSize.height,
        position,
        // The first shot of the first colour is the card image.
        isPrimary: position === 0,
      });
      position += 1;
    }
  }

  // One image with no colour, shared by every colourway: the fabric close-up
  // that is the same cloth whichever colour it was dyed.
  wanted.push({
    colorId: null,
    url: photoUrl(index * 3 + 7),
    alt: `${product.name}, fabric detail`,
    width: portraitSize.width,
    height: portraitSize.height,
    position,
    isPrimary: false,
  });

  const existing = await prisma.productImage.findMany({
    where: { productId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: {
      colorId: true,
      url: true,
      alt: true,
      width: true,
      height: true,
      position: true,
      isPrimary: true,
    },
  });

  if (fingerprint(existing) === fingerprint(wanted)) {
    return wanted.length;
  }

  await prisma.productImage.deleteMany({ where: { productId } });
  await prisma.productImage.createMany({
    data: wanted.map((image) => ({ ...image, productId })),
  });

  return wanted.length;
}

function fingerprint(
  images: readonly {
    colorId: string | null;
    url: string;
    alt: string;
    width: number;
    height: number;
    position: number;
    isPrimary: boolean;
  }[],
): string {
  return images
    .map(
      (image) =>
        `${image.position}|${image.colorId ?? ""}|${image.url}|${image.alt}|${image.width}x${image.height}|${image.isPrimary}`,
    )
    .join("\n");
}

/* ------------------------------------------------------------------ */

async function idsBy<TKey extends string, TRow extends Record<string, string>>(
  query: Promise<TRow[]>,
  key: TKey,
): Promise<Map<string, string>> {
  const rows = await query;
  return new Map(rows.map((row) => [row[key] as string, row.id]));
}

/** A lookup that cannot silently produce `undefined` and write a broken row. */
function mustGet(map: Map<string, string>, key: string): string {
  const value = map.get(key);

  if (!value) {
    throw new Error(
      `Expected ${key} to exist in the database by now. ` +
        `Lookup tables are seeded before products; this means one failed.`,
    );
  }

  return value;
}

/**
 * A publication date, counted back from a fixed anchor.
 *
 * Real, spread-out dates rather than one timestamp for the whole import, so
 * "newest" has something meaningful to order by and the sitemap reports
 * something other than the moment the seed ran.
 *
 * The anchor is a constant rather than `Date.now()` so the dates are the same
 * on every run. A seed that wrote a different timestamp each time would be
 * repeatable in row count but not in content, and the listing would quietly
 * reshuffle every time somebody re-seeded.
 */
const PUBLICATION_ANCHOR = Date.parse("2026-09-01T09:00:00.000Z");

function daysAgo(days: number | null): Date | null {
  if (days === null) {
    return null;
  }

  return new Date(PUBLICATION_ANCHOR - days * 24 * 60 * 60 * 1000);
}
