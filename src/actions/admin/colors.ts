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
  createColor,
  moveColor,
  setColorActive,
  updateColor,
} from "@/lib/services/admin/color-admin-service";
import {
  attributeActivationSchema,
  attributeReorderSchema,
  createColorSchema,
  updateColorSchema,
} from "@/lib/validations/catalog-admin";

/**
 * Colour mutations.
 *
 * Same contract as every other admin action: guard first, validate from
 * scratch, call the service, revalidate what changed, return something
 * serialisable. See `actions/admin/products.ts` for why the guard is written
 * out in each one rather than wrapped, and `pnpm check:admin` for the audit
 * that proves none is missing it.
 *
 * Colours reach further into the storefront than most catalogue edits: they
 * are swatches on every product page and options in the shop's colour filter,
 * so a change here revalidates the storefront layout as well as the admin
 * screens. See `revalidateAttributeRoutes`.
 */

function colorInputFrom(formData: FormData) {
  return {
    name: text(formData, "name"),
    slug: text(formData, "slug"),
    hex: text(formData, "hex"),
    position: text(formData, "position"),
    isActive: formData.get("isActive"),
  };
}

export async function createColorAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let createdId: string;

  try {
    await requireAdminActor();

    const parsed = createColorSchema.safeParse(colorInputFrom(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields.",
        fieldErrors: fieldErrorsFrom(parsed.error),
        values: valuesFrom(formData),
      };
    }

    const result = await createColor(parsed.data);

    if (!result.ok) {
      return fromServiceFailure(result, valuesFrom(formData));
    }

    revalidateAttributeRoutes("colors");
    createdId = result.data.id;
  } catch (error) {
    return toSafeFailure(error);
  }

  redirect(`/admin/colors/${createdId}?created=1` as Route);
}

export async function updateColorAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = updateColorSchema.safeParse({
      ...colorInputFrom(formData),
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

    const result = await updateColor(parsed.data);

    if (!result.ok) {
      return fromServiceFailure(result, valuesFrom(formData));
    }

    revalidateAttributeRoutes("colors");

    return adminActionSuccess("Saved.");
  } catch (error) {
    return toSafeFailure(error);
  }
}

/**
 * Switch a colour on or off.
 *
 * Off takes it out of the choices for new variants and out of the shop's
 * colour filter. Variants already cut in it keep their stock and stay
 * sellable, and their photographs keep their association — nothing is
 * deleted, and switching it back on restores all of it.
 */
export async function setColorActiveAction(
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

    const result = await setColorActive(parsed.data.id, parsed.data.isActive);

    if (!result.ok) {
      return fromServiceFailure(result);
    }

    revalidateAttributeRoutes("colors");

    return adminActionSuccess(
      result.data.isActive
        ? `${result.data.name} is offered again, for new variants and in the shop filter.`
        : `${result.data.name} is no longer offered for new variants. Existing ones keep it and stay sellable.`,
    );
  } catch (error) {
    return toSafeFailure(error);
  }
}

/** Move one colour up or down the running order. */
export async function moveColorAction(
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

    const result = await moveColor(parsed.data.id, parsed.data.direction);

    if (!result.ok) {
      return fromServiceFailure(result);
    }

    revalidateAttributeRoutes("colors");

    return adminActionSuccess("Order updated.");
  } catch (error) {
    return toSafeFailure(error);
  }
}
