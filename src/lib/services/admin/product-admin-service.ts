import "server-only";

import {
  adminPageSize,
  type AdminProductQuery,
} from "@/lib/admin/product-admin-query";
import type {
  CreateProductInput,
  UpdateProductInput,
} from "@/lib/validations/catalog-admin";
import { ProductStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/client";
import { fail, ok, STALE_MESSAGE, type AdminResult } from "./admin-result";

/**
 * Managing the catalogue.
 *
 * The write counterpart to `lib/services/product-service.ts`, which is the
 * storefront's read path. They are separate files for one reason: the public
 * service exists to make draft and archived products unreachable, and this one
 * exists to edit them. Folding "sometimes show drafts" into the storefront's
 * query builder would put the whole catalogue one boolean away from being
 * public.
 *
 * What they share is the schema and the database. There is one catalogue, and
 * this writes the rows the storefront reads.
 *
 * **Authorisation is not here.** It belongs to the Server Action, which is the
 * endpoint; see `lib/auth/admin-guard.ts`. A service that also authorised would
 * invite callers to assume they are safe because they called a service.
 */

/* ------------------------------------------------------------------ *
 * Reading, for admin screens
 * ------------------------------------------------------------------ */

/** A row of the admin product list. Enough to scan, not enough to edit. */
export type AdminProductRow = {
  id: string;
  name: string;
  slug: string;
  articleNumber: string;
  status: ProductStatus;
  price: number;
  compareAtPrice: number | null;
  category: { slug: string; name: string };
  image: { url: string; alt: string } | null;
  featured: boolean;
  newArrival: boolean;
  bestSeller: boolean;
  seasonal: boolean;
  updatedAt: Date;
  publishedAt: Date | null;
  /** Live variants, how many have stock, and the total units behind them. */
  stock: { variants: number; inStock: number; units: number; low: number };
};

export type AdminProductListResult = {
  products: AdminProductRow[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

const listSelect = {
  id: true,
  name: true,
  slug: true,
  articleNumber: true,
  status: true,
  price: true,
  compareAtPrice: true,
  featured: true,
  newArrival: true,
  bestSeller: true,
  seasonal: true,
  updatedAt: true,
  publishedAt: true,
  primaryCategory: { select: { slug: true, name: true } },
  images: {
    orderBy: [{ isPrimary: "desc" }, { position: "asc" }],
    take: 1,
    select: { url: true, alt: true },
  },
  // Selected rather than aggregated because Prisma cannot sum a nested
  // relation. It is bounded by the page size, not by the catalogue: twenty
  // rows of two small columns each, in the query that fetched the products.
  variants: {
    where: { isActive: true },
    select: { inventory: { select: { quantity: true, lowStockThreshold: true } } },
  },
} as const satisfies Prisma.ProductSelect;

/**
 * Build the `where` for the admin list.
 *
 * Unlike the storefront's, this has no implicit status filter: an admin list
 * that hid drafts would hide exactly the products somebody came to finish.
 */
function buildAdminWhere(query: AdminProductQuery): Prisma.ProductWhereInput {
  const where: Prisma.ProductWhereInput = {};
  const and: Prisma.ProductWhereInput[] = [];

  if (query.status) {
    where.status = query.status;
  }

  if (query.category) {
    where.categories = { some: { category: { slug: query.category } } };
  }

  if (query.search) {
    // Admin search reaches the SKU as well, because "which product is
    // PR-DR-0009-PIN-M?" is a question only an administrator asks, and it is
    // the question a picking slip or a stock count produces.
    const term = query.search;
    and.push({
      OR: [
        { name: { contains: term, mode: "insensitive" } },
        { slug: { contains: term, mode: "insensitive" } },
        { articleNumber: { contains: term, mode: "insensitive" } },
        { variants: { some: { sku: { contains: term, mode: "insensitive" } } } },
      ],
    });
  }

  switch (query.merchandising) {
    case "featured":
      where.featured = true;
      break;
    case "new":
      where.newArrival = true;
      break;
    case "bestseller":
      where.bestSeller = true;
      break;
    case "seasonal":
      where.seasonal = true;
      break;
    case "sale":
      and.push({ compareAtPrice: { not: null } });
      and.push({ compareAtPrice: { gt: prisma.product.fields.price } });
      break;
    default:
      break;
  }

  const sellable: Prisma.ProductVariantWhereInput = {
    isActive: true,
    inventory: { is: { quantity: { gt: 0 } } },
  };

  switch (query.stock) {
    case "in-stock":
      where.variants = { some: sellable };
      break;
    case "out":
      // Nothing live with stock behind it. `none` rather than a negated
      // `some`, so a product with no variants at all counts as out of stock,
      // which is what it is.
      where.variants = { none: sellable };
      break;
    case "low":
      // At or below its own threshold, but not yet gone. The comparison is
      // between two columns of the same row, which is what a field reference
      // is for; it happens in SQL, not here.
      where.variants = {
        some: {
          isActive: true,
          inventory: {
            is: {
              quantity: { gt: 0, lte: prisma.inventory.fields.lowStockThreshold },
            },
          },
        },
      };
      break;
    default:
      break;
  }

  if (and.length > 0) {
    where.AND = and;
  }

  return where;
}

/**
 * How the admin list is ordered.
 *
 * Every ordering ends with `id`, so rows with equal timestamps or prices do
 * not swap places between page one and page two, which would show one product
 * twice and skip another.
 *
 * There is deliberately **no "stock: lowest first"**. Ordering by total stock
 * means summing a related table per row, which Prisma cannot express and which
 * would need the whole filter builder rewritten in raw SQL to keep paging
 * correct. Sorting only the fetched page would be worse than not offering it:
 * it would look right and be wrong. The question it was for — what is running
 * out — is answered exactly by the `low` and `out` stock filters and by the
 * dashboard.
 */
function buildAdminOrderBy(
  sort: AdminProductQuery["sort"],
): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "created-desc":
      return [{ createdAt: "desc" }, { id: "asc" }];
    case "name-asc":
      return [{ name: "asc" }, { id: "asc" }];
    case "price-asc":
      return [{ price: "asc" }, { id: "asc" }];
    case "price-desc":
      return [{ price: "desc" }, { id: "asc" }];
    case "status-asc":
      return [{ status: "asc" }, { updatedAt: "desc" }, { id: "asc" }];
    case "stock-asc":
    case "updated-desc":
    default:
      return [{ updatedAt: "desc" }, { id: "asc" }];
  }
}

export async function listAdminProducts(
  query: AdminProductQuery,
): Promise<AdminProductListResult> {
  const where = buildAdminWhere(query);
  const orderBy = buildAdminOrderBy(query.sort);
  const requestedPage = Math.max(1, Math.trunc(query.page) || 1);

  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy,
      skip: (requestedPage - 1) * adminPageSize,
      take: adminPageSize,
      select: listSelect,
    }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / adminPageSize));
  const page = Math.min(requestedPage, pageCount);

  // Only when the requested page overshot, which is rare and costs one query.
  const pageRows =
    page === requestedPage
      ? rows
      : await prisma.product.findMany({
          where,
          orderBy,
          skip: (page - 1) * adminPageSize,
          take: adminPageSize,
          select: listSelect,
        });

  return {
    products: pageRows.map(toAdminRow),
    total,
    page,
    pageSize: adminPageSize,
    pageCount,
  };
}

