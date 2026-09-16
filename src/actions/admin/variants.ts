"use server";

import {
  adminActionSuccess,
  type AdminActionState,
} from "@/features/admin/action-state";
import {
  fieldErrorsFrom,
  fromServiceFailure,
  revalidateAdminProduct,
  revalidateProductRoutes,
  text,
  textList,
  toSafeFailure,
  valuesFrom,
} from "@/lib/admin/action-support";
import { requireAdminActor } from "@/lib/auth/admin-guard";
import {
  createVariant,
  createVariants,
  setVariantActive,
  updateVariant,
} from "@/lib/services/admin/variant-admin-service";
import {
  createVariantSchema,
  createVariantsSchema,
  updateVariantSchema,
  variantActivationSchema,
} from "@/lib/validations/catalog-admin";
import { prisma } from "@/lib/db/client";

/**
 * Variant and stock mutations.
 *
 * Same contract as the other admin actions: guard first, validate from
 * scratch, call the service, revalidate, return something serialisable.
 *
 * Stock lives here rather than in its own "inventory" area because this phase
 * manages a quantity, not stock movements. There is no adjustment reason, no
 * ledger and no reservation; an administrator corrects a number. The workflows
 * that change stock *for a reason* are the inventory phase, and `Inventory` is
 * already the table they will attach to.
 */

/**
 * Which product to refresh after a variant changed.
 *
 * Looked up rather than trusted from the form: the slug decides which public
 * URL is revalidated, and a form that could name any slug could be used to
 * evict any cached page.
 */
async function productRoutesFor(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  });

  revalidateAdminProduct(productId);
  revalidateProductRoutes(product?.slug);
}

export async function createVariantAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = createVariantSchema.safeParse({
      productId: text(formData, "productId"),
      colorId: text(formData, "colorId"),
      sizeId: text(formData, "sizeId"),
      sku: text(formData, "sku"),
      quantity: text(formData, "quantity"),
      lowStockThreshold: text(formData, "lowStockThreshold"),
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields.",
        fieldErrors: fieldErrorsFrom(parsed.error),
        values: valuesFrom(formData),
      };
    }

    const result = await createVariant(parsed.data);

    if (!result.ok) {
      return fromServiceFailure(result, valuesFrom(formData));
    }

    await productRoutesFor(parsed.data.productId);

    return adminActionSuccess("Variant added.");
  } catch (error) {
    return toSafeFailure(error);
  }
}

/**
 * Create the reviewed batch from the bulk generator.
 *
 * The rows arrive as parallel arrays, one entry per generated combination,
 * exactly as the admin edited them. Nothing is regenerated here: what is
 * written is what was on screen.
 */
export async function createVariantsAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const colorIds = textList(formData, "row.colorId");
    const sizeIds = textList(formData, "row.sizeId");
    const skus = textList(formData, "row.sku");
    const quantities = textList(formData, "row.quantity");
    const thresholds = textList(formData, "row.lowStockThreshold");

    const sameLength = [sizeIds, skus, quantities, thresholds].every(
      (list) => list.length === colorIds.length,
    );

    if (!sameLength || colorIds.length === 0) {
      return {
        status: "error",
        message: "That list could not be read. Generate the combinations again.",
      };
    }

    const parsed = createVariantsSchema.safeParse({
      productId: text(formData, "productId"),
      variants: colorIds.map((colorId, index) => ({
        colorId,
        sizeId: sizeIds[index],
        sku: skus[index],
        quantity: quantities[index],
        lowStockThreshold: thresholds[index],
      })),
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted rows.",
        fieldErrors: fieldErrorsFrom(parsed.error),
        values: valuesFrom(formData),
      };
    }

    const result = await createVariants(parsed.data);

    if (!result.ok) {
      return fromServiceFailure(result, valuesFrom(formData));
    }

    await productRoutesFor(parsed.data.productId);

    return adminActionSuccess(
      `${result.data.created} ${result.data.created === 1 ? "variant" : "variants"} added.`,
    );
  } catch (error) {
    return toSafeFailure(error);
  }
}

export async function updateVariantAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = updateVariantSchema.safeParse({
      id: text(formData, "id"),
      sku: text(formData, "sku"),
      quantity: text(formData, "quantity"),
      lowStockThreshold: text(formData, "lowStockThreshold"),
      isActive: formData.get("isActive"),
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields.",
        fieldErrors: fieldErrorsFrom(parsed.error),
        values: valuesFrom(formData),
      };
    }

    const result = await updateVariant(parsed.data);

    if (!result.ok) {
      return fromServiceFailure(result, valuesFrom(formData));
    }

    await productRoutesFor(result.data.productId);

    return adminActionSuccess("Variant saved.");
  } catch (error) {
    return toSafeFailure(error);
  }
}

/**
 * Withdraw a variant, or bring it back.
 *
 * Never a delete: this is the row a future order line will name.
 */
export async function setVariantActiveAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = variantActivationSchema.safeParse({
      id: text(formData, "id"),
      isActive: formData.get("isActive"),
    });

    if (!parsed.success) {
      return { status: "error", message: "That change could not be applied." };
    }

    const result = await setVariantActive(parsed.data.id, parsed.data.isActive);

    if (!result.ok) {
      return fromServiceFailure(result);
    }

    await productRoutesFor(result.data.productId);

    return adminActionSuccess(
      parsed.data.isActive
        ? "Variant restored. It is sellable again."
        : "Variant withdrawn. It is hidden from the shop and its stock is kept.",
    );
  } catch (error) {
    return toSafeFailure(error);
  }
}
