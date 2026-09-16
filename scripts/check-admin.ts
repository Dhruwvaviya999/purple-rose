/**
 * Checks for the admin catalogue, against a real database.
 *
 * Run with `pnpm check:admin`. It needs `DATABASE_URL` in `.env.local` or
 * `.env`, the migrations applied and `pnpm db:seed` run. Without a connection
 * it exits cleanly and says what is missing, rather than pretending to pass.
 *
 * **It writes.** Everything it creates is prefixed `zzz-check-admin`, and it
 * deletes all of it afterwards, including when a check fails. Nothing seeded
 * is touched.
 *
 * ## What is and is not proved here
 *
 * The mutation paths run through the real admin services, so the validation,
 * uniqueness, transactions and stale-write detection are genuinely exercised.
 *
 * The **authorisation** on a Server Action cannot be exercised from a script:
 * an action reads its session through `cookies()`, which only exists inside a
 * Next request. So authorisation is covered three ways instead, and the report
 * says which is which:
 *
 *   1. the guard itself is called directly, with no session, a customer and an
 *      administrator, and asserted to refuse the first two;
 *   2. every exported action is read from disk and asserted to call the guard,
 *      so a new action cannot be added without one;
 *   3. the admin pages are checked over HTTP by `scripts/check-admin-http.ts`,
 *      which is the part that needs a running server.
 */
import { config as loadEnvFiles } from "dotenv";

loadEnvFiles({ path: [".env.local", ".env"], quiet: true });

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { ProductStatus, Role } from "../src/generated/prisma/enums";
import { prisma } from "../src/lib/db/client";
// The policy module, not the guard: the guard resolves a session through
// next/navigation, which cannot be loaded outside a Next request.
import {
  AdminAuthorizationError,
  isAdmin,
} from "../src/lib/auth/admin-policy";
import { rupeesToPaise, paiseToRupeeInput } from "../src/lib/admin/money";
import { suggestSku } from "../src/lib/admin/sku";
import { isAllowedImageUrl } from "../src/config/images";
import { parseAdminProductQuery } from "../src/lib/admin/product-admin-query";
import {
  createProductSchema,
  createVariantSchema,
  createImageSchema,
  updateProductSchema,
} from "../src/lib/validations/catalog-admin";
import {
  createProduct,
  getAdminProduct,
  listAdminProducts,
  setProductStatus,
  updateProduct,
} from "../src/lib/services/admin/product-admin-service";
import {
  createCategory,
  listAdminCategories,
  moveCategory,
  setCategoryActive,
  updateCategory,
} from "../src/lib/services/admin/category-admin-service";
import {
  createVariant,
  createVariants,
  setVariantActive,
  updateVariant,
} from "../src/lib/services/admin/variant-admin-service";
import {
  createProductImage,
  deleteProductImage,
  moveProductImage,
  updateProductImage,
} from "../src/lib/services/admin/image-admin-service";
import { getCatalogMetrics } from "../src/lib/services/admin/catalog-dashboard-service";

/** Everything this script creates carries this, and is deleted afterwards. */
const MARK = "zzz-check-admin";
const IMAGE = "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` -- ${detail}` : ""}`);
  }
}

/* ------------------------------------------------------------------ *
 * Offline: things that need no database
 * ------------------------------------------------------------------ */