function toAdminRow(
  row: Prisma.ProductGetPayload<{ select: typeof listSelect }>,
): AdminProductRow {
  let units = 0;
  let inStock = 0;
  let low = 0;

  for (const variant of row.variants) {
    const quantity = variant.inventory?.quantity ?? 0;
    const threshold = variant.inventory?.lowStockThreshold ?? 0;

    units += quantity;

    if (quantity > 0) {
      inStock += 1;
      if (quantity <= threshold) {
        low += 1;
      }
    }
  }

  const [image] = row.images;

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    articleNumber: row.articleNumber,
    status: row.status,
    price: row.price,
    compareAtPrice: row.compareAtPrice,
    category: row.primaryCategory,
    image: image ?? null,
    featured: row.featured,
    newArrival: row.newArrival,
    bestSeller: row.bestSeller,
    seasonal: row.seasonal,
    updatedAt: row.updatedAt,
    publishedAt: row.publishedAt,
    stock: { variants: row.variants.length, inStock, units, low },
  };
}

/**
 * Everything the product edit screen needs, in one query.
 *
 * Product, memberships, variants with their colour, size and stock, and every
 * photograph. The browser never issues a request per section; this is the
 * whole page's data.
 */
export const adminProductDetailSelect = {
  id: true,
  name: true,
  slug: true,
  articleNumber: true,
  shortDescription: true,
  description: true,
  careInstructions: true,
  status: true,
  publishedAt: true,
  price: true,
  compareAtPrice: true,
  fabric: true,
  pattern: true,
  fit: true,
  occasion: true,
  featured: true,
  newArrival: true,
  bestSeller: true,
  seasonal: true,
  seoTitle: true,
  seoDescription: true,
  primaryCategoryId: true,
  createdAt: true,
  updatedAt: true,
  categories: { select: { categoryId: true } },
  variants: {
    orderBy: [{ color: { position: "asc" } }, { size: { position: "asc" } }],
    select: {
      id: true,
      sku: true,
      isActive: true,
      colorId: true,
      sizeId: true,
      color: { select: { name: true, slug: true, hex: true } },
      size: { select: { code: true, name: true } },
      inventory: { select: { quantity: true, lowStockThreshold: true } },
    },
  },
  images: {
    orderBy: [{ position: "asc" }, { id: "asc" }],
    select: {
      id: true,
      url: true,
      alt: true,
      position: true,
      isPrimary: true,
      colorId: true,
      color: { select: { name: true, hex: true } },
    },
  },
} as const satisfies Prisma.ProductSelect;

