import "server-only";

import type {
  CreateColorInput,
  UpdateColorInput,
} from "@/lib/validations/catalog-admin";
import { prisma } from "@/lib/db/client";
import { fail, ok, STALE_MESSAGE, type AdminResult } from "./admin-result";

/**
 * Managing the colour palette.
 *
 * `Color` is a small, global, reusable table: "Lavender" is one row that many
 * products point at, which is why the swatch, the name and the spelling are
 * the same everywhere and the colour filter has one entry for it rather than
 * one per product. That makes it shared infrastructure, and everything here
 * is written with the fact that changing one row changes every product cut in
 * that colour.
 *
 * **Nothing here deletes.** A colour is referenced by `ProductVariant` and by
 * `ProductImage`, both with `onDelete: Restrict`, so a delete would either
 * fail on a foreign key or — if it succeeded on an unused row — save a single
 * row at the cost of an irreversible button on a list screen. Switching a
 * colour off removes it from the choices offered for *new* variants while
 * every existing variant, image and order-line-to-be keeps working. That is
 * what an administrator actually wants, and it is reversible.
 */

export type AdminColorRow = {
  id: string;
  name: string;
  slug: string;
  hex: string;
  position: number;
  isActive: boolean;
  updatedAt: Date;
  /** Variants cut in this colour, live or withdrawn. */
  variantCount: number;
  /** Photographs tied to this colour. */
  imageCount: number;
};

/**
 * The palette, in merchandising order.
 *
 * Usage is counted by PostgreSQL in the same query that fetched the rows —
 * two `_count` aggregations — rather than by loading variants and counting
 * them here. A colour used by two hundred variants must cost the same as one
 * used by none.
 */
export async function listAdminColors(search?: string): Promise<AdminColorRow[]> {
  const rows = await prisma.color.findMany({
    where: search
      ? {
          OR: [
            { name: { contains: search, mode: "insensitive" } },
            { slug: { contains: search, mode: "insensitive" } },
            { hex: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      slug: true,
      hex: true,
      position: true,
      isActive: true,
      updatedAt: true,
      _count: { select: { variants: true, images: true } },
    },
  });

  return rows.map(({ _count, ...row }) => ({
    ...row,
    variantCount: _count.variants,
    imageCount: _count.images,
  }));
}

export type AdminColorDetail = Omit<AdminColorRow, "variantCount" | "imageCount"> & {
  variantCount: number;
  imageCount: number;
  /** Which products are cut in it, so the edit screen can say what is affected. */
  productCount: number;
};

export async function getAdminColor(id: string): Promise<AdminColorDetail | null> {
  const row = await prisma.color.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      slug: true,
      hex: true,
      position: true,
      isActive: true,
      updatedAt: true,
      _count: { select: { variants: true, images: true } },
    },
  });

  if (!row) {
    return null;
  }

  // Distinct products, which is the number that means something to a person:
  // "eleven variants" across three products is three garments.
  const products = await prisma.product.count({
    where: { variants: { some: { colorId: id } } },
  });

  const { _count, ...rest } = row;

  return {
    ...rest,
    variantCount: _count.variants,
    imageCount: _count.images,
    productCount: products,
  };
}

const SLUG_TAKEN =
  "Another colour already uses that slug. It is the value the shop filter carries in its URL, so each one belongs to a single colour.";

async function slugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const existing = await prisma.color.findFirst({
    where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });

  return existing !== null;
}

export async function createColor(
  input: CreateColorInput,
): Promise<AdminResult<{ id: string }>> {
  if (await slugTaken(input.slug)) {
    return fail("slug-taken", SLUG_TAKEN, "slug");
  }

  const created = await prisma.color.create({
    data: {
      name: input.name,
      slug: input.slug,
      hex: input.hex,
      position: input.position,
      isActive: input.isActive,
    },
    select: { id: true },
  });

  return ok(created);
}

