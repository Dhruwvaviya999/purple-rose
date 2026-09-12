import { env } from "@/lib/env";

/**
 * Single source of truth for brand and application-level constants.
 * Nothing in `components/` or `app/` should hardcode these values.
 */
export const siteConfig = {
  name: "Purple Rose",
  legalName: "Purple Rose",
  tagline: "Considered womenswear for everyday",
  description:
    "Purple Rose makes considered womenswear: easy silhouettes, honest fabrics and prints made to be worn on repeat, season after season.",
  url: env.appUrl,
  locale: "en_IN",
  /** BCP 47 tag used for `<html lang>` and number/date formatting. */
  language: "en-IN",
  keywords: [
    "Purple Rose",
    "womenswear",
    "women's fashion",
    "women's clothing",
    "minimal fashion",
  ],
  currency: {
    code: "INR",
    symbol: "₹",
  },
  contact: {
    email: "hello@purplerose.example",
  },
} as const;
