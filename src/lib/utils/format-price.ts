import { siteConfig } from "@/config/site";

/**
 * Render a price for display.
 *
 * Amounts travel through the application as integers in the currency minor
 * unit (paise for INR). Money is never a float: 0.1 + 0.2 is not 0.3 in binary
 * floating point, and a store that adds up line items cannot afford that.
 * Conversion to a decimal happens here, once, at the presentation boundary.
 *
 * Currency and locale come from `siteConfig`, so no component hardcodes a
 * symbol and changing market is a configuration change.
 */
export function formatPrice(amountInMinorUnits: number): string {
  return new Intl.NumberFormat(siteConfig.language, {
    style: "currency",
    currency: siteConfig.currency.code,
    // Indian retail prices are whole rupees; trailing ".00" is noise.
    maximumFractionDigits: 0,
  }).format(amountInMinorUnits / 100);
}

/**
 * Whole-percent saving, rounded down so a discount is never overstated.
 * Returns null when there is nothing to claim.
 */
export function discountPercent(
  price: number,
  compareAtPrice: number | undefined,
): number | null {
  if (!compareAtPrice || compareAtPrice <= price) {
    return null;
  }

  return Math.floor(((compareAtPrice - price) / compareAtPrice) * 100);
}