export type AdminProductDetail = Prisma.ProductGetPayload<{
  select: typeof adminProductDetailSelect;
}>;

export async function getAdminProduct(
  id: string,
): Promise<AdminProductDetail | null> {
  return prisma.product.findUnique({
    where: { id },
    select: adminProductDetailSelect,
  });
}

/** The choices every product form offers: collections, colours, sizes. */
export type ProductFormOptions = {
  categories: { id: string; name: string; slug: string; isActive: boolean }[];
  colors: { id: string; name: string; slug: string; hex: string }[];
  sizes: { id: string; code: string; name: string }[];
};

export async function getProductFormOptions(): Promise<ProductFormOptions> {
  const [categories, colors, sizes] = await Promise.all([
    // Inactive collections are offered too, marked as such: a product is often
    // assigned to a collection that has not been switched on yet.
    prisma.category.findMany({
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, isActive: true },
    }),
    prisma.color.findMany({
      where: { isActive: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true, hex: true },
    }),
    prisma.size.findMany({
      where: { isActive: true },
      orderBy: [{ position: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
  ]);

  return { categories, colors, sizes };
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/**
 * Is this slug or article number free?
 *
 * Checked before the write so the admin gets a message on the right field
 * rather than a failed save. The unique indexes remain the real guarantee:
 * two administrators can pass this check at the same moment, and then the
 * database refuses the second one. Both paths produce the same message.
 */
async function findConflicts(
  slug: string,
  articleNumber: string,
  exceptId?: string,
): Promise<{ slug: boolean; articleNumber: boolean }> {
  const clashes = await prisma.product.findMany({
    where: {
      OR: [{ slug }, { articleNumber }],
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { slug: true, articleNumber: true },
  });

  return {
    slug: clashes.some((row) => row.slug === slug),
    articleNumber: clashes.some((row) => row.articleNumber === articleNumber),
  };
}

const SLUG_TAKEN =
  "Another product already uses that slug. Slugs are permanent URLs, so each one belongs to a single product.";
const ARTICLE_TAKEN = "Another product already uses that article number.";

/**
 * The full set of collections a product belongs to.
 *
 * The primary category is always a membership as well, so a product is always
 * findable under the collection its breadcrumb names. Deduplicated because the
 * form allows ticking the primary category in the additional list too, and
 * that should mean the same thing as not ticking it.
 */
function membershipIds(input: {
  primaryCategoryId: string;
  additionalCategoryIds: string[];
}): string[] {
  return [...new Set([input.primaryCategoryId, ...input.additionalCategoryIds])];
}

/** Every category id must exist, or the write would fail on a foreign key. */
async function categoriesExist(ids: string[]): Promise<boolean> {
  const found = await prisma.category.count({ where: { id: { in: ids } } });
  return found === ids.length;
}

/**
 * Create a product, its memberships and nothing else.
 *
 * Variants and photographs are added from the edit screen once the product
 * exists. That is a deliberate split: a create form that also collected
 * variants and images would be a very long form to fill in before anything is
 * saved, and the first thing an administrator wants after naming a product is
 * to see it saved.
 *
 * Both writes are one transaction, so a product never exists without the
 * collections that were chosen for it.
 */
export async function createProduct(
  input: CreateProductInput,
): Promise<AdminResult<{ id: string }>> {
  const conflicts = await findConflicts(input.slug, input.articleNumber);

  if (conflicts.slug) {
    return fail("slug-taken", SLUG_TAKEN, "slug");
  }
  if (conflicts.articleNumber) {
    return fail("article-taken", ARTICLE_TAKEN, "articleNumber");
  }

  const categoryIds = membershipIds(input);

  if (!(await categoriesExist(categoryIds))) {
    return fail(
      "invalid-reference",
      "One of the chosen collections no longer exists. Reload the page and try again.",
      "primaryCategoryId",
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    const product = await tx.product.create({
      data: {
        name: input.name,
        slug: input.slug,
        articleNumber: input.articleNumber,
        shortDescription: input.shortDescription,
        description: input.description,
        careInstructions: input.careInstructions,
        status: input.status,
        publishedAt: publicationDateFor(input.status, null),
        price: input.price,
        compareAtPrice: input.compareAtPrice,
        fabric: input.fabric,
        pattern: input.pattern,
        fit: input.fit,
        occasion: input.occasion,
        featured: input.featured,
        newArrival: input.newArrival,
        bestSeller: input.bestSeller,
        seasonal: input.seasonal,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        primaryCategoryId: input.primaryCategoryId,
      },
      select: { id: true },
    });

    await tx.productCategory.createMany({
      data: categoryIds.map((categoryId, position) => ({
        productId: product.id,
        categoryId,
        position,
      })),
    });

    return product;
  });

  return ok({ id: created.id });
}

/**
 * Update a product and replace its collections.
 *
 * **Collections are replaced, not patched.** The form submits every ticked box
 * on every save, so an unticked box means "not in this collection" — something
 * a patch has no way to express. The service deletes memberships that are no
 * longer chosen and adds the ones that are, in the same transaction as the
 * product row.
 *
 * **The write is pinned to the version the form was rendered from.** If
 * another administrator saved in between, `updateMany` matches nothing, the
 * transaction is abandoned and the caller is told to reload. Without this the
 * second save would silently discard the first one's changes, including
 * changes to fields this form never showed.
 */
export async function updateProduct(
  input: UpdateProductInput,
): Promise<AdminResult<{ id: string }>> {
  const conflicts = await findConflicts(input.slug, input.articleNumber, input.id);

  if (conflicts.slug) {
    return fail("slug-taken", SLUG_TAKEN, "slug");
  }
  if (conflicts.articleNumber) {
    return fail("article-taken", ARTICLE_TAKEN, "articleNumber");
  }

  const categoryIds = membershipIds(input);

  if (!(await categoriesExist(categoryIds))) {
    return fail(
      "invalid-reference",
      "One of the chosen collections no longer exists. Reload the page and try again.",
      "primaryCategoryId",
    );
  }

  const existing = await prisma.product.findUnique({
    where: { id: input.id },
    select: { publishedAt: true },
  });

  if (!existing) {
    return fail("not-found", "That product no longer exists.");
  }

  const stale = await prisma.$transaction(async (tx) => {
    const { count } = await tx.product.updateMany({
      // Both halves matter: the id finds the row, the timestamp proves it is
      // still the row the form was built from.
      where: { id: input.id, updatedAt: input.expectedUpdatedAt },
      data: {
        name: input.name,
        slug: input.slug,
        articleNumber: input.articleNumber,
        shortDescription: input.shortDescription,
        description: input.description,
        careInstructions: input.careInstructions,
        status: input.status,
        publishedAt: publicationDateFor(input.status, existing.publishedAt),
        price: input.price,
        compareAtPrice: input.compareAtPrice,
        fabric: input.fabric,
        pattern: input.pattern,
        fit: input.fit,
        occasion: input.occasion,
        featured: input.featured,
        newArrival: input.newArrival,
        bestSeller: input.bestSeller,
        seasonal: input.seasonal,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        primaryCategoryId: input.primaryCategoryId,
      },
    });

    if (count === 0) {
      return true;
    }

    await tx.productCategory.deleteMany({
      where: { productId: input.id, categoryId: { notIn: categoryIds } },
    });

    for (const [position, categoryId] of categoryIds.entries()) {
      await tx.productCategory.upsert({
        where: { productId_categoryId: { productId: input.id, categoryId } },
        create: { productId: input.id, categoryId, position },
        update: { position },
      });
    }

    return false;
  });

  if (stale) {
    return fail("stale", STALE_MESSAGE);
  }

  return ok({ id: input.id });
}

/**
 * The publication model, in one function.
 *
 * There is one status column and one date, and this is the only place the
 * relationship between them is decided:
 *
 * - **Publish** sets `ACTIVE` and stamps `publishedAt` **only if it is not
 *   already set**. Re-publishing something that was taken down keeps its
 *   original date, so it does not jump to the top of "newest" every time
 *   somebody toggles it.
 * - **Unpublish** sets `DRAFT` and keeps the date. It records when the piece
 *   first went live, which is still true while it is hidden.
 * - **Archive** sets `ARCHIVED` and keeps the date, for the same reason.
 *
 * Only `ACTIVE` is public. There is no second "published" boolean to disagree
 * with the status, and no third state hiding in a nullable date.
 */
function publicationDateFor(
  status: ProductStatus,
  current: Date | null,
): Date | null {
  if (status === ProductStatus.ACTIVE) {
    return current ?? new Date();
  }

  return current;
}

/** Publish, unpublish or archive, without touching anything else. */
export async function setProductStatus(
  id: string,
  status: ProductStatus,
): Promise<AdminResult<{ id: string; slug: string; status: ProductStatus }>> {
  const existing = await prisma.product.findUnique({
    where: { id },
    select: { publishedAt: true, slug: true },
  });

  if (!existing) {
    return fail("not-found", "That product no longer exists.");
  }

  const updated = await prisma.product.update({
    where: { id },
    data: { status, publishedAt: publicationDateFor(status, existing.publishedAt) },
    select: { id: true, slug: true, status: true },
  });

  return ok(updated);
}
