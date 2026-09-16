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
  revalidateCategoryRoutes,
  text,
  toSafeFailure,
  valuesFrom,
} from "@/lib/admin/action-support";
import { requireAdminActor } from "@/lib/auth/admin-guard";
import {
  createCategory,
  moveCategory,
  setCategoryActive,
  updateCategory,
} from "@/lib/services/admin/category-admin-service";
import {
  categoryActivationSchema,
  categoryReorderSchema,
  createCategorySchema,
  updateCategorySchema,
} from "@/lib/validations/catalog-admin";

/**
 * Collection mutations.
 *
 * Same contract as the product actions: guard first, validate from scratch,
 * call the service, revalidate what changed, return something serialisable.
 * See `actions/admin/products.ts` for why the guard is written out in each
 * action rather than wrapped.
 *
 * Categories revalidate more of the storefront than products do, because they
 * are in the header, the mobile drawer, the footer, the home tiles and the
 * filter panel — which is every page.
 */

function categoryInputFrom(formData: FormData) {
  return {
    name: text(formData, "name"),
    slug: text(formData, "slug"),
    description: text(formData, "description"),
    imageUrl: text(formData, "imageUrl"),
    imageAlt: text(formData, "imageAlt"),
    position: text(formData, "position"),
    isActive: formData.get("isActive"),
    seoTitle: text(formData, "seoTitle"),
    seoDescription: text(formData, "seoDescription"),
  };
}

export async function createCategoryAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let createdId: string;

  try {
    await requireAdminActor();

    const parsed = createCategorySchema.safeParse(categoryInputFrom(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields.",
        fieldErrors: fieldErrorsFrom(parsed.error),
        values: valuesFrom(formData),
      };
    }

    const result = await createCategory(parsed.data);

    if (!result.ok) {
      return fromServiceFailure(result, valuesFrom(formData));
    }

    revalidateCategoryRoutes();
    createdId = result.data.id;
  } catch (error) {
    return toSafeFailure(error);
  }

  redirect(`/admin/categories/${createdId}?created=1` as Route);
}

export async function updateCategoryAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = updateCategorySchema.safeParse({
      ...categoryInputFrom(formData),
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

    const result = await updateCategory(parsed.data);

    if (!result.ok) {
      return fromServiceFailure(result, valuesFrom(formData));
    }

    revalidateCategoryRoutes();

    return adminActionSuccess("Saved.");
  } catch (error) {
    return toSafeFailure(error);
  }
}

/**
 * Switch a collection on or off.
 *
 * Disabling is the admin equivalent of deleting and is always allowed, whatever
 * is attached. Products keep their membership, so nothing is orphaned and
 * turning it back on restores exactly what was there.
 */
export async function setCategoryActiveAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = categoryActivationSchema.safeParse({
      id: text(formData, "id"),
      isActive: formData.get("isActive"),
    });

    if (!parsed.success) {
      return { status: "error", message: "That change could not be applied." };
    }

    const result = await setCategoryActive(parsed.data.id, parsed.data.isActive);

    if (!result.ok) {
      return fromServiceFailure(result);
    }

    revalidateCategoryRoutes();

    return adminActionSuccess(
      result.data.isActive
        ? "Switched on. It is back in the shop navigation."
        : "Switched off. It is hidden from the shop, and its products are not.",
    );
  } catch (error) {
    return toSafeFailure(error);
  }
}

/** Move one collection up or down the running order. */
export async function moveCategoryAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = categoryReorderSchema.safeParse({
      id: text(formData, "id"),
      direction: text(formData, "direction"),
    });

    if (!parsed.success) {
      return { status: "error", message: "That change could not be applied." };
    }

    const result = await moveCategory(parsed.data.id, parsed.data.direction);

    if (!result.ok) {
      return fromServiceFailure(result);
    }

    revalidateCategoryRoutes();

    return adminActionSuccess("Order updated.");
  } catch (error) {
    return toSafeFailure(error);
  }
}
