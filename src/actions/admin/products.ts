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
  revalidateAdminProduct,
  revalidateMerchandising,
  revalidateProductRoutes,
  text,
  textList,
  toSafeFailure,
  valuesFrom,
} from "@/lib/admin/action-support";
import { requireAdminActor } from "@/lib/auth/admin-guard";
import {
  createProduct,
  setProductStatus,
  updateProduct,
} from "@/lib/services/admin/product-admin-service";
import {
  createProductSchema,
  productStatusChangeSchema,
  updateProductSchema,
} from "@/lib/validations/catalog-admin";
import { ProductStatus } from "@/generated/prisma/enums";

/**
 * Product mutations.
 *
 * Server Actions rather than Route Handlers, for the reason Phase 3 chose them
 * for sign-in: Next compares the request `Origin` against the `Host` on every
 * action and rejects a mismatch, which is CSRF protection that would otherwise
 * have to be written and maintained here. Action ids are encrypted at build
 * time, so there is no stable public URL to script against either.
 *
 * Every exported function in this file is a callable endpoint, which is why
 * each one starts the same way:
 *
 *   1. `requireAdminActor()` — refuse anyone who is not an administrator
 *   2. parse and validate the form from scratch
 *   3. call the service
 *   4. revalidate what actually changed
 *   5. return a serialisable result
 *
 * The guard is first and it is written out in each action rather than hidden
 * in a wrapper, so it is visible at the endpoint and `pnpm check:admin` can
 * assert mechanically that no action is missing it. That a form is only
 * rendered on a protected page is not a boundary: the request can be sent
 * without ever loading it.
 */

/** Every collection the form ticked, plus the primary one. */
function categoryIdsFrom(formData: FormData): string[] {
  return textList(formData, "additionalCategoryIds");
}

function productInputFrom(formData: FormData) {
  return {
    name: text(formData, "name"),
    slug: text(formData, "slug"),
    articleNumber: text(formData, "articleNumber"),
    shortDescription: text(formData, "shortDescription"),
    description: text(formData, "description"),
    careInstructions: text(formData, "careInstructions"),
    primaryCategoryId: text(formData, "primaryCategoryId"),
    additionalCategoryIds: categoryIdsFrom(formData),
    fabric: text(formData, "fabric"),
    pattern: text(formData, "pattern"),
    fit: text(formData, "fit"),
    occasion: text(formData, "occasion"),
    price: text(formData, "price"),
    compareAtPrice: text(formData, "compareAtPrice"),
    featured: formData.get("featured"),
    newArrival: formData.get("newArrival"),
    bestSeller: formData.get("bestSeller"),
    seasonal: formData.get("seasonal"),
    status: text(formData, "status"),
    seoTitle: text(formData, "seoTitle"),
    seoDescription: text(formData, "seoDescription"),
  };
}

/**
 * Create a product.
 *
 * On success it redirects to the edit screen, which is where variants and
 * photographs are added. `redirect` throws a control-flow signal that Next
 * handles, so it is called after the try block rather than inside it — caught
 * by the error mapper it would become "that could not be saved" on a save that
 * worked.
 */
export async function createProductAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  let createdId: string;

  try {
    await requireAdminActor();

    const parsed = createProductSchema.safeParse(productInputFrom(formData));

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields.",
        fieldErrors: fieldErrorsFrom(parsed.error),
        values: valuesFrom(formData),
      };
    }

    const result = await createProduct(parsed.data);

    if (!result.ok) {
      return fromServiceFailure(result, valuesFrom(formData));
    }

    revalidateProductRoutes(parsed.data.slug);
    revalidateMerchandising();
    revalidateAdminProduct(result.data.id);

    createdId = result.data.id;
  } catch (error) {
    return toSafeFailure(error);
  }

  redirect(`/admin/products/${createdId}?created=1` as Route);
}

export async function updateProductAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = updateProductSchema.safeParse({
      ...productInputFrom(formData),
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

    const result = await updateProduct(parsed.data);

    if (!result.ok) {
      return fromServiceFailure(result, valuesFrom(formData));
    }

    revalidateProductRoutes(parsed.data.slug);
    revalidateMerchandising();
    revalidateAdminProduct(parsed.data.id);

    return adminActionSuccess("Saved.");
  } catch (error) {
    return toSafeFailure(error);
  }
}

/**
 * Publish, unpublish or archive.
 *
 * One action for all three, because they are one field. The publication model
 * — when `publishedAt` is stamped and when it is preserved — lives in the
 * service, so the rule exists once rather than three times.
 */
export async function setProductStatusAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = productStatusChangeSchema.safeParse({
      id: text(formData, "id"),
      status: text(formData, "status"),
    });

    if (!parsed.success) {
      return { status: "error", message: "That change could not be applied." };
    }

    const result = await setProductStatus(parsed.data.id, parsed.data.status);

    if (!result.ok) {
      return fromServiceFailure(result);
    }

    revalidateProductRoutes(result.data.slug);
    revalidateMerchandising();
    revalidateAdminProduct(result.data.id);

    return adminActionSuccess(statusMessage(result.data.status));
  } catch (error) {
    return toSafeFailure(error);
  }
}

function statusMessage(status: ProductStatus): string {
  switch (status) {
    case ProductStatus.ACTIVE:
      return "Published. It is live in the shop now.";
    case ProductStatus.DRAFT:
      return "Unpublished. It is hidden from the shop and kept as a draft.";
    case ProductStatus.ARCHIVED:
      return "Archived. It is hidden from the shop and out of the sitemap.";
  }
}
