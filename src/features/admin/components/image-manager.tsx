"use client";

import { useActionState, useState } from "react";
import Image from "next/image";

import {
  createImageAction,
  deleteImageAction,
  moveImageAction,
  updateImageAction,
} from "@/actions/admin/images";
import { idleAdminAction } from "@/features/admin/action-state";
import { allowedImageHostList } from "@/config/images";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminEmptyState, AdminPanel } from "./admin-ui";
import {
  ActionFeedback,
  ConfirmAction,
  QuickActionForm,
  SubmitButton,
  controlClassName,
} from "./form-controls";

/**
 * Product photography.
 *
 * URLs, not uploads. There is no Cloudinary, S3 or Blob in this phase: an
 * administrator supplies an address on an approved host, describes it, says
 * which colour it is of, and puts it in order.
 *
 * ## The colour association is the point
 *
 * A photograph either belongs to one colour or is shared by every colour, and
 * that single choice is what makes a swatch change the gallery on the product
 * page. So it is a visible, labelled control at the top of each row with the
 * consequence spelled out — not a select buried at the end of a form where
 * nobody would connect it to what a shopper sees.
 *
 * ## Order is stored, not remembered
 *
 * The arrows submit immediately and the server renumbers the whole set. React
 * state is never the running order: what the storefront shows is the
 * `position` column, and it stays contiguous whatever is added or removed.
 */

type ProductImage = {
  id: string;
  url: string;
  alt: string;
  position: number;
  isPrimary: boolean;
  colorId: string | null;
  color: { name: string; hex: string } | null;
};

type Colour = { id: string; name: string; hex: string };

