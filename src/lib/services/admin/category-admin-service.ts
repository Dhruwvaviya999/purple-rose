import "server-only";

import type {
  CreateCategoryInput,
  UpdateCategoryInput,
} from "@/lib/validations/catalog-admin";
import { ProductStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db/client";
import { fail, ok, STALE_MESSAGE, type AdminResult } from "./admin-result";

/**
 * Managing collections.
 *
 * The write counterpart to `lib/services/category-service.ts`, which only ever
 * returns active categories. This one returns all of them, because a disabled
 * collection is exactly what an administrator came to re-enable.
 */

/**
 * The portrait shape every tile, card and gallery frame in the storefront uses.
 *
 * Applied here rather than asked for, because the admin supplies a URL and alt
 * text; making somebody type pixel dimensions to satisfy a layout would be
 * asking them to do the component's arithmetic. The columns exist so the page
 * can reserve the box before the image loads, and 4:5 is what it reserves.
 */
const TILE_SIZE = { width: 800, height: 1000 } as const;

export type AdminCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  position: number;
  isActive: boolean;
  updatedAt: Date;
  /**
   * Every product in the collection, whatever its status.
   *
   * The admin count is the total rather than the public one: somebody about to
   * disable a collection needs to know how many products are attached to it,
   * and a draft counts for that. The screen labels it so the number cannot be
   * mistaken for what a shopper would see.
   */
  productCount: number;
  /** How many of those are live, shown beside the total for contrast. */
  activeProductCount: number;
};

export async function listAdminCategories(
  search?: string,
): Promise<AdminCategoryRow[]> {
  const rows = await prisma.category.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      position: true,
      isActive: true,
      updatedAt: true,
      // Counted by PostgreSQL, twice, in the query that fetched the rows.
      // Loading products to count them in JavaScript would read the catalogue
      // to produce two integers.
      _count: {
        select: {
          products: true,
          primaryFor: { where: { status: ProductStatus.ACTIVE } },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    imageUrl: row.imageUrl,
    position: row.position,
    isActive: row.isActive,
    updatedAt: row.updatedAt,
    productCount: row._count.products,
    activeProductCount: row._count.primaryFor,
  }));
}

export type AdminCategoryDetail = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  position: number;
  isActive: boolean;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: Date;
  productCount: number;
};

export async function getAdminCategory(
  id: string,
): Promise<AdminCategoryDetail | null> {
  const row = await prisma.category.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      imageUrl: true,
      imageAlt: true,
      position: true,
      isActive: true,
      seoTitle: true,
      seoDescription: true,
      updatedAt: true,
      _count: { select: { products: true } },
    },
  });

  if (!row) {
    return null;
  }

  const { _count, ...rest } = row;
  return { ...rest, productCount: _count.products };
}

const SLUG_TAKEN =
  "Another collection already uses that slug. Slugs are permanent URLs, so each one belongs to a single collection.";

async function slugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const existing = await prisma.category.findFirst({
    where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });

  return existing !== null;
}

/** The image columns, together, so a URL never arrives without its dimensions. */
function imageFieldsFor(input: { imageUrl: string | null; imageAlt: string | null }) {
  if (!input.imageUrl) {
    return {
      imageUrl: null,
      imageAlt: null,
      imageWidth: null,
      imageHeight: null,
    };
  }

  return {
    imageUrl: input.imageUrl,
    imageAlt: input.imageAlt,
    imageWidth: TILE_SIZE.width,
    imageHeight: TILE_SIZE.height,
  };
}

export async function createCategory(
  input: CreateCategoryInput,
): Promise<AdminResult<{ id: string }>> {
  if (await slugTaken(input.slug)) {
    return fail("slug-taken", SLUG_TAKEN, "slug");
  }

  const created = await prisma.category.create({
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      position: input.position,
      isActive: input.isActive,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      ...imageFieldsFor(input),
    },
    select: { id: true },
  });

  return ok(created);
}

/**
 * Update a collection, pinned to the version the form was rendered from.
 *
 * Same stale-write protection as products: `updateMany` with the expected
 * `updatedAt`, so a second administrator saving an older copy is told to
 * reload rather than silently reverting the first one's work.
 */
export async function updateCategory(
  input: UpdateCategoryInput,
): Promise<AdminResult<{ id: string; slug: string }>> {
  if (await slugTaken(input.slug, input.id)) {
    return fail("slug-taken", SLUG_TAKEN, "slug");
  }

  const { count } = await prisma.category.updateMany({
    where: { id: input.id, updatedAt: input.expectedUpdatedAt },
    data: {
      name: input.name,
      slug: input.slug,
      description: input.description,
      position: input.position,
      isActive: input.isActive,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      ...imageFieldsFor(input),
    },
  });

  if (count === 0) {
    // Either it is gone, or somebody else saved first. Told apart so the
    // message is accurate rather than a guess.
    const stillThere = await prisma.category.findUnique({
      where: { id: input.id },
      select: { id: true },
    });

    return stillThere
      ? fail("stale", STALE_MESSAGE)
      : fail("not-found", "That collection no longer exists.");
  }

  return ok({ id: input.id, slug: input.slug });
}

/**
 * Switch a collection on or off.
 *
 * Disabling is always allowed, whatever is attached: that is the whole point
 * of having the flag, and it is what an administrator does instead of deleting.
 * Products keep their membership and their foreign key stays valid; the
 * collection simply stops appearing in the navigation, the tiles, the filter
 * panel and the sitemap.
 *
 * Products whose *primary* category this is keep their card line and
 * breadcrumb. That is deliberate — a product is not hidden because a
 * collection was — and it is why the screen shows how many there are before
 * asking for confirmation.
 */
export async function setCategoryActive(
  id: string,
  isActive: boolean,
): Promise<AdminResult<{ id: string; slug: string; isActive: boolean }>> {
  const existing = await prisma.category.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) {
    return fail("not-found", "That collection no longer exists.");
  }

  const updated = await prisma.category.update({
    where: { id },
    data: { isActive },
    select: { id: true, slug: true, isActive: true },
  });

  return ok(updated);
}

/**
 * Move a collection one place up or down the running order.
 *
 * Two rows swap positions inside a transaction, so the order is never briefly
 * duplicated or briefly missing an entry. A simple pair of buttons rather than
 * drag and drop: it is keyboard-operable and screen-reader-operable without
 * any work, it persists server-side by construction, and for five collections
 * a drag surface would be more code and less accessible.
 *
 * Positions are re-based to 0..n-1 first, because the seed and hand edits can
 * leave gaps or ties that make "the next one up" ambiguous.
 */
export async function moveCategory(
  id: string,
  direction: "up" | "down",
): Promise<AdminResult<{ id: string }>> {
  return prisma.$transaction(async (tx) => {
    const ordered = await tx.category.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, position: true },
    });

    const index = ordered.findIndex((row) => row.id === id);

    if (index === -1) {
      return fail("not-found", "That collection no longer exists.");
    }

    const target = direction === "up" ? index - 1 : index + 1;

    if (target < 0 || target >= ordered.length) {
      // Already at the end. Not an error: the button is disabled there, and a
      // duplicate submit should be a no-op rather than a failure.
      return ok({ id });
    }

    const reordered = [...ordered];
    const moved = reordered[index];
    const displaced = reordered[target];

    if (!moved || !displaced) {
      return fail("not-found", "That collection no longer exists.");
    }

    reordered[index] = displaced;
    reordered[target] = moved;

    for (const [position, row] of reordered.entries()) {
      if (row.position !== position) {
        await tx.category.update({ where: { id: row.id }, data: { position } });
      }
    }

    return ok({ id });
  });
}