function checkOffline(): void {
  console.log("\n== money conversion (never a float) ==");

  const cases: [string, number][] = [
    ["1299", 129900],
    ["1299.50", 129950],
    ["1299.5", 129950],
    ["0", 0],
    ["1,299", 129900],
    ["  2490  ", 249000],
    // The case a float gets wrong: 12.10 * 100 is 1209.9999999999998.
    ["12.10", 1210],
    ["0.01", 1],
  ];

  for (const [input, expected] of cases) {
    const result = rupeesToPaise(input);
    check(
      `"${input}" becomes ${expected} paise`,
      result.ok && result.paise === expected,
      result.ok ? String(result.paise) : result.error,
    );
  }

  for (const bad of ["", "abc", "-5", "1.234", "1e5", "99999999999"]) {
    check(`"${bad}" is refused`, !rupeesToPaise(bad).ok);
  }

  check("paise round-trip to a whole rupee field", paiseToRupeeInput(249000) === "2490");
  check("paise round-trip keeps the decimals", paiseToRupeeInput(129950) === "1299.50");

  console.log("\n== image URLs ==");

  check("an approved https host is accepted", isAllowedImageUrl(`${IMAGE}?w=1`));
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "http://images.unsplash.com/x.jpg",
    "https://evil.example.com/x.jpg",
    "not a url",
    "//images.unsplash.com/x.jpg",
  ]) {
    check(`"${bad.slice(0, 40)}" is refused`, !isAllowedImageUrl(bad));
  }

  console.log("\n== admin URL parsing ==");

  const hostile = parseAdminProductQuery({
    status: "DROP TABLE",
    category: "'; delete from \"Product\"; --",
    stock: "../../etc",
    flag: "<script>",
    sort: "price-asc; delete",
    page: "-3",
    q: "a".repeat(500),
  });

  check("an unknown status is dropped", hostile.status === undefined);
  check("a SQL fragment is not a category", hostile.category === undefined);
  check("an unknown stock filter is dropped", hostile.stock === undefined);
  check("an unknown flag is dropped", hostile.merchandising === undefined);
  check("an unknown sort falls back", hostile.sort === "updated-desc");
  check("a negative page becomes one", hostile.page === 1);
  check("a search term is length-capped", (hostile.search?.length ?? 0) === 80);

  const good = parseAdminProductQuery({
    status: "DRAFT",
    stock: "low",
    flag: "sale",
    sort: "price-desc",
    page: "3",
  });
  check("valid values survive", good.status === "DRAFT" && good.stock === "low");
  check("a valid sort survives", good.sort === "price-desc" && good.page === 3);

  console.log("\n== schema validation ==");

  const bad = createProductSchema.safeParse({
    name: "x",
    slug: "Not A Slug",
    articleNumber: "",
    shortDescription: "too short",
    description: "short",
    careInstructions: "",
    primaryCategoryId: "nope",
    additionalCategoryIds: [],
    fabric: "UNOBTAINIUM",
    pattern: "SOLID",
    fit: "RELAXED",
    occasion: "EVERYDAY",
    price: "-5",
    compareAtPrice: "",
    status: "PUBLISHED",
    seoTitle: "",
    seoDescription: "",
  });
  check("a wholly invalid product is refused", !bad.success);
  check(
    "the refusal names several fields, not one",
    !bad.success && new Set(bad.error.issues.map((i) => i.path[0])).size >= 6,
  );

  const upperSlug = createProductSchema.safeParse({
    name: "Valid Name",
    slug: "Valid-Slug",
    articleNumber: "PR-XX-0001",
    shortDescription: "A short description that is long enough.",
    description: "A description that is comfortably long enough to pass.",
    careInstructions: "Machine wash",
    primaryCategoryId: "01a0a979-c20b-70bb-9c51-17754055c716",
    additionalCategoryIds: [],
    fabric: "COTTON",
    pattern: "SOLID",
    fit: "RELAXED",
    occasion: "EVERYDAY",
    price: "1299",
    compareAtPrice: "",
    status: "DRAFT",
    seoTitle: "",
    seoDescription: "",
  });
  check("an upper-case slug is refused", !upperSlug.success);

  const fakeSale = createProductSchema.safeParse({
    name: "Valid Name",
    slug: "valid-slug",
    articleNumber: "PR-XX-0001",
    shortDescription: "A short description that is long enough.",
    description: "A description that is comfortably long enough to pass.",
    careInstructions: "Machine wash",
    primaryCategoryId: "01a0a979-c20b-70bb-9c51-17754055c716",
    additionalCategoryIds: [],
    fabric: "COTTON",
    pattern: "SOLID",
    fit: "RELAXED",
    occasion: "EVERYDAY",
    price: "1500",
    compareAtPrice: "1000",
    status: "DRAFT",
    seoTitle: "",
    seoDescription: "",
  });
  check(
    "a compare-at price below the price is refused",
    !fakeSale.success &&
      fakeSale.error.issues.some((issue) => issue.path[0] === "compareAtPrice"),
  );

  const negativeStock = createVariantSchema.safeParse({
    productId: "01a0a979-c20b-70bb-9c51-17754055c716",
    colorId: "01a0a979-c20b-70bb-9c51-17754055c716",
    sizeId: "01a0a979-c20b-70bb-9c51-17754055c716",
    sku: "PR-XX-0001-BLA-M",
    quantity: "-4",
    lowStockThreshold: "3",
  });
  check("negative stock is refused by the schema", !negativeStock.success);

  const scriptUrl = createImageSchema.safeParse({
    productId: "01a0a979-c20b-70bb-9c51-17754055c716",
    url: "javascript:alert(document.cookie)",
    alt: "Something",
    colorId: "",
    isPrimary: undefined,
  });
  check("a javascript: image URL is refused by the schema", !scriptUrl.success);

  const staleMissing = updateProductSchema.safeParse({
    name: "Valid Name",
    slug: "valid-slug",
    articleNumber: "PR-XX-0001",
    shortDescription: "A short description that is long enough.",
    description: "A description that is comfortably long enough to pass.",
    careInstructions: "Machine wash",
    primaryCategoryId: "01a0a979-c20b-70bb-9c51-17754055c716",
    additionalCategoryIds: [],
    fabric: "COTTON",
    pattern: "SOLID",
    fit: "RELAXED",
    occasion: "EVERYDAY",
    price: "1299",
    compareAtPrice: "",
    status: "DRAFT",
    seoTitle: "",
    seoDescription: "",
    id: "01a0a979-c20b-70bb-9c51-17754055c716",
    expectedUpdatedAt: "",
  });
  check("an update with no version stamp is refused", !staleMissing.success);

  console.log("\n== the authorisation guard ==");

  check("nobody is not an administrator", !isAdmin(null));
  check(
    "a customer is not an administrator",
    !isAdmin({ id: "x", phoneNumber: "+910000000000", name: null, role: Role.CUSTOMER }),
  );
  check(
    "an administrator is",
    isAdmin({ id: "x", phoneNumber: "+910000000000", name: null, role: Role.ADMIN }),
  );
  check(
    "the refusal carries no detail about why",
    new AdminAuthorizationError().message === "Administrator access is required.",
  );

  console.log("\n== every action is guarded ==");

  // Read the action modules from disk and assert mechanically that no exported
  // action can be added without the guard. This is what stops the check from
  // being a statement about the four files that exist today.
  const actionDir = join(process.cwd(), "src", "actions", "admin");
  const files = readdirSync(actionDir).filter((file) => file.endsWith(".ts"));

  check("there are admin action modules to audit", files.length > 0, String(files.length));

  for (const file of files) {
    const source = readFileSync(join(actionDir, file), "utf8");
    const exported = [...source.matchAll(/export async function (\w+)/g)].map(
      (match) => match[1],
    );

    check(`${file} declares "use server"`, source.trimStart().startsWith('"use server"'));
    check(`${file} exports at least one action`, exported.length > 0);

    for (const name of exported) {
      // The body of each exported action, up to the next export.
      const start = source.indexOf(`export async function ${name}`);
      const nextExport = source.indexOf("export async function ", start + 1);
      const body = source.slice(start, nextExport === -1 ? undefined : nextExport);

      check(
        `${file}: ${name} calls requireAdminActor`,
        body.includes("await requireAdminActor()"),
      );
      check(
        `${file}: ${name} guards before it validates`,
        body.indexOf("await requireAdminActor()") < indexOrInfinity(body, "safeParse"),
      );
    }
  }
}

