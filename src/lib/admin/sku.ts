/**
 * Suggesting a variant SKU.
 *
 * A pure string function with no imports, which is the point: the admin
 * variant form runs in the browser and needs to show a suggested SKU as the
 * colour and size change, so this cannot live in the variant service — that
 * module is `server-only` and pulls in Prisma. Putting it there and importing
 * it from a client component is exactly the mistake the `server-only` marker
 * exists to catch, and it did.
 *
 * The rule is the one `prisma/catalog/seed.ts` already uses, so a variant an
 * administrator adds by hand is named like a seeded one:
 *
 *     PR-DR-0001  +  lavender  +  M   ->   PR-DR-0001-LAV-M
 *
 * It is only ever a suggestion. The field stays editable, and uniqueness is
 * checked on whatever is actually submitted — by the service, and by the
 * unique index behind it.
 */
export function suggestSku(
  articleNumber: string,
  colorSlug: string,
  sizeCode: string,
): string {
  const colour = colorSlug.replaceAll("-", "").slice(0, 3).toUpperCase();
  return `${articleNumber}-${colour}-${sizeCode.toUpperCase()}`;
}
