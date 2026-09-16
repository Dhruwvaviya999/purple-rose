import { z } from "zod";

import { allowedImageHostList, isAllowedImageUrl } from "@/config/images";
import { moneyErrorMessage, rupeesToPaise } from "@/lib/admin/money";
import {
  Fabric,
  Fit,
  Occasion,
  Pattern,
  ProductStatus,
} from "@/generated/prisma/enums";

/**
 * What the catalogue admin forms are allowed to submit.
 *
 * These run on the server, inside the Server Actions, because that is the only
 * place a check is a boundary. A form is markup; the request can be sent
 * without ever loading it, with any field set to anything. Whatever the browser
 * does with the same rules is convenience.
 *
 * Three things happen here that are worth knowing about:
 *
 * - **Money is converted, not just checked.** The form takes rupees and the
 *   database stores paise, and the conversion is exact integer arithmetic in
 *   `lib/admin/money.ts`. No float touches a price.
 * - **Image URLs are checked against the configured hosts**, not merely parsed.
 *   See `config/images.ts` for why that pairing matters.
 * - **Enums are validated against the generated Prisma values**, so a new
 *   fabric is a migration and a schema change together, and an unknown one
 *   cannot reach a query.
 *
 * Kept free of `server-only`: the shapes are reused by client forms for inline
 * feedback. Nothing here reads a secret or opens a connection.
 */

/* ------------------------------------------------------------------ *
 * Primitives
 * ------------------------------------------------------------------ */

/** A URL key. Lower case, digits, single hyphens, no leading or trailing one. */
export const slugSchema = z
  .string()
  .trim()
  .min(1, "Enter a slug.")
  .max(180, "That slug is too long.")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "Use lower-case letters, numbers and single hyphens, for example floral-cotton-midi-dress.",
  );

export const idSchema = z.uuid("That record could not be found.");

/**
 * Optional free text.
 *
 * An empty field arrives as `""`, which means "not set" rather than "set to
 * empty", so it becomes `null` on the way to a nullable column. Without this
 * an admin clearing an SEO title would store a blank string that renders as a
 * blank title rather than falling back.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .transform((value) => (value.length === 0 ? null : value));

/**
 * A rupee amount, as an integer number of paise.
 *
 * `superRefine` rather than `transform` so the specific reason — too many
 * decimals, not a number, too large — reaches the field instead of one flat
 * "invalid" for all of them.
 */
const priceSchema = (field: string) =>
  z.string().transform((value, ctx) => {
    const parsed = rupeesToPaise(value);

    if (!parsed.ok) {
      ctx.addIssue({ code: "custom", message: moneyErrorMessage(parsed.error, field) });
      return z.NEVER;
    }

    return parsed.paise;
  });

/** The same, but blank means "no compare-at price". */
const optionalPriceSchema = z.string().transform((value, ctx) => {
  if (value.trim().length === 0) {
    return null;
  }

  const parsed = rupeesToPaise(value);

  if (!parsed.ok) {
    ctx.addIssue({
      code: "custom",
      message: moneyErrorMessage(parsed.error, "compare-at price"),
    });
    return z.NEVER;
  }

  return parsed.paise;
});

/**
 * An image URL the storefront can actually render.
 *
 * Only absolute HTTPS on a configured host is accepted, which refuses
 * `javascript:`, `data:` and every other scheme by allowing exactly one rather
 * than by trying to enumerate what to block.
 */
export const imageUrlSchema = z
  .string()
  .trim()
  .min(1, "Enter an image URL.")
  .max(2048, "That URL is too long.")
  .refine(isAllowedImageUrl, {
    message: `Use an https URL from an approved host (${allowedImageHostList}).`,
  });

/**
 * A checkbox.
 *
 * An unticked box submits nothing at all, so the key can be missing, `null`,
 * or an empty string depending on how the form was read. Rather than trying to
 * enumerate every shape of "off", this accepts anything and recognises the
 * three shapes of **on**. Everything else — absent, null, "false", "0", a
 * file — is off.
 *
 * That direction matters: a value that is not understood must never mean
 * "true" for a flag that decides whether something is public.
 */
