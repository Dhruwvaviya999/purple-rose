"use client";

import type { Route } from "next";

import {
  moveColorAction,
  setColorActiveAction,
} from "@/actions/admin/colors";
import { moveSizeAction, setSizeActiveAction } from "@/actions/admin/sizes";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmAction, QuickActionForm } from "./form-controls";

/**
 * What can be done to one colour or size from its list.
 *
 * Reorder, switch on or off, edit. There is deliberately **no delete**, and
 * that is not an omission.
 *
 * `ProductVariant.colorId` and `ProductVariant.sizeId` are both
 * `onDelete: Restrict`, as is `ProductImage.colorId`. A delete would fail on a
 * foreign key for anything in use, and for an unused row it would save one
 * record at the price of an irreversible button on a list screen. Switching
 * off does everything an administrator actually wants — the attribute stops
 * being offered for new variants and disappears from the shop filter — while
 * every existing variant, photograph and future order line keeps working, and
 * it is reversible.
 *
 * One component for both because the two lists behave identically; only the
 * actions differ, and they are passed in rather than branched on inside.
 */
export function AttributeRowActions({
  kind,
  id,
  label,
  isActive,
  usageCount,
  first,
  last,
}: {
  kind: "color" | "size";
  id: string;
  /** What to call it in a dialog: "Lavender", "XL". */
  label: string;
  isActive: boolean;
  /** Variants already cut in it. */
  usageCount: number;
  first: boolean;
  last: boolean;
}) {
  const colour = kind === "color";

  const moveAction = colour ? moveColorAction : moveSizeAction;
  const activeAction = colour ? setColorActiveAction : setSizeActiveAction;
  const editHref = (colour ? `/admin/colors/${id}` : `/admin/sizes/${id}`) as Route;
  const noun = colour ? "colour" : "size";

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
      <QuickActionForm
        action={moveAction}
        fields={{ id, direction: "up" }}
        label={<span aria-hidden="true">↑</span>}
        variant="ghost"
        disabled={first}
        title={`Move ${label} earlier`}
      />
      <QuickActionForm
        action={moveAction}
        fields={{ id, direction: "down" }}
        label={<span aria-hidden="true">↓</span>}
        variant="ghost"
        disabled={last}
        title={`Move ${label} later`}
      />

      {isActive ? (
        <ConfirmAction
          triggerLabel="Switch off"
          title={`Stop offering ${label}?`}
          description={
            <>
              It disappears from the choices when building new variants, and
              from the {noun} filter in the shop.
              {usageCount > 0 ? (
                <>
                  {" "}
                  The{" "}
                  <strong className="font-medium text-ink">
                    {usageCount} {usageCount === 1 ? "variant" : "variants"}
                  </strong>{" "}
                  already cut in it keep their stock and stay sellable, and
                  {colour ? " their photographs keep this colour" : " nothing about them changes"}.
                </>
              ) : null}{" "}
              Nothing is deleted, and switching it back on restores all of it.
            </>
          }
          confirmLabel="Switch off"
          fields={{ id, isActive: "" }}
          action={activeAction}
        />
      ) : (
        <QuickActionForm
          action={activeAction}
          fields={{ id, isActive: "on" }}
          label="Switch on"
          pendingLabel="Switching on…"
          variant="secondary"
        />
      )}

      <ButtonLink href={editHref} variant="secondary" size="sm">
        Edit
        <span className="sr-only"> {label}</span>
      </ButtonLink>
    </div>
  );
}
