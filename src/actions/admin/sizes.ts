"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";

import {
  adminActionSuccess,
  type AdminActionState,
} from "@/features/admin/action-state";
import {
  fieldErrorsFrom,
  fromServiceFailure,
  revalidateAttributeRoutes,
  text,
  toSafeFailure,
  valuesFrom,
} from "@/lib/admin/action-support";
import { requireAdminActor } from "@/lib/auth/admin-guard";
import {
  createSize,
  moveSize,
  setSizeActive,
  updateSize,
} from "@/lib/services/admin/size-admin-service";
import {
  attributeActivationSchema,
  attributeReorderSchema,
  createSizeSchema,
  updateSizeSchema,
} from "@/lib/validations/catalog-admin";

/**
 * Size mutations.
 *
 * The sibling of `colors.ts`, with the same contract: guard first, validate
 * from scratch, call the service, revalidate, return something serialisable.
 *
 * Sizes reach the storefront in two places — the size selector on a product
 * page and the size facet in the shop filter — so a change revalidates the
 * storefront layout as well as the admin screens.
 */

function sizeInputFrom(formData: FormData) {
  return {
    code: text(formData, "code"),
    name: text(formData, "name"),
    position: text(formData, "position"),
    isActive: formData.get("isActive"),
    bustCm: text(formData, "bustCm"),
    waistCm: text(formData, "waistCm"),
    hipCm: text(formData, "hipCm"),
  };
}

export async function createSizeAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let createdId: string;

  try {
    await requireAdminActor();

    const parsed = createSizeSchema.safeParse(sizeInputFrom(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields.",
        fieldErrors: fieldErrorsFrom(parsed.error),
        values: valuesFrom(formData),
      };
    }

    const result = await createSize(parsed.data);

    if (!result.ok) {
      return fromServiceFailure(result, valuesFrom(formData));
    }

    revalidateAttributeRoutes("sizes");
    createdId = result.data.id;
  } catch (error) {
    return toSafeFailure(error);
  }

  redirect(`/admin/sizes/${createdId}?created=1` as Route);
}

export async function updateSizeAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = updateSizeSchema.safeParse({
      ...sizeInputFrom(formData),
      id: text(formData, "id"),
      expectedUpdatedAt: text(formData, "expectedUpdatedAt"),
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields.",
        fieldErrors: fieldErrorsFrom(parsed.error),
        values: valuesFrom(formData),
      };
    }

    const result = await updateSize(parsed.data);

    if (!result.ok) {
      return fromServiceFailure(result, valuesFrom(formData));
    }

    revalidateAttributeRoutes("sizes");

    return adminActionSuccess("Saved.");
  } catch (error) {
    return toSafeFailure(error);
  }
}

/**
 * Switch a size on or off.
 *
 * Off takes it out of the choices for new variants and out of the shop's size
 * facet. Every variant already cut in it keeps its stock and stays sellable.
 */
export async function setSizeActiveAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = attributeActivationSchema.safeParse({
      id: text(formData, "id"),
      isActive: formData.get("isActive"),
    });

    if (!parsed.success) {
      return { status: "error", message: "That change could not be applied." };
    }

    const result = await setSizeActive(parsed.data.id, parsed.data.isActive);

    if (!result.ok) {
      return fromServiceFailure(result);
    }

    revalidateAttributeRoutes("sizes");

    return adminActionSuccess(
      result.data.isActive
        ? `${result.data.code} is offered again, for new variants and in the shop filter.`
        : `${result.data.code} is no longer offered for new variants. Existing ones keep it and stay sellable.`,
    );
  } catch (error) {
    return toSafeFailure(error);
  }
}

/** Move one size up or down the running order. */
export async function moveSizeAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = attributeReorderSchema.safeParse({
      id: text(formData, "id"),
      direction: text(formData, "direction"),
    });

    if (!parsed.success) {
      return { status: "error", message: "That change could not be applied." };
    }

    const result = await moveSize(parsed.data.id, parsed.data.direction);

    if (!result.ok) {
      return fromServiceFailure(result);
    }

    revalidateAttributeRoutes("sizes");

    return adminActionSuccess("Order updated.");
  } catch (error) {
    return toSafeFailure(error);
  }
}
