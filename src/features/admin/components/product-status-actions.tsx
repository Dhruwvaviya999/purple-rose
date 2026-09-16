"use client";

import { setProductStatusAction } from "@/actions/admin/products";
import { ProductStatus } from "@/generated/prisma/enums";
import { AdminPanel, formatAdminDate } from "./admin-ui";
import { ConfirmAction, QuickActionForm } from "./form-controls";

/**
 * Publish, unpublish and archive, as their own panel.
 *
 * Separate from the product form because they are a different kind of act.
 * The form saves a description; this decides whether anybody can see it, and
 * that deserves its own place, its own explanation of consequences and — for
 * the two that hide something from the shop — its own confirmation.
 *
 * It also warns before publishing something that cannot be bought. A live
 * product with no sellable variant renders as sold out, and a live product
 * with no photograph renders a placeholder box. Neither is stopped, because an
 * administrator may well be publishing deliberately ahead of stock arriving;
 * both are said plainly first.
 */
export function ProductStatusActions({
  productId,
  status,
  publishedAt,
  variantCount,
  imageCount,
}: {
  productId: string;
  status: ProductStatus;
  publishedAt: Date | null;
  variantCount: number;
  imageCount: number;
}) {
  const live = status === ProductStatus.ACTIVE;

  const warnings = [
    variantCount === 0
      ? "It has no sellable variants, so the shop will show it as sold out."
      : null,
    imageCount === 0
      ? "It has no photographs, so its card will show a placeholder box."
      : null,
  ].filter((warning): warning is string => warning !== null);

  return (
    <AdminPanel
      title="Publication"
      description={
        live
          ? "This piece is in the shop, in search, in the filters and in the sitemap."
          : "This piece is not public. It appears nowhere in the shop, in search or in the sitemap."
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-sans text-sm text-ink-muted">
          {publishedAt
            ? `First published ${formatAdminDate(publishedAt)}.`
            : "Never published."}
          {publishedAt && !live
            ? " That date is kept, so republishing does not send it back to the top of Newest."
            : null}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {live ? (
            <ConfirmAction
              triggerLabel="Unpublish"
              title="Take this piece out of the shop?"
              description={
                <>
                  It becomes a draft: hidden from the shop, from search, from
                  the filters and from the sitemap. Nothing is lost — its
                  variants, stock, photographs and publication date all stay —
                  and you can publish it again at any time.
                </>
              }
              confirmLabel="Unpublish"
              fields={{ id: productId, status: ProductStatus.DRAFT }}
              action={setProductStatusAction}
            />
          ) : (
            <QuickActionForm
              action={setProductStatusAction}
              fields={{ id: productId, status: ProductStatus.ACTIVE }}
              label="Publish"
              pendingLabel="Publishing…"
              variant="primary"
            />
          )}

          {status !== ProductStatus.ARCHIVED ? (
            <ConfirmAction
              triggerLabel="Archive"
              title="Archive this piece?"
              description={
                <>
                  Archiving is how a product is withdrawn for good. It is hidden
                  from the shop and dropped from the sitemap, and{" "}
                  <strong className="font-medium text-ink">
                    the record itself is kept
                  </strong>
                  , so a future order that referenced it still names what was
                  bought. It is reversible: you can publish it again from here.
                </>
              }
              confirmLabel="Archive"
              fields={{ id: productId, status: ProductStatus.ARCHIVED }}
              action={setProductStatusAction}
            />
          ) : null}
        </div>
      </div>

      {!live && warnings.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-line pt-3">
          {warnings.map((warning) => (
            <li
              key={warning}
              className="font-sans text-xs leading-relaxed text-ink-muted"
            >
              {/* Stated, not blocked: publishing ahead of stock is a real and
                  reasonable thing to do. */}
              Before publishing: {warning}
            </li>
          ))}
        </ul>
      ) : null}
    </AdminPanel>
  );
}
