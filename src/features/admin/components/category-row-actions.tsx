"use client";

import {
  moveCategoryAction,
  setCategoryActiveAction,
} from "@/actions/admin/categories";
import type { Route } from "next";

import { ButtonLink } from "@/components/ui/button";
import { ConfirmAction, QuickActionForm } from "./form-controls";

/**
 * What can be done to one collection from the list.
 *
 * Reorder, switch on or off, edit. There is deliberately **no delete.**
 *
 * Deleting a collection that products point at would fail on a foreign key,
 * and deleting an empty one to save a row is not worth an irreversible button
 * on a list screen. Switching it off does everything an administrator actually
 * wants — it disappears from the navigation, the tiles, the filter panel and
 * the sitemap — while every membership stays intact, so switching it back on
 * restores exactly what was there.
 *
 * Switching off is confirmed, because its effect reaches the whole storefront
 * and the dialog is where the one surprising part can be said: the products
 * stay in the shop.
 */
export function CategoryRowActions({
  id,
  name,
  isActive,
  productCount,
  first,
  last,
}: {
  id: string;
  name: string;
  isActive: boolean;
  productCount: number;
  first: boolean;
  last: boolean;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <QuickActionForm
        action={moveCategoryAction}
        fields={{ id, direction: "up" }}
        label={<span aria-hidden="true">↑</span>}
        variant="ghost"
        disabled={first}
        title={`Move ${name} earlier`}
      />
      <QuickActionForm
        action={moveCategoryAction}
        fields={{ id, direction: "down" }}
        label={<span aria-hidden="true">↓</span>}
        variant="ghost"
        disabled={last}
        title={`Move ${name} later`}
      />

      {isActive ? (
        <ConfirmAction
          triggerLabel="Switch off"
          title={`Switch ${name} off?`}
          description={
            <>
              It disappears from the shop navigation, the footer, the home page
              tiles, the category filter and the sitemap.
              {productCount > 0 ? (
                <>
                  {" "}
                  The{" "}
                  <strong className="font-medium text-ink">
                    {productCount}{" "}
                    {productCount === 1 ? "product" : "products"}
                  </strong>{" "}
                  in it stay exactly where they are and remain in the shop —
                  they are simply no longer reachable through this collection.
                </>
              ) : null}{" "}
              Nothing is deleted, and switching it back on restores all of it.
            </>
          }
          confirmLabel="Switch off"
          fields={{ id, isActive: "" }}
          action={setCategoryActiveAction}
        />
      ) : (
        <QuickActionForm
          action={setCategoryActiveAction}
          fields={{ id, isActive: "on" }}
          label="Switch on"
          pendingLabel="Switching on…"
          variant="secondary"
        />
      )}

      <ButtonLink href={`/admin/categories/${id}` as Route} variant="secondary" size="sm">
        Edit
        <span className="sr-only"> {name}</span>
      </ButtonLink>
    </div>
  );
}
