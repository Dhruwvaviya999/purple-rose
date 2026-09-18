/**
 * What every account Server Action gives back.
 *
 * In an ordinary module rather than beside the actions, because a `"use server"`
 * file may only export async functions — every export there becomes a callable
 * endpoint. Same reason the admin, wishlist and cart equivalents exist.
 *
 * The shape carries field errors as well as a message, which the earlier
 * features did not need: a bag has one control and an address form has eleven,
 * and "that could not be saved" beside a form is useless when the problem is one
 * field. The errors are keyed by field name so each renders next to its own
 * input rather than in a list at the top.
 *
 * `values` is what the customer typed, echoed back. **A validation failure must
 * never empty a form** — retyping an address because a PIN code was one digit
 * short is how somebody gives up.
 */

/** Field name to the first problem with it. */
export type AccountFieldErrors = Record<string, string>;

export type AccountActionState = {
  status: "idle" | "success" | "error";
  /** Written for a person. Never a Prisma error, a constraint or a stack. */
  message?: string;
  fieldErrors?: AccountFieldErrors;
  /** Raw submitted values, re-rendered after a failure. */
  values?: Record<string, string>;
};

export const idleAccountAction: AccountActionState = { status: "idle" };

export function accountSuccess(message: string): AccountActionState {
  return { status: "success", message };
}

export function accountFailure(
  message: string,
  extra?: Omit<AccountActionState, "status" | "message">,
): AccountActionState {
  return { status: "error", message, ...extra };
}

/** Why a mutation was refused, as far as the browser is told. */
export type AccountFailureCode =
  | "SIGNED_OUT"
  | "INVALID_INPUT"
  | "NOT_FOUND"
  | "LIMIT_REACHED"
  | "UNEXPECTED";

const FAILURE_MESSAGES: Record<AccountFailureCode, string> = {
  SIGNED_OUT: "Sign in to manage your account.",
  INVALID_INPUT: "Check the highlighted fields and try again.",
  // The same sentence whether the address never existed or belongs to somebody
  // else. Telling those two apart would turn this into a way of asking whether
  // a given id is real.
  NOT_FOUND: "That address could not be found.",
  LIMIT_REACHED:
    "You have saved as many addresses as an account can hold. Remove one to add another.",
  UNEXPECTED: "Something went wrong. Please try again.",
};

export function accountFailureMessage(code: AccountFailureCode): string {
  return FAILURE_MESSAGES[code];
}

export const ADDRESS_SAVED_MESSAGE = "Address saved.";
export const ADDRESS_UPDATED_MESSAGE = "Address updated.";
export const ADDRESS_DELETED_MESSAGE = "Address removed.";
export const DEFAULT_CHANGED_MESSAGE = "Default delivery address updated.";
export const PROFILE_SAVED_MESSAGE = "Your details are saved.";
