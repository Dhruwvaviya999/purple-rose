import "server-only";

import type {
  ProductBadgeKind,
  ProductCardData,
  ProductColour,
  ProductColourOption,
  ProductDetailData,
  ProductSize,
  ProductVariantOption,
  StorefrontImage,
} from "@/types/commerce";
import type { Prisma } from "@/generated/prisma/client";
import {
  fabricVocabulary,
  fitVocabulary,
  occasionVocabulary,
  patternVocabulary,
} from "./vocabulary";

/**
 * Where the database vocabulary and the interface vocabulary meet.
 *
 * Everything below turns Prisma rows into the presentation types in
 * `@/types/commerce`. It is the only place the two shapes are both in scope:
 * no component receives a Prisma model, no service builds a `ProductCardData`
 * by hand, and a column rename stops here rather than travelling into the
 * interface.
 *
 * The selects are exported alongside the mappers so the two cannot drift. A
 * select that stops returning a column makes the mapper stop compiling.
 */

/** Columns every card needs, and no more. */
export const productCardSelect = {
  id: true,
  slug: true,
  name: true,
  price: true,
  compareAtPrice: true,
  featured: true,
  newArrival: true,
  bestSeller: true,
  primaryCategory: { select: { slug: true, name: true } },
  images: {
    // Primary first, then the running order. `take: 2` is the card image and
    // the shot that fades in on hover; a card never needs the rest.
    orderBy: [{ isPrimary: "desc" }, { position: "asc" }],
    take: 2,
    select: { url: true, alt: true, width: true, height: true },
  },
  variants: {
    where: { isActive: true },
    orderBy: [{ color: { position: "asc" } }, { size: { position: "asc" } }],
    select: {
      // The id is here for one reason: a card with exactly one purchasable
      // variant can add straight to the bag, and it needs to name it. It costs
      // nothing — the rows were already being read for the colour swatches.
      id: true,
      color: { select: { slug: true, name: true, hex: true } },
      inventory: { select: { quantity: true } },
    },
  },
} as const satisfies Prisma.ProductSelect;

/** Everything a product page renders. */
export const productDetailSelect = {
  id: true,
  slug: true,
  name: true,
  articleNumber: true,
  shortDescription: true,
  description: true,
  price: true,
  compareAtPrice: true,
  featured: true,
  newArrival: true,
  bestSeller: true,
  fabric: true,
  pattern: true,
  fit: true,
  occasion: true,
  careInstructions: true,
  seoTitle: true,
  seoDescription: true,
  publishedAt: true,
  updatedAt: true,
  primaryCategory: { select: { slug: true, name: true } },
  categories: {
    orderBy: { position: "asc" },
    select: { category: { select: { id: true, slug: true, name: true } } },
  },
  images: {
    orderBy: [{ isPrimary: "desc" }, { position: "asc" }],
    select: {
      url: true,
      alt: true,
      width: true,
      height: true,
      colorId: true,
    },
  },
  variants: {
    where: { isActive: true },
    orderBy: [{ color: { position: "asc" } }, { size: { position: "asc" } }],
    select: {
      id: true,
      sku: true,
      colorId: true,
      color: { select: { slug: true, name: true, hex: true } },
      size: { select: { code: true } },
      inventory: { select: { quantity: true } },
    },
  },
} as const satisfies Prisma.ProductSelect;

export type ProductCardRow = Prisma.ProductGetPayload<{
  select: typeof productCardSelect;
}>;

export type ProductDetailRow = Prisma.ProductGetPayload<{
  select: typeof productDetailSelect;
}>;

/**
 * What a card shows when a product has no photograph at all.
 *
 * This should never render: a product without a picture is a data error, and
 * the admin panel will refuse to publish one. It exists so that one bad row
 * cannot take down a listing, and so the listing count keeps matching the
 * number of cards. Deliberately a plain grey box rather than something
 * plausible, so it is noticed.
 */