const checkbox = z
  .unknown()
  .optional()
  .transform((value) => value === "on" || value === "true" || value === "1");

/** A non-negative whole number from a numeric input. */
const countSchema = (field: string, max = 1_000_000) =>
  z
    .string()
    .trim()
    .min(1, `Enter a ${field}.`)
    .regex(/^\d+$/, `${field[0]?.toUpperCase()}${field.slice(1)} must be a whole number, zero or more.`)
    .transform(Number)
    .refine((value) => value <= max, `That ${field} is larger than this shop supports.`);

/** A sort position. Small, non-negative, and not a vector for a huge integer. */
export const positionSchema = z
  .string()
  .trim()
  .regex(/^\d{1,4}$/, "Position must be a whole number between 0 and 9999.")
  .transform(Number);

/**
 * The version of the row the form was rendered from.
 *
 * Carried through the form and compared on write, so two administrators
 * editing the same product do not silently overwrite one another. See
 * `product-admin-service.ts`.
 */
export const expectedUpdatedAtSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), "Reload the page and try again.")
  .transform((value) => new Date(value));

/* ------------------------------------------------------------------ *
 * Products
 * ------------------------------------------------------------------ */

const productFields = {
  name: z.string().trim().min(2, "Enter a product name.").max(160, "That name is too long."),
  slug: slugSchema,
  articleNumber: z
    .string()
    .trim()
    .min(2, "Enter an article number.")
    .max(32, "That article number is too long.")
    .regex(
      /^[A-Za-z0-9][A-Za-z0-9-]*$/,
      "Use letters, numbers and hyphens, for example PR-DR-0001.",
    ),
  shortDescription: z
    .string()
    .trim()
    .min(10, "Write a short description of at least 10 characters.")
    .max(280, "Keep the short description under 280 characters."),
  description: z
    .string()
    .trim()
    .min(20, "Write a description of at least 20 characters.")
    .max(8000, "That description is too long."),
  careInstructions: z
    .string()
    .trim()
    .min(3, "Enter care instructions.")
    .max(280, "Keep care instructions under 280 characters."),

  primaryCategoryId: idSchema,
  /**
   * Every additional collection, as the full replacement set.
   *
   * The form submits all of them on every save and the service replaces what
   * is stored. That is simpler than patching individual rows and it matches
   * how the control behaves: a box that is no longer ticked means "not in this
   * collection", which a patch would have no way to express.
   */
  additionalCategoryIds: z.array(idSchema).max(20, "That is too many collections."),

  fabric: z.enum(Fabric),
  pattern: z.enum(Pattern),
  fit: z.enum(Fit),
  occasion: z.enum(Occasion),

  price: priceSchema("price"),
  compareAtPrice: optionalPriceSchema,

  featured: checkbox,
  newArrival: checkbox,
  bestSeller: checkbox,
  seasonal: checkbox,

  status: z.enum(ProductStatus),

  seoTitle: optionalText(160),
  seoDescription: optionalText(320),
};

/**
 * A compare-at price only means something when it is higher than the price.
 *
 * Checked after both are parsed, and reported on the compare-at field, because
 * that is the one the admin should change. The database enforces the same rule
 * as a CHECK constraint; this is what turns it into a message.
 */
const isAGenuineReduction = <T extends { price: number; compareAtPrice: number | null }>(
  value: T,
  ctx: z.RefinementCtx,
) => {
  if (value.compareAtPrice !== null && value.compareAtPrice <= value.price) {
    ctx.addIssue({
      code: "custom",
      path: ["compareAtPrice"],
      message:
        "A compare-at price must be higher than the price, or left blank. It is what the piece used to cost.",
    });
  }
};

export const createProductSchema = z
  .object(productFields)
  .superRefine(isAGenuineReduction);

export const updateProductSchema = z
  .object({
    ...productFields,
    id: idSchema,
    expectedUpdatedAt: expectedUpdatedAtSchema,
  })
  .superRefine(isAGenuineReduction);