export function ImageManager({
  productId,
  images,
  colours,
}: {
  productId: string;
  images: readonly ProductImage[];
  colours: readonly Colour[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <AdminPanel
      title="Photographs"
      description="Addresses on an approved host, not uploads. A photograph tied to a colour is shown when that colour is chosen; a shared one is shown for all of them."
      actions={
        <Button
          variant={adding ? "primary" : "secondary"}
          size="sm"
          onClick={() => setAdding((open) => !open)}
          aria-expanded={adding}
        >
          {adding ? "Close" : "Add photograph"}
        </Button>
      }
    >
      {adding ? (
        <AddImageForm
          productId={productId}
          colours={colours}
          onDone={() => setAdding(false)}
        />
      ) : null}

      {images.length === 0 ? (
        <AdminEmptyState
          title="No photographs yet"
          description="A product with no photograph shows a placeholder box on its card. Add at least one; the first becomes the card image."
        />
      ) : (
        <ul className="space-y-3">
          {images.map((image, index) => (
            <ImageRow
              key={image.id}
              image={image}
              colours={colours}
              first={index === 0}
              last={index === images.length - 1}
            />
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

function ImageRow({
  image,
  colours,
  first,
  last,
}: {
  image: ProductImage;
  colours: readonly Colour[];
  first: boolean;
  last: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(updateImageAction, idleAdminAction);

  return (
    <li className="rounded-control border border-line bg-canvas p-3">
      <div className="flex flex-wrap items-start gap-3">
        <span className="relative size-16 shrink-0 overflow-hidden rounded-control bg-surface">
          <Image
            src={image.url}
            alt=""
            aria-hidden="true"
            fill
            sizes="64px"
            className="object-cover"
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            {image.color ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line-strong px-2 py-0.5 font-sans text-xs text-ink">
                <span
                  aria-hidden="true"
                  style={{ backgroundColor: image.color.hex }}
                  className="size-3 rounded-full ring-1 ring-inset ring-ink-950/15"
                />
                {image.color.name}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full border border-line-strong px-2 py-0.5 font-sans text-xs text-ink-muted">
                Shared by every colour
              </span>
            )}

            {image.isPrimary ? (
              <span className="inline-flex items-center rounded-full bg-brand-soft px-2 py-0.5 font-sans text-xs font-medium text-brand-strong ring-1 ring-inset ring-brand/30">
                Card image
              </span>
            ) : null}
          </p>

          <p className="mt-1 break-all font-sans text-xs text-ink-subtle">
            {image.alt}
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          <QuickActionForm
            action={moveImageAction}
            fields={{ id: image.id, direction: "up" }}
            label={<span aria-hidden="true">↑</span>}
            variant="ghost"
            disabled={first}
            title="Move earlier in the gallery"
          />
          <QuickActionForm
            action={moveImageAction}
            fields={{ id: image.id, direction: "down" }}
            label={<span aria-hidden="true">↓</span>}
            variant="ghost"
            disabled={last}
            title="Move later in the gallery"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing((open) => !open)}
            aria-expanded={editing}
          >
            {editing ? "Close" : "Edit"}
          </Button>
          <ConfirmAction
            triggerLabel="Remove"
            title="Remove this photograph?"
            description={
              <>
                It is deleted from the product and{" "}
                <strong className="font-medium text-ink">cannot be undone</strong>
                . The file itself is untouched wherever it is hosted, so you can
                add the same address again.
                {image.isPrimary
                  ? " It is currently the card image; the next photograph in order takes over."
                  : null}
              </>
            }
            confirmLabel="Remove photograph"
            pendingLabel="Removing…"
            fields={{ id: image.id }}
            action={deleteImageAction}
            destructive
          />
        </div>
      </div>

      {/* Named so a screen reader hears the arrows in context rather than as
          two unlabelled buttons. */}
      <p className="sr-only">
        Photograph {image.position + 1} in the gallery.
      </p>

      {editing ? (
        <form action={formAction} className="mt-3 rounded-control bg-surface p-3">
          <input type="hidden" name="id" value={image.id} />
          <ImageFields image={image} colours={colours} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <ActionFeedback state={state} className="min-w-0 flex-1" />
            <SubmitButton size="sm">Save photograph</SubmitButton>
          </div>
        </form>
      ) : null}
    </li>
  );
}

function AddImageForm({
  productId,
  colours,
  onDone,
}: {
  productId: string;
  colours: readonly Colour[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(createImageAction, idleAdminAction);

  return (
    <form
      action={formAction}
      className="mb-4 rounded-control border border-line-strong bg-surface p-4"
    >
      <input type="hidden" name="productId" value={productId} />
      <ImageFields colours={colours} errors={state.fieldErrors} />

      <ActionFeedback state={state} className="mt-3" />

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton size="sm" pendingLabel="Adding…">
          Add photograph
        </SubmitButton>
      </div>
    </form>
  );
}

/** The fields an image has, shared by the add and edit forms. */
function ImageFields({
  image,
  colours,
  errors,
}: {
  image?: ProductImage;
  colours: readonly Colour[];
  errors?: Record<string, string>;
}) {
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="mb-1 block font-sans text-xs font-medium text-ink-muted">
          Image URL
        </span>
        <Input
          name="url"
          type="url"
          defaultValue={image?.url}
          required
          maxLength={2048}
          placeholder="https://…"
          aria-describedby="image-url-hint"
        />
        <span
          id="image-url-hint"
          className="mt-1 block font-sans text-xs leading-relaxed text-ink-subtle"
        >
          An https address on an approved host ({allowedImageHostList}). Other
          hosts are refused here because the shop cannot render them, and a
          product page failing is worse than this field failing.
        </span>
        {errors?.url ? (
          <span className="mt-1 block font-sans text-xs font-medium text-brand-strong">
            {errors.url}
          </span>
        ) : null}
      </label>

      <label className="block">
        <span className="mb-1 block font-sans text-xs font-medium text-ink-muted">
          Alt text
        </span>
        <Input
          name="alt"
          defaultValue={image?.alt}
          required
          maxLength={280}
          placeholder="Poppy Cotton Sundress in ivory, front view"
          aria-describedby="image-alt-hint"
        />
        <span
          id="image-alt-hint"
          className="mt-1 block font-sans text-xs leading-relaxed text-ink-subtle"
        >
          Describe the garment, for anyone who cannot see the photograph.
          &ldquo;Product image&rdquo; tells them nothing.
        </span>
        {errors?.alt ? (
          <span className="mt-1 block font-sans text-xs font-medium text-brand-strong">
            {errors.alt}
          </span>
        ) : null}
      </label>

      <label className="block">
        <span className="mb-1 block font-sans text-xs font-medium text-ink-muted">
          Which colour is this?
        </span>
        <select
          name="colorId"
          defaultValue={image?.colorId ?? ""}
          className={controlClassName}
          aria-describedby="image-colour-hint"
        >
          <option value="">Shared by every colour</option>
          {colours.map((colour) => (
            <option key={colour.id} value={colour.id}>
              {colour.name}
            </option>
          ))}
        </select>
        <span
          id="image-colour-hint"
          className="mt-1 block font-sans text-xs leading-relaxed text-ink-subtle"
        >
          Tie it to a colour and it is shown when a shopper picks that swatch.
          Leave it shared for flat lays, fabric close-ups and detail shots. Only
          colours this product is actually cut in can be chosen.
        </span>
        {errors?.colorId ? (
          <span className="mt-1 block font-sans text-xs font-medium text-brand-strong">
            {errors.colorId}
          </span>
        ) : null}
      </label>

      <label className="flex cursor-pointer items-start gap-3 rounded-control px-1 py-1.5 hover:bg-canvas">
        <input
          type="checkbox"
          name="isPrimary"
          value="on"
          defaultChecked={image?.isPrimary ?? false}
          className="mt-0.5 size-4 shrink-0 cursor-pointer accent-ink"
        />
        <span>
          <span className="block font-sans text-sm text-ink">
            Use as the card image
          </span>
          <span className="mt-0.5 block font-sans text-xs leading-relaxed text-ink-subtle">
            The one shown in the grid and shared as the social preview. Choosing
            this clears it from whichever photograph has it now, so a product
            only ever has one.
          </span>
        </span>
      </label>
    </div>
  );
}
