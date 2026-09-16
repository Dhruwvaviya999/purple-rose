import "server-only";

import type { ZodError } from "zod";
import { revalidatePath } from "next/cache";

import { AdminAuthorizationError } from "@/lib/auth/admin-guard";
import type { AdminFailure } from "@/lib/services/admin/admin-result";
import {
  adminActionFailure,
  type AdminActionState,
  type FieldErrors,
} from "@/features/admin/action-state";

/**
 * The plumbing every admin Server Action shares.
 *
 * Kept out of the `"use server"` files on purpose: every export in one of those
 * becomes a callable endpoint, so a helper living there would be a public
 * entry point with no authorisation of its own.
 *
 * The guard is deliberately **not** here. Each action calls
 * `requireAdminActor()` in its own body, in the open, so the check is visible
 * at the endpoint and `pnpm check:admin` can assert mechanically that every
 * exported action performs it. A `withAdmin(...)` wrapper would read better
 * and audit worse.
 */

/**
 * Nothing internal reaches the browser.
 *
 * An authorisation failure is one flat message, identical for a signed-out
 * caller and a signed-in customer, so the response cannot be used to work out
 * which one you are. Anything else is logged on the server and becomes a
 * generic message: a Prisma error carries table names, column names,
 * constraint names and sometimes the offending value, and none of that belongs
 * in a form.
 */
export function toSafeFailure(
  error: unknown,
  fallback = "That could not be saved. Try again, and if it keeps happening the change was not applied.",
): AdminActionState {
  if (error instanceof AdminAuthorizationError) {
    return adminActionFailure("You do not have permission to do that.");
  }

  // Server-side only. The message is never returned.
  console.error(
    `Admin action failed: ${error instanceof Error ? error.message : String(error)}`,
  );

  return adminActionFailure(fallback);
}

/** A service refusal, as the form should render it. */
export function fromServiceFailure(
  failure: AdminFailure,
  values?: Record<string, string>,
): AdminActionState {
  return adminActionFailure(failure.message, {
    fieldErrors: failure.field ? { [failure.field]: failure.message } : undefined,
    values,
  });
}

/**
 * The first problem with each field, keyed by field name.
 *
 * First rather than all, because a field can only usefully show one message,
 * and the first is the one closest to what the admin typed.
 */
export function fieldErrorsFrom(error: ZodError): FieldErrors {
  const errors: FieldErrors = {};

  for (const issue of error.issues) {
    const field = issue.path.join(".") || "form";

    if (!(field in errors)) {
      errors[field] = issue.message;
    }
  }

  return errors;
}

/**
 * Every text value the admin submitted, echoed back so a long form survives.
 *
 * A repeated field — every ticked collection, say — is joined with commas
 * rather than reduced to its last entry, so re-rendering after a validation
 * failure restores the whole selection instead of one box. The values it holds
 * are ids and plain text, neither of which contains a comma.
 */
export function valuesFrom(formData: FormData): Record<string, string> {
  const values: Record<string, string[]> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value !== "string") {
      continue;
    }

    (values[key] ??= []).push(value);
  }

  return Object.fromEntries(
    Object.entries(values).map(([key, list]) => [key, list.join(",")]),
  );
}

/** A single string field, as a string. `FormData` can also hand back a File. */
export function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** A repeated field, such as every ticked collection. */
export function textList(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .filter((value): value is string => typeof value === "string");
}

/* ------------------------------------------------------------------ *
 * Revalidation
 * ------------------------------------------------------------------ */

/**
 * What to refresh after a catalogue change, and why it is this narrow.
 *
 * Every storefront route renders per request — see
 * `docs/catalog/README.md` — so nothing is holding a stale page on the server.
 * What `revalidatePath` clears here is the **client Router Cache**: the RSC
 * payloads a browser keeps for routes it has already visited. Without it, an
 * administrator who edits a product and clicks "View store" can be shown the
 * copy the browser cached a minute ago and reasonably conclude the save failed.
 *
 * So these calls are aimed at the routes that actually display what changed,
 * not fired at the whole application after every keystroke. Revalidating "/"
 * on a stock edit would throw away a cached home page to no purpose.
 */
export function revalidateProductRoutes(slug?: string): void {
  revalidatePath("/admin/products");
  revalidatePath("/shop");
  revalidatePath("/sitemap.xml");

  if (slug) {
    revalidatePath(`/shop/${slug}`);
  }
}

/** Also the home page, whose rails are driven by merchandising flags. */
export function revalidateMerchandising(): void {
  revalidatePath("/");
}

/**
 * Categories reach further: they are in the header, the mobile drawer, the
 * footer, the home tiles and the filter panel, which is every page of the
 * storefront.
 */
export function revalidateCategoryRoutes(): void {
  revalidatePath("/admin/categories");
  revalidatePath("/", "layout");
  revalidatePath("/sitemap.xml");
}

/** A single admin product screen, after a variant or image change. */
export function revalidateAdminProduct(id: string): void {
  revalidatePath(`/admin/products/${id}`);
  revalidatePath("/admin/products");
  revalidatePath("/admin");
}
