import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireAdmin } from "@/lib/auth/current-user";
import {
  getAdminProduct,
  getProductFormOptions,
} from "@/lib/services/admin/product-admin-service";
import { ProductStatus } from "@/generated/prisma/enums";
import {
  AdminPageHeader,
  StatusPill,
  formatAdminDate,
} from "@/features/admin/components/admin-ui";
import { ProductForm } from "@/features/admin/components/product-form";
import { ProductStatusActions } from "@/features/admin/components/product-status-actions";
import { VariantManager } from "@/features/admin/components/variant-manager";
import { ImageManager } from "@/features/admin/components/image-manager";

export const metadata: Metadata = { title: "Edit product" };

/**
 * Edit a product.
 *
 * **One server-side read for the whole screen.** The product, its collections,
 * its variants with their colour, size and stock, and every photograph all
 * arrive in a single query; the choices the form offers — collections, colours,
 * sizes — arrive in a second. The browser never issues a request per section,
 * and no component below here queries anything.
 *
 * The three managers are separate client components with separate Server
 * Actions, so adding a photograph does not resubmit twenty product fields and
 * a failed variant does not discard an unsaved description.
 */
export default async function EditProductPage(
  props: PageProps<"/admin/products/[id]">,
) {
  await requireAdmin("/admin/products");

  const { id } = await props.params;
  const searchParams = await props.searchParams;

  const [product, options] = await Promise.all([
    getAdminProduct(id),
    getProductFormOptions(),
  ]);

  // A product that does not exist, and an `id` that could never be one, end
  // the same way. Nothing leaks about which.
  if (!product) {
    notFound();
  }

  const justCreated = searchParams.created === "1";

  /** Only colours this product is actually cut in can own a photograph. */
  const productColours = [
    ...new Map(
      product.variants.map((variant) => [
        variant.colorId,
        {
          id: variant.colorId,
          name: variant.color.name,
          hex: variant.color.hex,
        },
      ]),
    ).values(),
  ];

  return (
    <div className="space-y-5">
      <AdminPageHeader
        title={product.name}
        breadcrumb={
          <Link
            href="/admin/products"
            className="inline-block py-1.5 font-sans text-xs text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
          >
            ← Products
          </Link>
        }
        description={`${product.articleNumber} · created ${formatAdminDate(product.createdAt)} · last changed ${formatAdminDate(product.updatedAt)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={product.status} />
            {product.status === ProductStatus.ACTIVE ? (
              <Link
                href={`/shop/${product.slug}`}
                className="inline-block py-1 font-sans text-sm text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
              >
                View in shop
              </Link>
            ) : null}
          </div>
        }
      />

      {justCreated ? (
        <p
          role="status"
          className="rounded-control border border-line-strong bg-surface px-3.5 py-2.5 font-sans text-sm text-ink"
        >
          Created. Add the colours and sizes it is cut in, and at least one
          photograph, then publish it.
        </p>
      ) : null}

      <ProductStatusActions
        productId={product.id}
        status={product.status}
        publishedAt={product.publishedAt}
        variantCount={product.variants.filter((variant) => variant.isActive).length}
        imageCount={product.images.length}
      />

      <ProductForm
        options={options}
        product={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          articleNumber: product.articleNumber,
          shortDescription: product.shortDescription,
          description: product.description,
          careInstructions: product.careInstructions,
          status: product.status,
          price: product.price,
          compareAtPrice: product.compareAtPrice,
          fabric: product.fabric,
          pattern: product.pattern,
          fit: product.fit,
          occasion: product.occasion,
          featured: product.featured,
          newArrival: product.newArrival,
          bestSeller: product.bestSeller,
          seasonal: product.seasonal,
          seoTitle: product.seoTitle,
          seoDescription: product.seoDescription,
          primaryCategoryId: product.primaryCategoryId,
          categoryIds: product.categories.map((entry) => entry.categoryId),
          updatedAt: product.updatedAt,
        }}
      />

      <VariantManager
        productId={product.id}
        articleNumber={product.articleNumber}
        variants={product.variants}
        colours={options.colors}
        sizes={options.sizes}
      />

      <ImageManager
        productId={product.id}
        images={product.images}
        colours={productColours}
      />
    </div>
  );
}
