import "server-only";

import type {
  CreateVariantInput,
  CreateVariantsInput,
} from "@/lib/validations/catalog-admin";
import { prisma } from "@/lib/db/client";
import { fail, ok, type AdminResult } from "./admin-result";

/**
 * Managing sellable combinations.
 *
 * A variant is a product in one colour in one size, and it is the row stock
 * hangs off and the row a future order line will point at. Everything here
 * respects two rules the schema already enforces:
 *
 * - `@@unique([productId, colorId, sizeId])` — there is at most one "pink, M".
 * - `ProductVariant.sku` is unique across the whole catalogue.
 *
 * Both are checked here first, so the administrator gets a message on the right
 * field, and both remain enforced by the database, so two administrators
 * racing cannot produce a duplicate. The pre-check is the user interface; the
 * constraint is the guarantee.
 */

const SKU_TAKEN =
  "That SKU is already used by another variant. A SKU identifies one physical thing, so it cannot be shared.";

async function skuOwners(skus: string[], exceptId?: string): Promise<Set<string>> {
  if (skus.length === 0) {
    return new Set();
  }

  const rows = await prisma.productVariant.findMany({
    where: { sku: { in: skus }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { sku: true },
  });

  return new Set(rows.map((row) => row.sku));
}

/**
 * Which colour-and-size pairs a product already has.
 *
 * Deactivated variants count. A withdrawn "pink, M" still occupies that
 * combination — it is the same garment and a future order may reference it —
 * so adding another would be creating a second row for one thing. The fix for
 * "I want pink M back" is to reactivate it, which is what the screen offers.
 */
async function existingCombinations(productId: string): Promise<Set<string>> {
  const rows = await prisma.productVariant.findMany({
    where: { productId },
    select: { colorId: true, sizeId: true },
  });

  return new Set(rows.map((row) => `${row.colorId}/${row.sizeId}`));
}

/**
 * Create one variant and the inventory row behind it.
 *
 * A transaction, because a variant without inventory reads as unavailable
 * everywhere in the storefront: half of this operation is worse than none of
 * it.
 */
export async function createVariant(
  input: CreateVariantInput,
): Promise<AdminResult<{ id: string }>> {
  const [taken, combinations] = await Promise.all([
    skuOwners([input.sku]),
    existingCombinations(input.productId),
  ]);

  if (taken.has(input.sku)) {
    return fail("sku-taken", SKU_TAKEN, "sku");
  }

  if (combinations.has(`${input.colorId}/${input.sizeId}`)) {
    return fail(
      "variant-exists",
      "This product already has that colour in that size. Edit the existing variant, or reactivate it if it was withdrawn.",
      "sizeId",
    );
  }

  const position = await prisma.productVariant.count({
    where: { productId: input.productId },
  });

  const created = await prisma.$transaction(async (tx) => {
    const variant = await tx.productVariant.create({
      data: {
        productId: input.productId,
        colorId: input.colorId,
        sizeId: input.sizeId,
        sku: input.sku,
        isActive: true,
        position,
      },
      select: { id: true },
    });

    await tx.inventory.create({
      data: {
        variantId: variant.id,
        quantity: input.quantity,
        lowStockThreshold: input.lowStockThreshold,
      },
    });

    return variant;
  });

  return ok(created);
}

/**
 * Create several variants at once, after the administrator has reviewed them.
 *
 * Fashion products come in a grid — three colours by five sizes is fifteen
 * rows — and typing fifteen SKUs by hand is how a SKU gets a typo. So the
 * screen generates the combinations, fills in a suggested SKU and stock for
 * each, and shows them as an editable table. **Nothing is written until the
 * administrator submits that table**, and what is written is what they can
 * see, not what was generated.
 *
 * The whole batch is one transaction. A partial result would leave a product
 * with an arbitrary subset of its size run and no indication of which rows
 * were meant to exist.
 *
 * Combinations that already exist are reported rather than skipped: silently
 * dropping rows from a batch the admin reviewed would be the screen lying
 * about what it did.
 */
export async function createVariants(
  input: CreateVariantsInput,
): Promise<AdminResult<{ created: number }>> {
  const skus = input.variants.map((variant) => variant.sku);
  const duplicateInBatch = skus.find(
    (sku, index) => skus.indexOf(sku) !== index,
  );

  if (duplicateInBatch) {
    return fail(
      "sku-taken",
      `Two of these variants share the SKU ${duplicateInBatch}. Each one has to be unique.`,
      "sku",
    );
  }

  const [taken, combinations] = await Promise.all([
    skuOwners(skus),
    existingCombinations(input.productId),
  ]);

  const clash = skus.find((sku) => taken.has(sku));

  if (clash) {
    return fail("sku-taken", `The SKU ${clash} is already used by another variant.`, "sku");
  }

  const alreadyThere = input.variants.find((variant) =>
    combinations.has(`${variant.colorId}/${variant.sizeId}`),
  );

  if (alreadyThere) {
    return fail(
      "variant-exists",
      "Some of those combinations already exist on this product. Remove them from the list and try again.",
    );
  }

  const startPosition = await prisma.productVariant.count({
    where: { productId: input.productId },
  });

  await prisma.$transaction(async (tx) => {
    for (const [offset, variant] of input.variants.entries()) {
      const created = await tx.productVariant.create({
        data: {
          productId: input.productId,
          colorId: variant.colorId,
          sizeId: variant.sizeId,
          sku: variant.sku,
          isActive: true,
          position: startPosition + offset,
        },
        select: { id: true },
      });

      await tx.inventory.create({
        data: {
          variantId: created.id,
          quantity: variant.quantity,
          lowStockThreshold: variant.lowStockThreshold,
        },
      });
    }
  });

  return ok({ created: input.variants.length });
}

/**
 * Update a variant's SKU, stock and availability.
 *
 * Colour and size are not editable. Changing either would quietly turn one
 * sellable thing into a different one while keeping its identity, its stock
 * and anything pointing at it. To sell a different combination, add a variant
 * and withdraw this one.
 *
 * The non-negative stock rules are enforced twice: in the schema, so the
 * message lands on the field, and by a CHECK constraint, so nothing can write
 * a negative quantity whatever the path.
 */
export async function updateVariant(input: {
  id: string;
  sku: string;
  quantity: number;
  lowStockThreshold: number;
  isActive: boolean;
}): Promise<AdminResult<{ id: string; productId: string }>> {
  const existing = await prisma.productVariant.findUnique({
    where: { id: input.id },
    select: { id: true, productId: true },
  });

  if (!existing) {
    return fail("not-found", "That variant no longer exists.");
  }

  const taken = await skuOwners([input.sku], input.id);

  if (taken.has(input.sku)) {
    return fail("sku-taken", SKU_TAKEN, "sku");
  }

  await prisma.$transaction(async (tx) => {
    await tx.productVariant.update({
      where: { id: input.id },
      data: { sku: input.sku, isActive: input.isActive },
    });

    // Upserted rather than updated: a variant imported without stock has no
    // inventory row, and the first edit should create one rather than fail.
    await tx.inventory.upsert({
      where: { variantId: input.id },
      create: {
        variantId: input.id,
        quantity: input.quantity,
        lowStockThreshold: input.lowStockThreshold,
      },
      update: {
        quantity: input.quantity,
        lowStockThreshold: input.lowStockThreshold,
      },
    });
  });

  return ok({ id: input.id, productId: existing.productId });
}

/**
 * Withdraw a variant, or bring it back.
 *
 * Never a delete. This is the row a future order line will name, so removing
 * it would leave a past purchase pointing at nothing. A withdrawn variant
 * disappears from the storefront immediately — every public query filters on
 * `isActive` — and keeps its SKU, its stock and its place in the size run.
 */
export async function setVariantActive(
  id: string,
  isActive: boolean,
): Promise<AdminResult<{ id: string; productId: string }>> {
  const existing = await prisma.productVariant.findUnique({
    where: { id },
    select: { productId: true },
  });

  if (!existing) {
    return fail("not-found", "That variant no longer exists.");
  }

  await prisma.productVariant.update({ where: { id }, data: { isActive } });

  return ok({ id, productId: existing.productId });
}
