import "server-only";

import type {
  CreateSizeInput,
  UpdateSizeInput,
} from "@/lib/validations/catalog-admin";
import { prisma } from "@/lib/db/client";
import { fail, ok, STALE_MESSAGE, type AdminResult } from "./admin-result";

/**
 * Managing the size run.
 *
 * `Size` is the sibling of `Color`: small, global, reusable, and referenced by
 * every variant cut in it. The same rules apply, for the same reasons — see
 * `color-admin-service.ts`.
 *
 * One difference worth knowing: a size's stable identifier is `code`, not a
 * slug. `XS` is what the URL carries in lower case (`?size=xs`), what a SKU is
 * built from (`PR-DR-0001-LAV-M`), and what the selector shows a shopper. So
 * it is unique, it is upper-cased on the way in, and renaming "Medium" to
 * "Regular" does not touch it.
 *
 * **Nothing here deletes.** `ProductVariant.sizeId` is `onDelete: Restrict`.
 * Switching a size off takes it out of the choices for new variants and out
 * of the shop filter while every existing variant keeps working.
 */

export type AdminSizeRow = {
  id: string;
  code: string;
  name: string;
  position: number;
  isActive: boolean;
  bustCm: number | null;
  waistCm: number | null;
  hipCm: number | null;
  updatedAt: Date;
  /** Variants cut in this size, live or withdrawn. */
  variantCount: number;
};

/**
 * The size run, smallest first.
 *
 * Usage counted by PostgreSQL in the query that fetched the rows, never by
 * loading variants and counting them here.
 */
export async function listAdminSizes(search?: string): Promise<AdminSizeRow[]> {
  const rows = await prisma.size.findMany({
    where: search
      ? {
          OR: [
            { code: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ position: "asc" }, { code: "asc" }],
    select: {
      id: true,
      code: true,
      name: true,
      position: true,
      isActive: true,
      bustCm: true,
      waistCm: true,
      hipCm: true,
      updatedAt: true,
      _count: { select: { variants: true } },
    },
  });

  return rows.map(({ _count, ...row }) => ({
    ...row,
    variantCount: _count.variants,
  }));
}

export type AdminSizeDetail = AdminSizeRow & { productCount: number };

export async function getAdminSize(id: string): Promise<AdminSizeDetail | null> {
  const row = await prisma.size.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      position: true,
      isActive: true,
      bustCm: true,
      waistCm: true,
      hipCm: true,
      updatedAt: true,
      _count: { select: { variants: true } },
    },
  });

  if (!row) {
    return null;
  }

  const products = await prisma.product.count({
    where: { variants: { some: { sizeId: id } } },
  });

  const { _count, ...rest } = row;

  return { ...rest, variantCount: _count.variants, productCount: products };
}

const CODE_TAKEN =
  "Another size already uses that code. It is what a SKU and the shop filter are built from, so each one belongs to a single size.";

async function codeTaken(code: string, exceptId?: string): Promise<boolean> {
  const existing = await prisma.size.findFirst({
    where: { code, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { id: true },
  });

  return existing !== null;
}

export async function createSize(
  input: CreateSizeInput,
): Promise<AdminResult<{ id: string }>> {
  if (await codeTaken(input.code)) {
    return fail("sku-taken", CODE_TAKEN, "code");
  }

  const created = await prisma.size.create({
    data: {
      code: input.code,
      name: input.name,
      position: input.position,
      isActive: input.isActive,
      bustCm: input.bustCm,
      waistCm: input.waistCm,
      hipCm: input.hipCm,
    },
    select: { id: true },
  });

  return ok(created);
}

/**
 * Update a size, pinned to the version the form was rendered from.
 *
 * The measurements are nullable and stay that way: a shop that has not
 * measured its garments should not be forced to invent numbers to save a
 * name change. Clearing a field sets it back to null rather than to zero,
 * which would read as "measured, and it is nothing".
 */
export async function updateSize(
  input: UpdateSizeInput,
): Promise<AdminResult<{ id: string; code: string }>> {
  if (await codeTaken(input.code, input.id)) {
    return fail("sku-taken", CODE_TAKEN, "code");
  }

  const { count } = await prisma.size.updateMany({
    where: { id: input.id, updatedAt: input.expectedUpdatedAt },
    data: {
      code: input.code,
      name: input.name,
      position: input.position,
      isActive: input.isActive,
      bustCm: input.bustCm,
      waistCm: input.waistCm,
      hipCm: input.hipCm,
    },
  });

  if (count === 0) {
    const stillThere = await prisma.size.findUnique({
      where: { id: input.id },
      select: { id: true },
    });

    return stillThere
      ? fail("stale", STALE_MESSAGE)
      : fail("not-found", "That size no longer exists.");
  }

  return ok({ id: input.id, code: input.code });
}

/**
 * Switch a size on or off.
 *
 * Off means: not offered when building new variants, and not shown as a shop
 * filter. Variants already cut in it keep their stock and stay sellable, and
 * switching it back on restores it with nothing lost.
 */
export async function setSizeActive(
  id: string,
  isActive: boolean,
): Promise<AdminResult<{ id: string; code: string; isActive: boolean }>> {
  // `updateMany` rather than a lookup followed by an update: this runs against
  // a database across a network, so a second round trip is a second wait an
  // administrator sits through for a switch. A count of zero means the row is
  // gone, which is the only thing the lookup was there to find out.
  const { count } = await prisma.size.updateMany({ where: { id }, data: { isActive } });

  if (count === 0) {
    return fail("not-found", "That size no longer exists.");
  }

  const updated = await prisma.size.findUniqueOrThrow({
    where: { id },
    select: { id: true, code: true, isActive: true },
  });

  return ok(updated);
}

/**
 * Move a size one place up or down.
 *
 * Order matters visibly here: it is what puts XS before XXL in the size
 * selector and in the shop's size facet. Reading the sizes in discovery order
 * is what once listed XS after XXL, which is why `position` exists and why it
 * is re-based on every move.
 */
export async function moveSize(
  id: string,
  direction: "up" | "down",
): Promise<AdminResult<{ id: string }>> {
  return prisma.$transaction(async (tx) => {
    const ordered = await tx.size.findMany({
      orderBy: [{ position: "asc" }, { code: "asc" }],
      select: { id: true, position: true },
    });

    const index = ordered.findIndex((row) => row.id === id);

    if (index === -1) {
      return fail("not-found", "That size no longer exists.");
    }

    const target = direction === "up" ? index - 1 : index + 1;

    if (target < 0 || target >= ordered.length) {
      return ok({ id });
    }

    const reordered = [...ordered];
    const moved = reordered[index];
    const displaced = reordered[target];

    if (!moved || !displaced) {
      return fail("not-found", "That size no longer exists.");
    }

    reordered[index] = displaced;
    reordered[target] = moved;

    for (const [position, row] of reordered.entries()) {
      if (row.position !== position) {
        await tx.size.update({ where: { id: row.id }, data: { position } });
      }
    }

    return ok({ id });
  });
}

/** Where a new size lands: after everything that already exists. */
export async function nextSizePosition(): Promise<number> {
  return prisma.size.count();
}