/** Publish, unpublish and archive. One field, three transitions. */
export const productStatusChangeSchema = z.object({
  id: idSchema,
  status: z.enum(ProductStatus),
});

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/* ------------------------------------------------------------------ *
 * Categories
 * ------------------------------------------------------------------ */

const categoryFields = {
  name: z.string().trim().min(2, "Enter a category name.").max(120, "That name is too long."),
  slug: slugSchema.max(140, "That slug is too long."),
  description: optionalText(280),
  imageUrl: z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : value))
    .refine(
      (value) => value === null || isAllowedImageUrl(value),
      `Use an https URL from an approved host (${allowedImageHostList}), or leave it blank.`,
    ),
  imageAlt: optionalText(280),
  position: positionSchema,
  isActive: checkbox,
  seoTitle: optionalText(160),
  seoDescription: optionalText(320),
};

/**
 * A category tile needs a picture *and* its intrinsic size, so the layout can
 * reserve the box. The admin supplies the URL and the alt text; the dimensions
 * are the one 4:5 portrait shape the whole storefront uses, applied by the
 * service. Asking an administrator for pixel dimensions would be asking them
 * to do arithmetic to satisfy a component.
 */
export const createCategorySchema = z.object(categoryFields);

export const updateCategorySchema = z.object({
  ...categoryFields,
  id: idSchema,
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

export const categoryActivationSchema = z.object({
  id: idSchema,
  isActive: checkbox,
});

/** Moving one category up or down the running order. */
export const categoryReorderSchema = z.object({
  id: idSchema,
  direction: z.enum(["up", "down"]),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/* ------------------------------------------------------------------ *
 * Variants
 * ------------------------------------------------------------------ */

const skuSchema = z
  .string()
  .trim()
  .min(3, "Enter a SKU.")
  .max(48, "That SKU is too long.")
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9-]*$/,
    "Use letters, numbers and hyphens, for example PR-DR-0001-PIN-M.",
  );

const variantFields = {
  sku: skuSchema,
  quantity: countSchema("quantity"),
  lowStockThreshold: countSchema("low-stock threshold", 10_000),
};

export const createVariantSchema = z.object({
  productId: idSchema,
  colorId: idSchema,
  sizeId: idSchema,
  ...variantFields,
});

/**
 * An existing variant's colour and size are fixed.
 *
 * Changing either would silently turn "pink, M" into a different sellable
 * thing while keeping its identity, its stock and any future order line
 * pointing at it. To sell a different combination, add a variant and
 * deactivate this one.
 */
export const updateVariantSchema = z.object({
  id: idSchema,
  ...variantFields,
  isActive: checkbox,
});

export const variantActivationSchema = z.object({
  id: idSchema,
  isActive: checkbox,
});

/** One row of a bulk generation, after the admin has reviewed it. */
export const bulkVariantRowSchema = z.object({
  colorId: idSchema,
  sizeId: idSchema,
  ...variantFields,
});

export const createVariantsSchema = z.object({
  productId: idSchema,
  variants: z
    .array(bulkVariantRowSchema)
    .min(1, "Choose at least one colour and one size.")
    .max(60, "Generate at most 60 variants at a time, so they can be reviewed."),
});

export type CreateVariantInput = z.infer<typeof createVariantSchema>;
export type CreateVariantsInput = z.infer<typeof createVariantsSchema>;

/* ------------------------------------------------------------------ *
 * Images
 * ------------------------------------------------------------------ */

const imageFields = {
  url: imageUrlSchema,
  alt: z
    .string()
    .trim()
    .min(3, "Describe the garment, for anyone who cannot see the photograph.")
    .max(280, "Keep alt text under 280 characters."),
  /**
   * Which colour this photograph is of.
   *
   * Empty means it belongs to every colour: a flat lay, a fabric close-up, a
   * detail shot. That distinction is the whole reason a swatch can change the
   * gallery, so the form makes it an explicit choice rather than a blank.
   */
  colorId: z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : value))
    .refine(
      (value) => value === null || z.uuid().safeParse(value).success,
      "Choose a colour, or leave it as shared.",
    ),
  isPrimary: checkbox,
};

