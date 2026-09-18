import { z } from "zod";

import {
  ADDRESS_FIELD_LIMITS,
  DEFAULT_COUNTRY,
  MAX_NAME_LENGTH,
  SUPPORTED_COUNTRIES,
} from "@/lib/account/limits";

/**
 * Input schemas for the account area.
 *
 * Every message here is written for the person filling the form, because these
 * are what the fields display. No Zod default ever reaches a customer: a field
 * with no message would render "Invalid input", which tells somebody nothing
 * about what to type instead.
 *
 * What is deliberately absent, as everywhere else in this application:
 *
 * - **`userId`.** Who is saving the address is decided by the session. A field
 *   for it would be an authorisation input the caller controls.
 * - **`id` as authority.** An address id is accepted so the form can say which
 *   row it is editing, and it is never sufficient on its own — every statement
 *   that takes one is scoped to the signed-in customer's rows as well.
 * - **`role` and `phoneNumber` on the profile.** The account's phone number is
 *   its identity and is proven by a one-time code; changing it is a verification
 *   flow, not a text field. The role is set by the server and never by a form.
 *
 * Free of `server-only`, like the other validation modules, so the form can
 * reuse the shapes for inline feedback. The boundary is the Server Action,
 * which parses from scratch.
 */

/**
 * Text a person typed, trimmed, and required to still be there afterwards.
 *
 * Trimming first is what makes "   " an empty field rather than a three
 * character city. The database carries the same rule as a CHECK, so a write
 * that somehow skipped this is refused rather than stored.
 */
function requiredText(max: number, message: string) {
  return z
    .string()
    .trim()
    .min(1, message)
    .max(max, `Keep this under ${max} characters.`);
}

/**
 * Optional text: absent, or meaningful. Never an empty string.
 *
 * An empty input submits `""`, and storing that would make "has a landmark"
 * true for a row with no landmark. It is normalised to `undefined` here, the
 * service writes `null`, and a CHECK constraint keeps it that way.
 */
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .transform((value) => (value.length === 0 ? undefined : value))
    .optional();
}

export const addressIdSchema = z.uuid();

/**
 * A postal code, checked against the country it belongs to.
 *
 * India's is six digits and may not begin with a zero, which is the real rule
 * rather than "six digits". Anywhere else is accepted as a loose alphanumeric
 * code, because inventing a format for a country the shop does not deliver to
 * would refuse valid addresses on the day it starts.
 *
 * The rule lives here rather than in the database on purpose: the column is
 * wide enough for any country, so adding a market is a change to this function.
 */
function postalCodeIssue(value: string, country: string): string | null {
  if (country === "IN") {
    return /^[1-9][0-9]{5}$/.test(value)
      ? null
      : "Enter a valid 6-digit PIN code.";
  }

  return /^[A-Za-z0-9][A-Za-z0-9 -]{1,14}$/.test(value)
    ? null
    : "Enter a valid postal code.";
}

const countryCodes = SUPPORTED_COUNTRIES.map((entry) => entry.code);

/**
 * Everything an address form submits.
 *
 * The phone number is only bounded and sanity-checked here; the authoritative
 * check is `normalisePhoneNumber` in `lib/auth/phone.ts`, which knows the
 * per-country rules this schema cannot express. That is the same division the
 * sign-in form uses, and reusing it is what keeps one canonical phone format in
 * the database rather than two.
 */
export const addressInputSchema = z
  .object({
    label: requiredText(
      ADDRESS_FIELD_LIMITS.label,
      "Give this address a name, like Home or Work.",
    ),
    recipientName: requiredText(
      ADDRESS_FIELD_LIMITS.recipientName,
      "Enter the name of the person receiving the delivery.",
    ),
    phoneNumber: z
      .string()
      .trim()
      .min(6, "Enter a valid phone number, including the country code.")
      .max(24, "Enter a valid phone number, including the country code.")
      .regex(
        /^[+\d][\d\s\-().]*$/,
        "Enter a valid phone number, including the country code.",
      ),
    addressLine1: requiredText(
      ADDRESS_FIELD_LIMITS.addressLine1,
      "Enter the flat, house or building and the street.",
    ),
    addressLine2: optionalText(ADDRESS_FIELD_LIMITS.addressLine2),
    landmark: optionalText(ADDRESS_FIELD_LIMITS.landmark),
    city: requiredText(ADDRESS_FIELD_LIMITS.city, "Enter the city or town."),
    state: requiredText(ADDRESS_FIELD_LIMITS.state, "Enter the state."),
    postalCode: requiredText(
      ADDRESS_FIELD_LIMITS.postalCode,
      "Enter the PIN code.",
    ),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .default(DEFAULT_COUNTRY)
      .refine(
        (value) => countryCodes.includes(value as (typeof countryCodes)[number]),
        "We do not deliver to that country yet.",
      ),
    isDefault: z.boolean().default(false),
  })
  // Cross-field, so it runs once both the code and its country are known.
  .superRefine((value, ctx) => {
    const issue = postalCodeIssue(value.postalCode, value.country);

    if (issue) {
      ctx.addIssue({
        code: "custom",
        path: ["postalCode"],
        message: issue,
      });
    }
  });

export type AddressInput = z.infer<typeof addressInputSchema>;

/**
 * The customer's own display name.
 *
 * Optional: an account created by a one-time code has no name until somebody
 * types one, and clearing it back to nothing is a legitimate thing to want.
 * That is why this allows an empty string and the service stores `null` for it,
 * rather than refusing and leaving somebody stuck with a name they mistyped.
 */
export const profileInputSchema = z.object({
  name: z
    .string()
    .trim()
    .max(MAX_NAME_LENGTH, `Keep your name under ${MAX_NAME_LENGTH} characters.`)
    .transform((value) => (value.length === 0 ? null : value)),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;
