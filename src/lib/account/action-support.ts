import "server-only";

import type { ZodError } from "zod";
import { revalidatePath } from "next/cache";

import {
  accountFailure,
  accountFailureMessage,
  type AccountActionState,
  type AccountFailureCode,
  type AccountFieldErrors,
} from "@/features/account/account-state";
import type { AddressErrorCode } from "@/lib/services/address-service";

/**
 * Plumbing the account Server Actions share.
 *
 * Kept out of the `"use server"` files on purpose: every export in one of those
 * becomes a callable endpoint, so a helper living there would be a public entry
 * point with no authorisation of its own. Same rule as the admin, wishlist and
 * cart equivalents.
 */

/**
 * The first problem with each field, keyed by field name.
 *
 * First rather than all, because a field can usefully show one message and the
 * first is the one closest to what the customer typed.
 */
export function fieldErrorsFrom(error: ZodError): AccountFieldErrors {
  const errors: AccountFieldErrors = {};

  for (const issue of error.issues) {
    const field = issue.path.join(".") || "form";

    if (!(field in errors)) {
      errors[field] = issue.message;
    }
  }

  return errors;
}

/**
 * Every text value submitted, echoed back so a long form survives a refusal.
 *
 * An address form has eleven fields. Losing them because a PIN code was one
 * digit short is how somebody abandons a checkout.
 */
export function valuesFrom(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};

  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      values[key] = value;
    }
  }

  return values;
}

/** A single string field, as a string. `FormData` can also hand back a File. */
export function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** A tick box: present means ticked, whatever value it carries. */
export function checked(formData: FormData, name: string): boolean {
  return formData.get(name) !== null;
}

export function failureFor(
  code: AccountFailureCode,
  extra?: Omit<AccountActionState, "status" | "message">,
): AccountActionState {
  return accountFailure(accountFailureMessage(code), extra);
}

/** A service refusal, as the browser should hear it. */
const SERVICE_CODES: Record<AddressErrorCode, AccountFailureCode> = {
  "not-found": "NOT_FOUND",
  "limit-reached": "LIMIT_REACHED",
  "nothing-to-delete": "NOT_FOUND",
};

export function fromServiceFailure(
  code: AddressErrorCode,
  extra?: Omit<AccountActionState, "status" | "message">,
): AccountActionState {
  return failureFor(SERVICE_CODES[code], extra);
}

/**
 * Anything unexpected, made safe.
 *
 * The reason stays on the server. A Prisma error carries table names, column
 * names, constraint names and sometimes the offending value — and here the
 * offending value is somebody's home address.
 */
export function toUnexpectedFailure(
  error: unknown,
  extra?: Omit<AccountActionState, "status" | "message">,
): AccountActionState {
  console.error(
    `Account action failed: ${error instanceof Error ? error.message : String(error)}`,
  );

  return failureFor("UNEXPECTED", extra);
}

/**
 * What to refresh after an account change, and why it is this narrow.
 *
 * Every account route renders per request, so nothing stale is held on the
 * server. What `revalidatePath` clears is the **client Router Cache**: the RSC
 * payloads the browser keeps for routes it has already visited. Without it, a
 * customer who edits an address and navigates back to the list is shown the list
 * the browser cached a minute ago and reasonably concludes the save failed.
 *
 * Only the account area. Nothing about a saved address changes a product page,
 * a bag or a wishlist, and throwing away cached catalogue payloads because
 * somebody corrected a PIN code would be paying for nothing.
 */
export function revalidateAccountRoutes(): void {
  revalidatePath("/account");
  revalidatePath("/account/addresses");
}

/**
 * Also the storefront shell, for the one thing that escapes the account area:
 * the header greets a customer by name once they have set one.
 */
export function revalidateProfileRoutes(): void {
  revalidateAccountRoutes();
  revalidatePath("/account/profile");
  revalidatePath("/", "layout");
}