export const createImageSchema = z.object({
  productId: idSchema,
  ...imageFields,
});

export const updateImageSchema = z.object({
  id: idSchema,
  ...imageFields,
});

export const imageIdSchema = z.object({ id: idSchema });

export const imageReorderSchema = z.object({
  id: idSchema,
  direction: z.enum(["up", "down"]),
});

export type CreateImageInput = z.infer<typeof createImageSchema>;
export type UpdateImageInput = z.infer<typeof updateImageSchema>;

/* ------------------------------------------------------------------ *
 * Colours and sizes
 * ------------------------------------------------------------------ */

/**
 * A CSS hex colour, `#rrggbb`.
 *
 * Deliberately narrow. The value is rendered as an inline `background-color`
 * on a swatch, so the safe thing is to accept one unambiguous shape rather
 * than everything CSS permits: no `rgb()`, no named colours, no `url()`, no
 * `var()`, and nothing that could carry a function call or a semicolon into a
 * style attribute. Six hex digits cannot express anything but a colour.
 *
 * Short form (`#abc`) is expanded rather than rejected, because it is a real
 * thing to paste and the column stores one canonical form.
 */
export const hexColorSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/,
    "Enter a hex colour such as #a87bc9.",
  )
  .transform((value) =>
    value.length === 4
      ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
      : value,
  );

const colorFields = {
  name: z
    .string()
    .trim()
    .min(2, "Enter a colour name.")
    .max(60, "That name is too long."),
  /**
   * The URL key the shop's colour filter carries: `?colour=dusty-plum`.
   *
   * Stable. Renaming a colour does not rewrite it, because a changed slug
   * silently breaks every filtered link anyone has shared.
   */
  slug: slugSchema.max(60, "That slug is too long."),
  hex: hexColorSchema,
  position: positionSchema,
  isActive: checkbox,
};

export const createColorSchema = z.object(colorFields);

export const updateColorSchema = z.object({
  ...colorFields,
  id: idSchema,
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

export const attributeActivationSchema = z.object({
  id: idSchema,
  isActive: checkbox,
});

export const attributeReorderSchema = z.object({
  id: idSchema,
  direction: z.enum(["up", "down"]),
});

export type CreateColorInput = z.infer<typeof createColorSchema>;
export type UpdateColorInput = z.infer<typeof updateColorSchema>;

/**
 * A body measurement in whole centimetres.
 *
 * Optional, and blank means **not measured** rather than zero. A shop that has
 * not put a tape round its garments should not have to invent numbers to save
 * a name change, and storing 0 would read as "measured, and it is nothing".
 */
const measurementSchema = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? null : value))
  .refine(
    (value) => value === null || /^\d{1,3}$/.test(value),
    "Enter a measurement in whole centimetres, or leave it blank.",
  )
  .transform((value) => (value === null ? null : Number(value)));

const sizeFields = {
  /**
   * The stable identifier: `XS`, `M`, `FREE`.
   *
   * Upper-cased on the way in so `m` and `M` cannot become two sizes. It is
   * what a SKU is built from and what `?size=m` resolves against, so renaming
   * the size does not touch it.
   */
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1, "Enter a size code.")
    .max(16, "A size code is at most 16 characters.")
    .regex(
      /^[A-Z0-9][A-Z0-9-]*$/,
      "Use letters, numbers and hyphens, for example XS, M or 32.",
    ),
  name: z
    .string()
    .trim()
    .min(2, "Enter a size name.")
    .max(40, "That name is too long."),
  position: positionSchema,
  isActive: checkbox,
  bustCm: measurementSchema,
  waistCm: measurementSchema,
  hipCm: measurementSchema,
};

export const createSizeSchema = z.object(sizeFields);

export const updateSizeSchema = z.object({
  ...sizeFields,
  id: idSchema,
  expectedUpdatedAt: expectedUpdatedAtSchema,
});

export type CreateSizeInput = z.infer<typeof createSizeSchema>;
export type UpdateSizeInput = z.infer<typeof updateSizeSchema>;
