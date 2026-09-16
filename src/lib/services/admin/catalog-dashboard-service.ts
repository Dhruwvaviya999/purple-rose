import "server-only";

import { ProductStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/client";

/**
 * What the admin overview counts.
 *
 * **Every number here is a fact about the catalogue**, counted by PostgreSQL
 * at the moment the page renders. There is no revenue, no conversion, no
 * units sold and no trend line, because there is no order system: nothing in
 * this application knows what has been bought. A dashboard that showed a
 * plausible revenue figure would be the single most misleading thing in the
 * repository.
 *
 * What is here is what somebody running the shop actually needs to see on
 * opening it: how much of the catalogue is live, what is still a draft, and
 * what is about to run out.
 */

export type CatalogMetrics = {
  products: { total: number; active: number; draft: number; archived: number };
  categories: { total: number; active: number };
  variants: { total: number; active: number; outOfStock: number; lowStock: number };
  images: number;
  /** The shared attribute tables, which Phase 7 made manageable. */
  colors: { total: number; active: number };
  sizes: { total: number; active: number };
};

export type LowStockVariant = {
  id: string;
  sku: string;
  quantity: number;
  lowStockThreshold: number;
  productId: string;
  productName: string;
  colour: string;
  size: string;
};

export type RecentProduct = {
  id: string;
  name: string;
  status: ProductStatus;
  updatedAt: Date;
};

/**
 * Every count in one round trip.
 *
 * Fifteen aggregations, issued together rather than in sequence, none of which
 * reads a row into JavaScript to count it. The alternative — loading products
 * and counting them here — would read the whole catalogue to produce four
 * integers.
 */
export async function getCatalogMetrics(): Promise<CatalogMetrics> {
  const liveVariant = { isActive: true } as const;

  const [
    products,
    active,
    draft,
    archived,
    categories,
    activeCategories,
    variants,
    activeVariants,
    outOfStock,
    lowStock,
    images,
    colors,
    activeColors,
    sizes,
    activeSizes,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { status: ProductStatus.ACTIVE } }),
    prisma.product.count({ where: { status: ProductStatus.DRAFT } }),
    prisma.product.count({ where: { status: ProductStatus.ARCHIVED } }),
    prisma.category.count(),
    prisma.category.count({ where: { isActive: true } }),
    prisma.productVariant.count(),
    prisma.productVariant.count({ where: liveVariant }),
    prisma.productVariant.count({
      where: { ...liveVariant, inventory: { is: { quantity: { lte: 0 } } } },
    }),
    // At or below its own threshold but not yet gone. A comparison between two
    // columns of one row, done in SQL by a field reference.
    prisma.productVariant.count({
      where: {
        ...liveVariant,
        inventory: {
          is: { quantity: { gt: 0, lte: prisma.inventory.fields.lowStockThreshold } },
        },
      },
    }),
    prisma.productImage.count(),
    prisma.color.count(),
    prisma.color.count({ where: { isActive: true } }),
    prisma.size.count(),
    prisma.size.count({ where: { isActive: true } }),
  ]);

  return {
    products: { total: products, active, draft, archived },
    categories: { total: categories, active: activeCategories },
    variants: { total: variants, active: activeVariants, outOfStock, lowStock },
    images,
    colors: { total: colors, active: activeColors },
    sizes: { total: sizes, active: activeSizes },
  };
}

/**
 * The variants worth looking at, lowest stock first.
 *
 * Visibility only. There is no restock action, no purchase order and no stock
 * movement: this phase manages a quantity, and the workflows that change it
 * for a reason belong to the inventory phase.
 */
export async function listLowStockVariants(limit = 8): Promise<LowStockVariant[]> {
  const rows = await prisma.productVariant.findMany({
    where: {
      isActive: true,
      product: { status: { not: ProductStatus.ARCHIVED } },
      inventory: {
        is: { quantity: { lte: prisma.inventory.fields.lowStockThreshold } },
      },
    },
    orderBy: [{ inventory: { quantity: "asc" } }, { sku: "asc" }],
    take: limit,
    select: {
      id: true,
      sku: true,
      productId: true,
      product: { select: { name: true } },
      color: { select: { name: true } },
      size: { select: { code: true } },
      inventory: { select: { quantity: true, lowStockThreshold: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    sku: row.sku,
    quantity: row.inventory?.quantity ?? 0,
    lowStockThreshold: row.inventory?.lowStockThreshold ?? 0,
    productId: row.productId,
    productName: row.product.name,
    colour: row.color.name,
    size: row.size.code,
  }));
}

/** What has been worked on lately, so an admin can pick up where they left off. */
export async function listRecentlyUpdatedProducts(
  limit = 6,
): Promise<RecentProduct[]> {
  return prisma.product.findMany({
    orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    take: limit,
    select: { id: true, name: true, status: true, updatedAt: true },
  });
}
