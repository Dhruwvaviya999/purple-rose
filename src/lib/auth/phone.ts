import parsePhoneNumber, { type CountryCode } from "libphonenumber-js";

/**
 * Phone number normalisation.
 *
 * Every number is reduced to one canonical E.164 string before it reaches the
 * database. Without this, "+91 98765 43210", "09876543210" and "9876543210"
 * would be three different accounts for one person, and the unique constraint
 * on `User.phoneNumber` would not help.
 *
 * `libphonenumber-js` does the work because the rules are genuinely per
 * country: knowing that a leading zero is a trunk prefix to be dropped in
 * India, but significant elsewhere, is not something a regular expression can
 * decide. The service stays international; only the fallback region is
 * regional, and it applies solely when the input carries no country code.
 *
 * This module is deliberately free of `server-only`. It holds no secret and
 * touches no database, and the seed script needs the very same normalisation
 * so that a seeded administrator matches the account their sign-in produces.
 */

/**
 * Region assumed when an input carries no country code. India, because that is
 * the launch market. Everything else here is region-agnostic.
 */
const defaultPhoneRegion = (
  process.env.AUTH_DEFAULT_COUNTRY?.trim() || "IN"
).toUpperCase();

export type NormalisedPhone = {
  /** Canonical E.164, for example "+919876543210". Safe to store. */
  e164: string;
  /** Obscured form for display, for example "+91 ***** 43210". */
  masked: string;
};

/** Show enough for someone to recognise their own number, and no more. */
function mask(e164: string): string {
  const visible = 4;

  if (e164.length <= visible + 3) {
    return e164;
  }

  const tail = e164.slice(-visible);
  const head = e164.slice(0, e164.length - visible);
  return `${head.slice(0, 3)}${"•".repeat(Math.max(head.length - 3, 0))} ${tail}`;
}

/**
 * Parse and normalise. Returns null when the number is not a possible real
 * number, which the caller turns into a generic validation message.
 */
export function normalisePhoneNumber(input: string): NormalisedPhone | null {
  const trimmed = input.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = parsePhoneNumber(
    trimmed,
    defaultPhoneRegion as CountryCode,
  );

  if (!parsed || !parsed.isValid()) {
    return null;
  }

  const e164 = parsed.number;

  // `User.phoneNumber` is VARCHAR(16): "+" plus at most 15 digits, which is
  // the E.164 maximum. A longer value would be truncated or rejected by the
  // database, so it is refused here where the error is still explainable.
  if (e164.length > 16) {
    return null;
  }

  return { e164, masked: mask(e164) };
}