const MISSING_IMAGE_SRC =
  "data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%27http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%27%20width%3D%27800%27%20height%3D%271000%27%3E%3Crect%20width%3D%27800%27%20height%3D%271000%27%20fill%3D%27%23e7e3dd%27%2F%3E%3C%2Fsvg%3E";

type ImageRow = { url: string; alt: string; width: number; height: number };

function toImage(row: ImageRow): StorefrontImage {
  return { src: row.url, alt: row.alt, width: row.width, height: row.height };
}

function missingImage(productName: string): StorefrontImage {
  return {
    src: MISSING_IMAGE_SRC,
    alt: `No photograph of ${productName} has been uploaded yet`,
    width: 800,
    height: 1000,
  };
}

/**
 * On sale when there is a previous price and it was higher.
 *
 * The same rule the database query uses, so a product can never be listed by
 * the sale filter and then render without a sale badge. No percentage is
 * stored anywhere: the saving is derived from the two amounts, once, in
 * `format-price.ts`.
 */
export function isOnSale(
  price: number,
  compareAtPrice: number | null | undefined,
): boolean {
  return compareAtPrice != null && compareAtPrice > price;
}

function badgesFor(row: {
  price: number;
  compareAtPrice: number | null;
  newArrival: boolean;
  bestSeller: boolean;
  featured: boolean;
}): ProductBadgeKind[] {
  const badges: ProductBadgeKind[] = [];

  if (isOnSale(row.price, row.compareAtPrice)) {
    badges.push("sale");
  }
  if (row.newArrival) {
    badges.push("new");
  }
  if (row.bestSeller) {
    badges.push("bestseller");
  }
  if (row.featured) {
    badges.push("featured");
  }

  // "sold-out" is not stored: `pickPrimaryBadge` adds it from availability, so
  // there is one place that decides what a sold-out card says.
  return badges;
}

type ColourVariantRow = {
  id: string;
  color: { slug: string; name: string; hex: string };
  inventory: { quantity: number } | null;
};

/**
 * The one variant a card may add directly, or undefined.
 *
 * "Exactly one purchasable combination" means precisely that: one active
 * variant row, with stock. A piece cut in two sizes has no single answer even
 * if only one of them is in stock today, because tomorrow the other is back and
 * the card would silently start meaning something else. So the test is on the
 * shape of the product, not on today's inventory alone.
 */
function soleVariantFrom(
  variants: readonly ColourVariantRow[],
): string | undefined {
  if (variants.length !== 1) {
    return undefined;
  }

  const only = variants[0]!;

  return (only.inventory?.quantity ?? 0) > 0 ? only.id : undefined;
}

/**
 * The distinct colours a product comes in, in the order the variants arrived.
 *
 * A colour is available when at least one variant in it has stock, so a
 * swatch is struck through only when every size in that colour is gone.
 */
function coloursFrom(variants: readonly ColourVariantRow[]): ProductColour[] {
  const colours = new Map<string, ProductColour>();

  for (const variant of variants) {
    const existing = colours.get(variant.color.slug);
    const available = (variant.inventory?.quantity ?? 0) > 0;

    if (existing) {
      // One available variant is enough to make the whole colour available.
      if (available) {
        existing.available = true;
      }
      continue;
    }

    colours.set(variant.color.slug, {
      name: variant.color.name,
      slug: variant.color.slug,
      hex: variant.color.hex,
      available,
    });
  }

  return [...colours.values()];
}

export function toProductCardData(row: ProductCardRow): ProductCardData {
  const [primary, second] = row.images;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    category: row.primaryCategory,
    price: row.price,
    compareAtPrice: row.compareAtPrice ?? undefined,
    image: primary ? toImage(primary) : missingImage(row.name),
    hoverImage: second ? toImage(second) : undefined,
    badges: badgesFor(row),
    inStock: row.variants.some(
      (variant) => (variant.inventory?.quantity ?? 0) > 0,
    ),
    colours: coloursFrom(row.variants),
    soleVariantId: soleVariantFrom(row.variants),
  };
}

