/**
 * What every admin Server Action gives back.
 *
 * It lives in an ordinary module rather than beside the actions because a
 * `"use server"` file may only export async functions — every export there
 * becomes a callable endpoint, so a shared type or constant is rejected.
 *
 * The shape is deliberately small and serialisable:
 *
 * - `ok` says whether the database actually changed. Nothing reports success
 *   before the write has committed.
 * - `message` is written for a person. It never carries a Prisma error, a SQL
 *   string, a constraint name or a stack. Those go to the server log.
 * - `fieldErrors` puts a message next to the field that caused it, which is
 *   the difference between "Category could not be updated" and knowing the
 *   slug is taken.
 * - `values` is what the admin typed, echoed back, so a failed submission
 *   never empties a long form.
 */

/** Field name to the first problem with it. */
export type FieldErrors = Record<string, string>;

export type AdminActionState = {
  status: "idle" | "success" | "error";
  message?: string;
  fieldErrors?: FieldErrors;
  /** Raw submitted values, re-rendered after a failure. */
  values?: Record<string, string>;
  /** Set on a successful create, so the caller can navigate to the new row. */
  createdId?: string;
};

export const idleAdminAction: AdminActionState = { status: "idle" };

/** A refusal with nothing behind it, used for anything unexpected. */
export function adminActionFailure(
  message: string,
  extra?: Omit<AdminActionState, "status" | "message">,
): AdminActionState {
  return { status: "error", message, ...extra };
}

export function adminActionSuccess(
  message: string,
  extra?: Omit<AdminActionState, "status" | "message">,
): AdminActionState {
  return { status: "success", message, ...extra };
}
