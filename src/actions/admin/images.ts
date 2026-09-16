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
  toSafeFailure,
  valuesFrom,
} from "@/lib/admin/action-support";
import { requireAdminActor } from "@/lib/auth/admin-guard";
import {
  createProductImage,
  deleteProductImage,
  moveProductImage,
  updateProductImage,
} from "@/lib/services/admin/image-admin-service";
import {
  createImageSchema,
  imageIdSchema,
  imageReorderSchema,
  updateImageSchema,
} from "@/lib/validations/catalog-admin";
import { prisma } from "@/lib/db/client";

/**
 * Photography mutations.
 *
 * URLs only. There is no upload, no Cloudinary, no S3 and no Vercel Blob in
 * this phase: an administrator supplies an address, its alt text, which colour
 * it is of and where it sits in the running order.
 *
 * The URL is validated against the configured image hosts in
 * `lib/validations/catalog-admin.ts`, which is the same list `next.config.ts`
 * reads. That pairing is load-bearing: `next/image` throws at render time for
 * a host it is not configured for, so without the check a well-formed URL
 * would save cleanly and break the product page. It also means the only
 * accepted scheme is https, which refuses `javascript:` and `data:` by
 * allowing one rather than by listing what to block.
 */

async function productRoutesFor(productId: string): Promise<void> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  });

  revalidateAdminProduct(productId);
  revalidateProductRoutes(product?.slug);
}

function imageInputFrom(formData: FormData) {
  return {
    url: text(formData, "url"),
    alt: text(formData, "alt"),
    colorId: text(formData, "colorId"),
    isPrimary: formData.get("isPrimary"),
  };
}

export async function createImageAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = createImageSchema.safeParse({
      ...imageInputFrom(formData),
      productId: text(formData, "productId"),
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields.",
        fieldErrors: fieldErrorsFrom(parsed.error),
        values: valuesFrom(formData),
      };
    }

    const result = await createProductImage(parsed.data);

    if (!result.ok) {
      return fromServiceFailure(result, valuesFrom(formData));
    }

    await productRoutesFor(parsed.data.productId);

    return adminActionSuccess("Photograph added.");
  } catch (error) {
    return toSafeFailure(error);
  }
}

export async function updateImageAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = updateImageSchema.safeParse({
      ...imageInputFrom(formData),
      id: text(formData, "id"),
    });

    if (!parsed.success) {
      return {
        status: "error",
        message: "Check the highlighted fields.",
        fieldErrors: fieldErrorsFrom(parsed.error),
        values: valuesFrom(formData),
      };
    }

    const result = await updateProductImage(parsed.data);

    if (!result.ok) {
      return fromServiceFailure(result, valuesFrom(formData));
    }

    await productRoutesFor(result.data.productId);

    return adminActionSuccess("Photograph saved.");
  } catch (error) {
    return toSafeFailure(error);
  }
}

/**
 * Remove a photograph.
 *
 * The one genuine delete in the admin catalogue, and it is deliberate: an
 * image is content, nothing will ever reference it, and a "deleted" flag would
 * mean filtering it out of every gallery query forever for no benefit. The
 * screen asks for confirmation first and says it cannot be undone.
 */
export async function deleteImageAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = imageIdSchema.safeParse({ id: text(formData, "id") });

    if (!parsed.success) {
      return { status: "error", message: "That image could not be removed." };
    }

    const result = await deleteProductImage(parsed.data.id);

    if (!result.ok) {
      return fromServiceFailure(result);
    }

    await productRoutesFor(result.data.productId);

    return adminActionSuccess("Photograph removed.");
  } catch (error) {
    return toSafeFailure(error);
  }
}

/** Move a photograph one place up or down the gallery. */
export async function moveImageAction(
  _previous: AdminActionState,
  formData: FormData,
): Promise<AdminActionState> {
  try {
    await requireAdminActor();

    const parsed = imageReorderSchema.safeParse({
      id: text(formData, "id"),
      direction: text(formData, "direction"),
    });

    if (!parsed.success) {
      return { status: "error", message: "That change could not be applied." };
    }

    const result = await moveProductImage(parsed.data.id, parsed.data.direction);

    if (!result.ok) {
      return fromServiceFailure(result);
    }

    await productRoutesFor(result.data.productId);

    return adminActionSuccess("Order updated.");
  } catch (error) {
    return toSafeFailure(error);
  }
}