/**
 * The factual lines under the description.
 *
 * Built from the structured columns rather than from a free-text field, so
 * they cannot say "Linen" on a product whose `fabric` column reads `RAYON`,
 * and so the same words describe the same attribute on every product. Each
 * line names its attribute, because "Relaxed" on its own does not say whether
 * it is the fit or the occasion.
 */
function detailLines(row: ProductDetailRow): string[] {
  return [
    `Fabric — ${fabricVocabulary.labels[row.fabric]}`,
    `Fit — ${fitVocabulary.labels[row.fit]}`,
    `Pattern — ${patternVocabulary.labels[row.pattern]}`,
    `Occasion — ${occasionVocabulary.labels[row.occasion]}`,
    `Care — ${row.careInstructions}`,
    `Article — ${row.articleNumber}`,
  ];
}

export function toProductDetailData(row: ProductDetailRow): ProductDetailData {
  const colours = coloursFrom(row.variants);

  // The full size run, in the order the variants came back, which the query
  // sorted by `Size.position`. Built once and reused for every colour, so a
  // size the product is made in is always shown, struck through where that
  // colour does not have it.
  const sizeRun: string[] = [];
  for (const variant of row.variants) {
    if (!sizeRun.includes(variant.size.code)) {
      sizeRun.push(variant.size.code);
    }
  }

  /** Stock for one colour in one size, or 0 when the combination does not exist. */
  const stock = new Map<string, number>();
  for (const variant of row.variants) {
    stock.set(
      `${variant.color.slug}/${variant.size.code}`,
      variant.inventory?.quantity ?? 0,
    );
  }

  const sizesFor = (colourSlug: string | null): ProductSize[] =>
    sizeRun.map((code) => ({
      label: code,
      value: code,
      available:
        colourSlug === null
          ? colours.some((colour) => (stock.get(`${colour.slug}/${code}`) ?? 0) > 0)
          : (stock.get(`${colourSlug}/${code}`) ?? 0) > 0,
    }));

  // Images with no colour belong to every colour: flat lays, fabric shots,
  // detail crops. They follow the colour's own photographs rather than
  // leading, so selecting Blue shows the blue dress first.
  const sharedImages = row.images.filter((image) => image.colorId === null);

  const colourIdBySlug = new Map<string, string>();
  for (const variant of row.variants) {
    colourIdBySlug.set(variant.color.slug, variant.colorId);
  }

  const colourOptions: ProductColourOption[] = colours.map((colour) => {
    const colourId = colourIdBySlug.get(colour.slug);
    const own = row.images.filter((image) => image.colorId === colourId);

    return {
      ...colour,
      images: [...own, ...sharedImages].map(toImage),
      sizes: sizesFor(colour.slug),
    };
  });

  // Colour and size, as a shopper picks them, paired with the variant they
  // actually name. The bag holds variants; the controls speak in labels.
  const variants: ProductVariantOption[] = row.variants.map((variant) => ({
    id: variant.id,
    sku: variant.sku,
    colourSlug: variant.color.slug,
    sizeValue: variant.size.code,
    available: (variant.inventory?.quantity ?? 0) > 0,
  }));

  const card = toProductCardData({
    id: row.id,
    slug: row.slug,
    name: row.name,
    price: row.price,
    compareAtPrice: row.compareAtPrice,
    featured: row.featured,
    newArrival: row.newArrival,
    bestSeller: row.bestSeller,
    primaryCategory: row.primaryCategory,
    images: row.images.slice(0, 2),
    variants: row.variants,
  });

  return {
    ...card,
    images:
      row.images.length > 0
        ? row.images.map(toImage)
        : [missingImage(row.name)],
    description: row.description,
    details: detailLines(row),
    sizes: sizesFor(null),
    colourOptions,
    variants,
    articleNumber: row.articleNumber,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
  };
}
