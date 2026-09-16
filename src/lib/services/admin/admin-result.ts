import "server-only";

/**
 * What an admin service returns instead of throwing.
 *
 * Expected failures — a slug already taken, a row someone else just changed —
 * are results, not exceptions. They are part of what the operation means, the
 * form has to render them next to a field, and turning them into thrown errors
 * would make every caller a try/catch.
 *
 * Unexpected failures stay exceptions and are caught once, at the action
 * boundary, where they become a flat message. **No Prisma error, SQL string,
 * constraint name or stack ever crosses this boundary.**
 */

export type AdminErrorCode =
  | "not-found"
  | "stale"
  | "slug-taken"
  | "article-taken"
  | "sku-taken"
  | "variant-exists"
  | "invalid-reference"
  | "in-use";

export type AdminFailure = {
  ok: false;
  code: AdminErrorCode;
  /** The form field to attach the message to, when there is one. */
  field?: string;
  /** Written for a person, safe to render. */
  message: string;
};

export type AdminResult<T> = { ok: true; data: T } | AdminFailure;

export function ok<T>(data: T): { ok: true; data: T } {
  return { ok: true, data };
}

export function fail(
  code: AdminErrorCode,
  message: string,
  field?: string,
): AdminFailure {
  return { ok: false, code, message, field };
}

/**
 * The message shown when two administrators edit the same row.
 *
 * Phrased as an instruction rather than an apology, because the fix is
 * specific and the admin can carry it out immediately.
 */
export const STALE_MESSAGE =
  "Someone else changed this since you opened it. Reload the page to see their version, then apply your changes again.";
