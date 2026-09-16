import { Fabric, Fit, Occasion, Pattern } from "@/generated/prisma/enums";

/**
 * The attribute vocabularies, and how they cross the three boundaries they
 * have to cross: the database, the URL and the page.
 *
 * Fabric, pattern, fit and occasion are Prisma enums rather than lookup
 * tables. They are small, fixed, editorial vocabularies that the database
 * should reject typos in, and treating them as enums means a facet cannot be
 * split in two by a second spelling of "Cotton". Categories, sizes and colours
 * are rows instead, because those genuinely change without a deployment.
 *
 * Each vocabulary has three forms:
 *
 * | Form   | Example          | Where it lives                       |
 * | ------ | ---------------- | ------------------------------------ |
 * | value  | `COTTON_POPLIN`  | the database column                  |
 * | token  | `cotton-poplin`  | the URL, and the filter checkbox      |
 * | label  | `Cotton poplin`  | what a shopper reads                  |
 *
 * The token is derived from the value, so the two cannot drift. The label is
 * written out per value: deriving it from the value gets "A line" where the
 * garment trade says "A-line", and the explicit map makes TypeScript demand a
 * label the moment a new enum value is added.
 *
 * This module imports only the generated enum constants, which are plain
 * objects with no client attached, so it is safe on either side of the
 * server boundary.
 */

/** `COTTON_POPLIN` to `cotton-poplin`. */
export function toToken(value: string): string {
  return value.toLowerCase().replaceAll("_", "-");
}

/** One attribute vocabulary, as the filter panel and the services need it. */
export type Vocabulary<TValue extends string> = {
  /** The URL parameter this group writes to. */
  readonly param: string;
  /** The fieldset legend in the filter panel. */
  readonly label: string;
  /** Every value, in the order the filter group lists them. */
  readonly values: readonly TValue[];
  readonly labels: Readonly<Record<TValue, string>>;
};

const fabricLabels: Record<Fabric, string> = {
  COTTON: "Cotton",
  COTTON_POPLIN: "Cotton poplin",
  LINEN: "Linen",
  LINEN_BLEND: "Linen blend",
  RAYON: "Rayon",
  GEORGETTE: "Georgette",
  SATIN: "Satin",
  CHIFFON: "Chiffon",
  KNIT: "Knit",
  MODAL: "Modal",
};

const patternLabels: Record<Pattern, string> = {
  SOLID: "Solid",
  FLORAL: "Floral",
  STRIPED: "Striped",
  CHECKED: "Checked",
  PRINTED: "Printed",
  EMBROIDERED: "Embroidered",
  BLOCK_PRINT: "Block print",
};

const fitLabels: Record<Fit, string> = {
  RELAXED: "Relaxed",
  REGULAR: "Regular",
  FITTED: "Fitted",
  OVERSIZED: "Oversized",
  A_LINE: "A-line",
  STRAIGHT: "Straight",
};

const occasionLabels: Record<Occasion, string> = {
  EVERYDAY: "Everyday",
  WORK: "Work",
  BRUNCH: "Brunch",
  EVENING: "Evening",
  FESTIVE: "Festive",
  HOLIDAY: "Holiday",
};

export const fabricVocabulary: Vocabulary<Fabric> = {
  param: "fabric",
  label: "Fabric",
  values: Object.values(Fabric),
  labels: fabricLabels,
};

export const patternVocabulary: Vocabulary<Pattern> = {
  param: "pattern",
  label: "Pattern",
  values: Object.values(Pattern),
  labels: patternLabels,
};

export const fitVocabulary: Vocabulary<Fit> = {
  param: "fit",
  label: "Fit",
  values: Object.values(Fit),
  labels: fitLabels,
};

export const occasionVocabulary: Vocabulary<Occasion> = {
  param: "occasion",
  label: "Occasion",
  values: Object.values(Occasion),
  labels: occasionLabels,
};

/**
 * Turn the tokens that arrived in a URL into enum values.
 *
 * Anything unrecognised is dropped rather than passed to Prisma, so a
 * hand-typed `?fabric=' OR 1=1` leaves an empty list and the group simply
 * does not filter. This is the second gate: `product-query.ts` has already
 * rejected anything that is not a slug-shaped token.
 */
export function tokensToValues<TValue extends string>(
  vocabulary: Vocabulary<TValue>,
  tokens: readonly string[],
): TValue[] {
  if (tokens.length === 0) {
    return [];
  }

  const wanted = new Set(tokens.map((token) => token.toLowerCase()));

  return vocabulary.values.filter((value) => wanted.has(toToken(value)));
}
