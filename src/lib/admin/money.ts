/**
 * Turning what an administrator types into what the database stores.
 *
 * The catalogue stores money as an integer number of paise, and always will:
 * `₹1,299` is `129900`. An administrator should not have to think in paise, so
 * the form takes rupees and this converts.
 *
 * **The conversion never goes through a float.** `Number("12.10") * 100` is
 * `1209.9999999999998`, and rounding that back is a coin flip on the last
 * paisa. Instead the string is split on the decimal point and the two halves
 * are combined as integers, which is exact for every input by construction.
 *
 * There is no `parseFloat` in this file, and there should not be one anywhere
 * that money is handled.
 */

/**
 * The largest amount accepted, in paise: ₹10,00,000.
 *
 * Far above anything Purple Rose sells, and far below the 32-bit ceiling of
 * the `Int` column, so an overflow cannot be reached by typing.
 */
export const MAX_PRICE_PAISE = 100_000_000;

export type MoneyParseError =
  | "empty"
  | "not-a-number"
  | "too-many-decimals"
  | "negative"
  | "too-large";

export type MoneyParseResult =
  | { ok: true; paise: number }
  | { ok: false; error: MoneyParseError };

/** Accepts `1299`, `1299.50`, `1,299`, ` 1299.5 `. Rejects everything else. */
const RUPEES = /^(\d{1,3}(?:,\d{2,3})*|\d+)(?:\.(\d{1,2}))?$/;

/**
 * Rupees as typed, to paise as stored.
 *
 * Grouping commas are allowed because an administrator copying a price from a
 * spreadsheet will paste them, and rejecting `1,299` would be pedantry. They
 * are stripped rather than interpreted, so `1,2,9,9` and `1299` both mean the
 * same number; the grouping is not validated, only the digits are.
 */
export function rupeesToPaise(input: string): MoneyParseResult {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { ok: false, error: "empty" };
  }

  if (trimmed.startsWith("-")) {
    return { ok: false, error: "negative" };
  }

  const match = RUPEES.exec(trimmed);

  if (!match) {
    // Distinguish "1299.999" from "twelve" so the message can be specific.
    return /^\d[\d,]*\.\d{3,}$/.test(trimmed)
      ? { ok: false, error: "too-many-decimals" }
      : { ok: false, error: "not-a-number" };
  }

  const whole = (match[1] ?? "0").replaceAll(",", "");
  // "5" means fifty paise, not five. Padded, never multiplied.
  const fraction = (match[2] ?? "").padEnd(2, "0");

  const paise = Number(whole) * 100 + Number(fraction);

  if (!Number.isSafeInteger(paise)) {
    return { ok: false, error: "too-large" };
  }

  if (paise > MAX_PRICE_PAISE) {
    return { ok: false, error: "too-large" };
  }

  return { ok: true, paise };
}

/**
 * Paise back to the value a number input should hold.
 *
 * Whole rupees come back without a decimal part, because `2490` is what an
 * administrator expects to see in the field rather than `2490.00`. Integer
 * division and remainder, so nothing is ever reconstructed from a float.
 */
export function paiseToRupeeInput(paise: number): string {
  const whole = Math.trunc(paise / 100);
  const fraction = paise % 100;

  if (fraction === 0) {
    return String(whole);
  }

  return `${whole}.${String(fraction).padStart(2, "0")}`;
}

/** What went wrong, in words a person can act on. */
export function moneyErrorMessage(error: MoneyParseError, field = "price"): string {
  switch (error) {
    case "empty":
      return `Enter a ${field}.`;
    case "not-a-number":
      return `Enter the ${field} in rupees, for example 1299 or 1299.50.`;
    case "too-many-decimals":
      return "A price can have at most two decimal places.";
    case "negative":
      return `A ${field} cannot be negative.`;
    case "too-large":
      return `That ${field} is larger than this shop supports.`;
  }
}
