import "server-only";

import type {
  CreateImageInput,
  UpdateImageInput,
} from "@/lib/validations/catalog-admin";
import { prisma } from "@/lib/db/client";
import { fail, ok, type AdminResult } from "./admin-result";

/**
 * Managing product photography.
 *
 * Image *hosting* is not implemented and is not in this phase. What an
 * administrator manages is the URL, the alt text, the running order, which
 * colour a photograph is of, and which one is the card image. The URL is
 * checked against the configured hosts in the validation schema, because a
 * host `next/image` is not configured for throws at render time and would
 * break the storefront rather than the form.
 *
 * Two rules are maintained here rather than hoped for:
 *
 * - **Positions are contiguous.** Every write re-bases the product's images to
 *   0..n-1 in their current order, so a delete never leaves a gap and two
 *   images never share a slot. The storefront orders by `position`, so this is
 *   the order a shopper sees; it is not React state.
 * - **At most one primary.** Marking one clears the rest inside the same
 *   transaction, so there is never a moment with two card images.
 */

/** The 4:5 portrait every card, tile and gallery frame reserves space for. */
const IMAGE_SIZE = { width: 800, height: 1000 } as const;

/**
 * Renumber a product's images 0..n-1 in their current order.
 *
 * Run inside the caller's transaction so the intermediate state is never
 * visible. Cheap: a product has a handful of photographs.
 */
async function compactPositions(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  productId: string,
): Promise<void> {
  const images = await tx.productImage.findMany({
    where: { productId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: { id: true, position: true },
  });

  for (const [position, image] of images.entries()) {
    if (image.position !== position) {
      await tx.productImage.update({ where: { id: image.id }, data: { position } });
    }
  }
}

/** Clear every other primary flag on the product. */
async function clearOtherPrimaries(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  productId: string,
  keepId: string,
): Promise<void> {
  await tx.productImage.updateMany({
    where: { productId, id: { not: keepId }, isPrimary: true },
    data: { isPrimary: false },
  });
}

/**
 * Does this colour belong to this product?
 *
 * A photograph may be shared by every colour (`colorId` null) or belong to one
 * the product is actually cut in. Attaching it to a colour the product has no
 * variants in would create a gallery entry no shopper could ever reach, so it
 * is refused.
 */
async function colourIsOnProduct(
  productId: string,
  colorId: string,
): Promise<boolean> {
  const variant = await prisma.productVariant.findFirst({
    where: { productId, colorId },
    select: { id: true },
  });

  return variant !== null;
}

const UNKNOWN_COLOUR =
  "This product is not made in that colour, so a photograph of it would never be shown. Add a variant in that colour first, or make the image shared.";

export async function createProductImage(
  input: CreateImageInput,
): Promise<AdminResult<{ id: string }>> {
  const product = await prisma.product.findUnique({
    where: { id: input.productId },
    select: { id: true },
  });

  if (!product) {
    return fail("not-found", "That product no longer exists.");
  }

  if (input.colorId && !(await colourIsOnProduct(input.productId, input.colorId))) {
    return fail("invalid-reference", UNKNOWN_COLOUR, "colorId");
  }

  // Appended to the end. The admin reorders afterwards, which is less
  // surprising than a new photograph landing in the middle.
  const position = await prisma.productImage.count({
    where: { productId: input.productId },
  });

  // The first photograph a product gets is its card image, whatever the box
  // says: a product with photographs and no primary would render the fallback.
  const isFirst = position === 0;

  const created = await prisma.$transaction(async (tx) => {
    const image = await tx.productImage.create({
      data: {
        productId: input.productId,
        colorId: input.colorId,
        url: input.url,
        alt: input.alt,
        position,
        isPrimary: input.isPrimary || isFirst,
        width: IMAGE_SIZE.width,
        height: IMAGE_SIZE.height,
      },
      select: { id: true },
    });

    if (input.isPrimary || isFirst) {
      await clearOtherPrimaries(tx, input.productId, image.id);
    }

    await compactPositions(tx, input.productId);

    return image;
  });

  return ok(created);
}

export async function updateProductImage(
  input: UpdateImageInput,
): Promise<AdminResult<{ id: string; productId: string }>> {
  const existing = await prisma.productImage.findUnique({
    where: { id: input.id },
    select: { id: true, productId: true },
  });

  if (!existing) {
    return fail("not-found", "That image no longer exists.");
  }

  if (input.colorId && !(await colourIsOnProduct(existing.productId, input.colorId))) {
    return fail("invalid-reference", UNKNOWN_COLOUR, "colorId");
  }

  await prisma.$transaction(async (tx) => {
    await tx.productImage.update({
      where: { id: input.id },
      data: {
        url: input.url,
        alt: input.alt,
        colorId: input.colorId,
        isPrimary: input.isPrimary,
      },
    });

    if (input.isPrimary) {
      await clearOtherPrimaries(tx, existing.productId, input.id);
    }
  });

  return ok({ id: input.id, productId: existing.productId });
}

/**
 * Remove a photograph.
 *
 * The one place in the admin catalogue where a row is genuinely deleted, and
 * it is deliberate: an image is content, not a record. Nothing will ever
 * reference it — an order names a variant, never a photograph — so there is
 * no history to preserve, and keeping deleted images would mean a "deleted"
 * flag on every gallery query for no benefit.
 *
 * When the card image goes, the next photograph in order takes over, so a
 * product with photographs always has one.
 */
export async function deleteProductImage(
  id: string,
): Promise<AdminResult<{ productId: string }>> {
  const existing = await prisma.productImage.findUnique({
    where: { id },
    select: { id: true, productId: true, isPrimary: true },
  });

  if (!existing) {
    return fail("not-found", "That image no longer exists.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.productImage.delete({ where: { id } });
    await compactPositions(tx, existing.productId);

    if (existing.isPrimary) {
      const next = await tx.productImage.findFirst({
        where: { productId: existing.productId },
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: { id: true },
      });

      if (next) {
        await tx.productImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }
  });

  return ok({ productId: existing.productId });
}

/**
 * Move a photograph one place up or down.
 *
 * The pair swaps position inside a transaction, then the whole set is
 * re-based, so the order is never briefly duplicated. Buttons rather than drag
 * and drop: keyboard and screen-reader users get the same control as everyone
 * else without a parallel implementation, and the order is persisted by the
 * act of pressing rather than by a later save nobody remembers to do.
 */
export async function moveProductImage(
  id: string,
  direction: "up" | "down",
): Promise<AdminResult<{ productId: string }>> {
  const existing = await prisma.productImage.findUnique({
    where: { id },
    select: { productId: true },
  });

  if (!existing) {
    return fail("not-found", "That image no longer exists.");
  }

  await prisma.$transaction(async (tx) => {
    const images = await tx.productImage.findMany({
      where: { productId: existing.productId },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true },
    });

    const index = images.findIndex((image) => image.id === id);
    const target = direction === "up" ? index - 1 : index + 1;

    if (index === -1 || target < 0 || target >= images.length) {
      // At the end already. The button is disabled there; a duplicate submit
      // should do nothing rather than fail.
      return;
    }

    const reordered = [...images];
    const moved = reordered[index];
    const displaced = reordered[target];

    if (!moved || !displaced) {
      return;
    }

    reordered[index] = displaced;
    reordered[target] = moved;

    for (const [position, image] of reordered.entries()) {
      await tx.productImage.update({ where: { id: image.id }, data: { position } });
    }
  });

  return ok({ productId: existing.productId });
}