/**
 * Update a colour, pinned to the version the form was rendered from.
 *
 * Same stale-write protection as products and collections. It matters more
 * here than the size of the form suggests: a colour is shared, so two
 * administrators saving different hex values would leave the losing change
 * silently gone from every product cut in it.
 */
export async function updateColor(
  input: UpdateColorInput,
): Promise<AdminResult<{ id: string; slug: string }>> {
  if (await slugTaken(input.slug, input.id)) {
    return fail("slug-taken", SLUG_TAKEN, "slug");
  }

  const { count } = await prisma.color.updateMany({
    where: { id: input.id, updatedAt: input.expectedUpdatedAt },
    data: {
      name: input.name,
      slug: input.slug,
      hex: input.hex,
      position: input.position,
      isActive: input.isActive,
    },
  });

  if (count === 0) {
    const stillThere = await prisma.color.findUnique({
      where: { id: input.id },
      select: { id: true },
    });

    return stillThere
      ? fail("stale", STALE_MESSAGE)
      : fail("not-found", "That colour no longer exists.");
  }

  return ok({ id: input.id, slug: input.slug });
}

/**
 * Switch a colour on or off.
 *
 * Off means: not offered when building new variants, and not shown as a
 * filter in the shop. It does **not** mean the colour stops existing.
 * Variants already cut in it keep their stock and stay sellable, their
 * photographs keep their association, and switching it back on restores it to
 * the choices with nothing lost.
 *
 * Allowed whatever is attached, deliberately. A colour being retired is
 * exactly the case this flag is for, and refusing because it is in use would
 * leave no way to retire anything.
 */
export async function setColorActive(
  id: string,
  isActive: boolean,
): Promise<AdminResult<{ id: string; name: string; isActive: boolean }>> {
  // `updateMany` rather than a lookup followed by an update: this runs against
  // a database across a network, so a second round trip is a second wait an
  // administrator sits through for a switch. A count of zero means the row is
  // gone, which is the only thing the lookup was there to find out.
  const { count } = await prisma.color.updateMany({ where: { id }, data: { isActive } });

  if (count === 0) {
    return fail("not-found", "That colour no longer exists.");
  }

  const updated = await prisma.color.findUniqueOrThrow({
    where: { id },
    select: { id: true, name: true, isActive: true },
  });

  return ok(updated);
}

/**
 * Move a colour one place up or down.
 *
 * The same mechanism collections use: positions are re-based to 0..n-1 first,
 * because a seed or a hand edit can leave gaps and ties that make "the next
 * one up" ambiguous, then the pair swaps, all inside one transaction so the
 * order is never briefly duplicated.
 *
 * The order matters in two visible places: the swatch row on a product page,
 * and the colour filter in the shop.
 */
export async function moveColor(
  id: string,
  direction: "up" | "down",
): Promise<AdminResult<{ id: string }>> {
  return prisma.$transaction(async (tx) => {
    const ordered = await tx.color.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, position: true },
    });

    const index = ordered.findIndex((row) => row.id === id);

    if (index === -1) {
      return fail("not-found", "That colour no longer exists.");
    }

    const target = direction === "up" ? index - 1 : index + 1;

    if (target < 0 || target >= ordered.length) {
      // Already at the end. The button is disabled there, so a duplicate
      // submit should do nothing rather than fail.
      return ok({ id });
    }

    const reordered = [...ordered];
    const moved = reordered[index];
    const displaced = reordered[target];

    if (!moved || !displaced) {
      return fail("not-found", "That colour no longer exists.");
    }

    reordered[index] = displaced;
    reordered[target] = moved;

    for (const [position, row] of reordered.entries()) {
      if (row.position !== position) {
        await tx.color.update({ where: { id: row.id }, data: { position } });
      }
    }

    return ok({ id });
  });
}

/** Where a new colour lands: after everything that already exists. */
export async function nextColorPosition(): Promise<number> {
  return prisma.color.count();
}
