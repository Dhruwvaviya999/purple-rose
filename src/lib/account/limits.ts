/**
 * Account limits and vocabulary, shared by the server and the browser.
 *
 * In their own module, free of `server-only`, because both sides need them: the
 * service refuses an eleventh address, and the list hides its "Add" button at
 * the same number. A limit the two could disagree about is a button that looks
 * broken on exactly the account where it matters. Same arrangement as
 * `lib/cart/limits.ts`, for the same reason.
 */

/**
 * The most addresses one customer may save.
 *
 * Ten, which is well past a home, a workplace, two parents and a friend, and
 * low enough that nothing can grow the table without limit against an endpoint
 * that needs no payment. It is policy rather than a technical bound, so it lives
 * here and changing it is a deployment, not a migration. Reaching it is reported
 * as a plain sentence and **nothing is ever silently deleted to make room.**
 */
export const MAX_ADDRESSES_PER_CUSTOMER = 10;

/** The longest each field may be, matching the column widths in the schema. */
export const ADDRESS_FIELD_LIMITS = {
  label: 40,
  recipientName: 120,
  addressLine1: 200,
  addressLine2: 200,
  landmark: 120,
  city: 80,
  state: 80,
  postalCode: 16,
} as const;

/** The longest a customer's own display name may be. Matches `User.name`. */
export const MAX_NAME_LENGTH = 120;

/**
 * Labels offered as suggestions, never as a closed set.
 *
 * The field is free text in the database precisely so a customer with two homes
 * can have "Home" and "Home 2". These are what the form offers as a starting
 * point; anything they type instead is equally valid.
 */
export const SUGGESTED_ADDRESS_LABELS = ["Home", "Work", "Other"] as const;

/**
 * Where the shop delivers today, and the only country the form offers.
 *
 * The column stores a country explicitly and the database accepts any ISO
 * alpha-2 code, so widening this list is a change here and a validation rule —
 * not a migration. See `docs/customer-account/README.md`.
 */
export const SUPPORTED_COUNTRIES = [
  { code: "IN", name: "India" },
] as const;

export const DEFAULT_COUNTRY = "IN";

export function countryName(code: string): string {
  return (
    SUPPORTED_COUNTRIES.find((entry) => entry.code === code)?.name ?? code
  );
}