function indexOrInfinity(text: string, needle: string): number {
  const index = text.indexOf(needle);
  return index === -1 ? Number.POSITIVE_INFINITY : index;
}

/* ------------------------------------------------------------------ *
 * Against the database
 * ------------------------------------------------------------------ */

async function checkDatabase(): Promise<void> {
  const created = { categoryIds: [] as string[], productIds: [] as string[] };

  try {
    console.log("\n== creating a collection ==");

    const categoryResult = await createCategory({
      name: `${MARK} collection`,
      slug: `${MARK}-collection`,
      description: "Temporary, created by pnpm check:admin.",
      imageUrl: IMAGE,
      imageAlt: "A temporary collection",
      position: 900,
      isActive: true,
      seoTitle: null,
      seoDescription: null,
    });

    check("a collection is created", categoryResult.ok);

    if (!categoryResult.ok) {
      return;
    }

    const categoryId = categoryResult.data.id;
    created.categoryIds.push(categoryId);

    const storedCategory = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { slug: true, imageWidth: true, imageHeight: true, isActive: true },
    });

    check("it is really in the database", storedCategory !== null);
    check(
      "the tile dimensions were filled in for it",
      storedCategory?.imageWidth === 800 && storedCategory?.imageHeight === 1000,
    );

    const duplicateCategory = await createCategory({
      name: "Another name entirely",
      slug: `${MARK}-collection`,
      description: null,
      imageUrl: null,
      imageAlt: null,
      position: 901,
      isActive: true,
      seoTitle: null,
      seoDescription: null,
    });

    check(
      "a duplicate collection slug is refused, on the slug field",
      !duplicateCategory.ok &&
        duplicateCategory.code === "slug-taken" &&
        duplicateCategory.field === "slug",
    );
    check(
      "the refusal says nothing about the database",
      !duplicateCategory.ok &&
        !/prisma|constraint|unique|sql/i.test(duplicateCategory.message),
      duplicateCategory.ok ? "" : duplicateCategory.message,
    );

    console.log("\n== creating a product ==");

    const productResult = await createProduct({
      name: `${MARK} dress`,
      slug: `${MARK}-dress`,
      articleNumber: `${MARK}-0001`.toUpperCase(),
      shortDescription: "A temporary product created by the admin checks.",
      description:
        "A temporary product created by pnpm check:admin. It is deleted when the script finishes.",
      careInstructions: "Machine wash cold",
      status: ProductStatus.DRAFT,
      price: 129900,
      compareAtPrice: 159900,
      fabric: "COTTON",
      pattern: "SOLID",
      fit: "RELAXED",
      occasion: "EVERYDAY",
      featured: false,
      newArrival: true,
      bestSeller: false,
      seasonal: false,
      seoTitle: null,
      seoDescription: null,
      primaryCategoryId: categoryId,
      additionalCategoryIds: [],
    });

    check("a product is created", productResult.ok);

    if (!productResult.ok) {
      return;
    }

    const productId = productResult.data.id;
    created.productIds.push(productId);

    const stored = await getAdminProduct(productId);

    check("it is really in the database", stored !== null);
    check("it was created as a draft", stored?.status === ProductStatus.DRAFT);
    check("a draft has no publication date", stored?.publishedAt === null);
    check("the price is stored as paise", stored?.price === 129900);
    check(
      "the primary collection is also a membership",
      stored?.categories.some((entry) => entry.categoryId === categoryId) ?? false,
    );

    const duplicateSlug = await createProduct({
      ...productPayload(categoryId),
      slug: `${MARK}-dress`,
      articleNumber: `${MARK}-0002`.toUpperCase(),
    });
    check(
      "a duplicate product slug is refused, on the slug field",
      !duplicateSlug.ok && duplicateSlug.code === "slug-taken" && duplicateSlug.field === "slug",
    );

    const duplicateArticle = await createProduct({
      ...productPayload(categoryId),
      slug: `${MARK}-other`,
      articleNumber: `${MARK}-0001`.toUpperCase(),
    });
    check(
      "a duplicate article number is refused",
      !duplicateArticle.ok && duplicateArticle.code === "article-taken",
    );

    const unknownCategory = await createProduct({
      ...productPayload("01a0a979-0000-7000-8000-000000000000"),
      slug: `${MARK}-orphan`,
      articleNumber: `${MARK}-0003`.toUpperCase(),
    });
    check(
      "a product in a collection that does not exist is refused",
      !unknownCategory.ok && unknownCategory.code === "invalid-reference",
    );
    check(
      "and nothing was left behind by it",
      (await prisma.product.count({ where: { slug: `${MARK}-orphan` } })) === 0,
    );

    console.log("\n== updating, and the stale-write guard ==");

    const before = await prisma.product.findUniqueOrThrow({
      where: { id: productId },
      select: { updatedAt: true },
    });

    const updated = await updateProduct({
      ...productPayload(categoryId),
      id: productId,
      slug: `${MARK}-dress`,
      articleNumber: `${MARK}-0001`.toUpperCase(),
      name: `${MARK} dress, renamed`,
      price: 149900,
      compareAtPrice: null,
      expectedUpdatedAt: before.updatedAt,
    });

    check("an update with the right version is applied", updated.ok);

    const afterUpdate = await getAdminProduct(productId);
    check("the name changed", afterUpdate?.name === `${MARK} dress, renamed`);
    check("the price changed", afterUpdate?.price === 149900);
    check("the compare-at price was cleared", afterUpdate?.compareAtPrice === null);
    check(
      "the slug did NOT follow the name",
      afterUpdate?.slug === `${MARK}-dress`,
      afterUpdate?.slug,
    );

    const stale = await updateProduct({
      ...productPayload(categoryId),
      id: productId,
      slug: `${MARK}-dress`,
      articleNumber: `${MARK}-0001`.toUpperCase(),
      name: "Written by a second administrator",
      expectedUpdatedAt: before.updatedAt,
    });

    check(
      "a second administrator writing an old version is refused",
      !stale.ok && stale.code === "stale",
    );

    const afterStale = await getAdminProduct(productId);
    check(
      "and the first administrator's work survived",
      afterStale?.name === `${MARK} dress, renamed`,
    );

    console.log("\n== publishing ==");

    const published = await setProductStatus(productId, ProductStatus.ACTIVE);
    check("it publishes", published.ok);

    const live = await getAdminProduct(productId);
    check("the status is live", live?.status === ProductStatus.ACTIVE);
    check("a publication date was stamped", live?.publishedAt !== null);

    const firstPublishedAt = live?.publishedAt;

    await setProductStatus(productId, ProductStatus.DRAFT);
    const unpublished = await getAdminProduct(productId);
    check("it unpublishes back to draft", unpublished?.status === ProductStatus.DRAFT);
    check(
      "and keeps its original publication date",
      unpublished?.publishedAt?.getTime() === firstPublishedAt?.getTime(),
    );

    await setProductStatus(productId, ProductStatus.ACTIVE);
    const republished = await getAdminProduct(productId);
    check(
      "republishing does not restamp the date",
      republished?.publishedAt?.getTime() === firstPublishedAt?.getTime(),
    );

    console.log("\n== variants and stock ==");

    const colour = await prisma.color.findFirstOrThrow({
      where: { isActive: true },
      orderBy: { position: "asc" },
      select: { id: true, slug: true, name: true },
    });
    const sizes = await prisma.size.findMany({
      where: { isActive: true },
      orderBy: { position: "asc" },
      take: 3,
      select: { id: true, code: true },
    });
    const firstSize = sizes[0];

    if (!firstSize) {
      check("there are sizes to build variants from", false);
      return;
    }

    const sku = suggestSku(`${MARK}-0001`.toUpperCase(), colour.slug, firstSize.code);

    const variantResult = await createVariant({
      productId,
      colorId: colour.id,
      sizeId: firstSize.id,
      sku,
      quantity: 5,
      lowStockThreshold: 2,
    });

    check("a variant is created", variantResult.ok);

    if (!variantResult.ok) {
      return;
    }

    const variantId = variantResult.data.id;

    const inventory = await prisma.inventory.findUnique({
      where: { variantId },
      select: { quantity: true, lowStockThreshold: true },
    });
    check("its inventory row was created in the same breath", inventory !== null);
    check("with the quantity given", inventory?.quantity === 5);

    const duplicateCombination = await createVariant({
      productId,
      colorId: colour.id,
      sizeId: firstSize.id,
      sku: `${sku}-X`,
      quantity: 1,
      lowStockThreshold: 1,
    });
    check(
      "the same colour and size cannot be added twice",
      !duplicateCombination.ok && duplicateCombination.code === "variant-exists",
    );

    const duplicateSku = await createVariant({
      productId,
      colorId: colour.id,
      sizeId: sizes[1]?.id ?? firstSize.id,
      sku,
      quantity: 1,
      lowStockThreshold: 1,
    });
    check(
      "a SKU already in use is refused, on the SKU field",
      !duplicateSku.ok && duplicateSku.code === "sku-taken" && duplicateSku.field === "sku",
    );
    check(
      "the SKU refusal says nothing about the database",
      !duplicateSku.ok && !/prisma|constraint|unique|sql/i.test(duplicateSku.message),
    );

    const stockUpdate = await updateVariant({
      id: variantId,
      sku,
      quantity: 0,
      lowStockThreshold: 2,
      isActive: true,
    });
    check("stock can be set to zero", stockUpdate.ok);
    check(
      "and it really is zero",
      (await prisma.inventory.findUnique({ where: { variantId }, select: { quantity: true } }))
        ?.quantity === 0,
    );

    let negativeRejected = false;
    try {
      await prisma.inventory.update({ where: { variantId }, data: { quantity: -1 } });
    } catch {
      negativeRejected = true;
    }
    check("the database itself refuses negative stock", negativeRejected);

    await setVariantActive(variantId, false);
    check(
      "a variant is withdrawn, not deleted",
      (await prisma.productVariant.findUnique({
        where: { id: variantId },
        select: { isActive: true },
      }))?.isActive === false,
    );
    await setVariantActive(variantId, true);

    console.log("\n== bulk variants ==");

    const batch = sizes.slice(1).map((size) => ({
      colorId: colour.id,
      sizeId: size.id,
      sku: suggestSku(`${MARK}-0001`.toUpperCase(), colour.slug, size.code),
      quantity: 3,
      lowStockThreshold: 1,
    }));

    if (batch.length > 0) {
      const bulk = await createVariants({ productId, variants: batch });
      check(`a batch of ${batch.length} is created`, bulk.ok);
      check(
        "every one of them has inventory",
        (await prisma.inventory.count({
          where: { variant: { productId } },
        })) ===
          (await prisma.productVariant.count({ where: { productId } })),
      );

      const clashing = await createVariants({
        productId,
        variants: [
          {
            colorId: colour.id,
            sizeId: firstSize.id,
            sku: `${MARK}-BATCH-CLASH`.toUpperCase(),
            quantity: 1,
            lowStockThreshold: 1,
          },
        ],
      });
      check(
        "a batch containing an existing combination is refused whole",
        !clashing.ok && clashing.code === "variant-exists",
      );
      check(
        "and nothing from that batch was written",
        (await prisma.productVariant.count({
          where: { sku: `${MARK}-BATCH-CLASH`.toUpperCase() },
        })) === 0,
      );
    }

    console.log("\n== photographs ==");

    const firstImage = await createProductImage({
      productId,
      url: `${IMAGE}?v=1`,
      alt: "A temporary photograph, front view",
      colorId: null,
      isPrimary: false,
    });
    check("a photograph is added", firstImage.ok);
    check(
      "the first one becomes the card image even when not asked for",
      firstImage.ok &&
        (
          await prisma.productImage.findUnique({
            where: { id: firstImage.data.id },
            select: { isPrimary: true },
          })
        )?.isPrimary === true,
    );

    const colourImage = await createProductImage({
      productId,
      url: `${IMAGE}?v=2`,
      alt: `A temporary photograph in ${colour.name}`,
      colorId: colour.id,
      isPrimary: true,
    });
    check("a colour-specific photograph is added", colourImage.ok);

    const primaries = await prisma.productImage.count({
      where: { productId, isPrimary: true },
    });
    check("only one photograph is ever the card image", primaries === 1, String(primaries));

    const unknownColour = await prisma.color.findFirst({
      where: { id: { notIn: [colour.id] } },
      select: { id: true },
    });

    if (unknownColour) {
      const wrongColour = await createProductImage({
        productId,
        url: `${IMAGE}?v=3`,
        alt: "A photograph of a colour this product is not made in",
        colorId: unknownColour.id,
        isPrimary: false,
      });
      check(
        "a photograph cannot be tied to a colour the product is not cut in",
        !wrongColour.ok && wrongColour.code === "invalid-reference",
      );
    }

    if (firstImage.ok && colourImage.ok) {
      await moveProductImage(colourImage.data.id, "up");
      const ordered = await prisma.productImage.findMany({
        where: { productId },
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      });
      check("reordering moves it to the front", ordered[0]?.id === colourImage.data.id);
      check(
        "positions stay contiguous from zero",
        ordered.every((image, index) => image.position === index),
        ordered.map((image) => image.position).join(","),
      );

      const edited = await updateProductImage({
        id: firstImage.data.id,
        url: `${IMAGE}?v=1-edited`,
        alt: "An edited temporary photograph",
        colorId: null,
        isPrimary: false,
      });
      check("a photograph can be edited", edited.ok);

      await deleteProductImage(colourImage.data.id);
      const remaining = await prisma.productImage.findMany({
        where: { productId },
        orderBy: { position: "asc" },
        select: { position: true, isPrimary: true },
      });
      check(
        "deleting the card image hands the role to the next one",
        remaining.every((image, index) => image.position === index) &&
          remaining.filter((image) => image.isPrimary).length === 1,
      );
    }

    console.log("\n== the admin list ==");

    const found = await listAdminProducts(
      parseAdminProductQuery({ q: `${MARK}` }),
    );
    check("the product is findable by name", found.total >= 1);

    const bySku = await listAdminProducts(parseAdminProductQuery({ q: sku }));
    check(
      "and findable by the SKU of one of its variants",
      bySku.products.some((row) => row.id === productId),
    );

    const drafts = await listAdminProducts(parseAdminProductQuery({ status: "DRAFT" }));
    check(
      "a status filter returns only that status",
      drafts.products.every((row) => row.status === ProductStatus.DRAFT),
    );

    const listed = found.products.find((row) => row.id === productId);
    check("the row carries a stock summary", (listed?.stock.variants ?? 0) > 0);
    check(
      "the paging contract is complete",
      typeof found.total === "number" &&
        typeof found.page === "number" &&
        typeof found.pageSize === "number" &&
        typeof found.pageCount === "number",
    );

    console.log("\n== collections ==");

    const categoryBefore = await prisma.category.findUniqueOrThrow({
      where: { id: categoryId },
      select: { updatedAt: true },
    });

    const renamed = await updateCategory({
      id: categoryId,
      name: `${MARK} collection, renamed`,
      slug: `${MARK}-collection`,
      description: null,
      imageUrl: null,
      imageAlt: null,
      position: 900,
      isActive: true,
      seoTitle: null,
      seoDescription: null,
      expectedUpdatedAt: categoryBefore.updatedAt,
    });
    check("a collection is updated", renamed.ok);

    const staleCategory = await updateCategory({
      id: categoryId,
      name: "Second administrator",
      slug: `${MARK}-collection`,
      description: null,
      imageUrl: null,
      imageAlt: null,
      position: 900,
      isActive: true,
      seoTitle: null,
      seoDescription: null,
      expectedUpdatedAt: categoryBefore.updatedAt,
    });
    check(
      "a stale collection write is refused too",
      !staleCategory.ok && staleCategory.code === "stale",
    );

    await setCategoryActive(categoryId, false);
    const switchedOff = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { isActive: true },
    });
    check("a collection with products in it can still be switched off", switchedOff?.isActive === false);
    check(
      "and its products are untouched",
      (await prisma.productCategory.count({ where: { categoryId } })) > 0,
    );

    const publicList = await listAdminCategories();
    check(
      "the admin list still shows it, because that is the point",
      publicList.some((row) => row.id === categoryId),
    );

    const counted = publicList.find((row) => row.id === categoryId);
    check("the admin count includes drafts", (counted?.productCount ?? 0) >= 1);

    const moved = await moveCategory(categoryId, "up");
    check("a collection can be reordered", moved.ok);

    const positions = await prisma.category.findMany({
      orderBy: { position: "asc" },
      select: { position: true },
    });
    check(
      "reordering leaves positions contiguous",
      positions.every((row, index) => row.position === index),
      positions.map((row) => row.position).join(","),
    );

    console.log("\n== the dashboard counts something real ==");

    const metrics = await getCatalogMetrics();
    check("products are counted", metrics.products.total > 0);
    check(
      "the statuses add up to the total",
      metrics.products.active + metrics.products.draft + metrics.products.archived ===
        metrics.products.total,
    );
    check("variants are counted", metrics.variants.total > 0);
    check("collections are counted", metrics.categories.total > 0);

    console.log("\n== archiving ==");

    await setProductStatus(productId, ProductStatus.ARCHIVED);
    const archived = await getAdminProduct(productId);
    check("a product archives", archived?.status === ProductStatus.ARCHIVED);
    check(
      "and the record is kept, not deleted",
      (await prisma.product.count({ where: { id: productId } })) === 1,
    );
  } finally {
    await cleanUp(created);
  }
}

function productPayload(categoryId: string) {
  return {
    name: `${MARK} dress`,
    slug: `${MARK}-dress`,
    articleNumber: `${MARK}-0001`.toUpperCase(),
    shortDescription: "A temporary product created by the admin checks.",
    description:
      "A temporary product created by pnpm check:admin. It is deleted when the script finishes.",
    careInstructions: "Machine wash cold",
    status: ProductStatus.DRAFT,
    price: 129900,
    compareAtPrice: null,
    fabric: "COTTON" as const,
    pattern: "SOLID" as const,
    fit: "RELAXED" as const,
    occasion: "EVERYDAY" as const,
    featured: false,
    newArrival: false,
    bestSeller: false,
    seasonal: false,
    seoTitle: null,
    seoDescription: null,
    primaryCategoryId: categoryId,
    additionalCategoryIds: [] as string[],
  };
}

/**
 * Remove everything this script made.
 *
 * Runs in a `finally`, so a failed assertion does not leave rows in Neon.
 * Children go first: images, inventory and memberships cascade from the
 * product, but variants are restricted by colour and size, so the product is
 * deleted whole and the collection after it.
 */
async function cleanUp(created: {
  categoryIds: string[];
  productIds: string[];
}): Promise<void> {
  console.log("\n== clean-up ==");

  const products = await prisma.product.findMany({
    where: { slug: { startsWith: MARK } },
    select: { id: true },
  });

  for (const product of [...products.map((p) => p.id), ...created.productIds]) {
    await prisma.product.deleteMany({ where: { id: product } });
  }

  const categories = await prisma.category.findMany({
    where: { slug: { startsWith: MARK } },
    select: { id: true },
  });

  for (const category of [...categories.map((c) => c.id), ...created.categoryIds]) {
    await prisma.category.deleteMany({ where: { id: category } });
  }

  const leftoverProducts = await prisma.product.count({
    where: { slug: { startsWith: MARK } },
  });
  const leftoverCategories = await prisma.category.count({
    where: { slug: { startsWith: MARK } },
  });
  const leftoverVariants = await prisma.productVariant.count({
    where: { sku: { contains: MARK.toUpperCase() } },
  });

  check("no test products left behind", leftoverProducts === 0, String(leftoverProducts));
  check("no test collections left behind", leftoverCategories === 0, String(leftoverCategories));
  check("no test variants left behind", leftoverVariants === 0, String(leftoverVariants));
}

async function main(): Promise<void> {
  checkOffline();

  if (!process.env.DATABASE_URL?.trim()) {
    console.log(
      [
        "",
        "  The database-backed admin checks were skipped: no DATABASE_URL.",
        "",
        "  Set it in .env.local, then run:",
        "    pnpm db:migrate",
        "    pnpm db:seed",
        "    pnpm check:admin",
        "",
      ].join("\n"),
    );
    return;
  }

  await checkDatabase();
}

main()
  .then(async () => {
    if (process.env.DATABASE_URL?.trim()) {
      await prisma.$disconnect().catch(() => undefined);
    }

    console.log(
      `\n${failed === 0 ? "OK" : "FAILED"}: ${passed} passed, ${failed} failed\n`,
    );

    if (failed > 0) {
      process.exitCode = 1;
    }
  })
  .catch(async (error: unknown) => {
    if (process.env.DATABASE_URL?.trim()) {
      await prisma.$disconnect().catch(() => undefined);
    }

    console.error(
      `Admin checks failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  });
