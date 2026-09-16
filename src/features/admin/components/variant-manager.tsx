"use client";

import { useActionState, useMemo, useState } from "react";

import {
  createVariantAction,
  createVariantsAction,
  setVariantActiveAction,
  updateVariantAction,
} from "@/actions/admin/variants";
import { idleAdminAction } from "@/features/admin/action-state";
import { suggestSku } from "@/lib/admin/sku";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminEmptyState, ActivePill, AdminPanel } from "./admin-ui";
import {
  ActionFeedback,
  ConfirmAction,
  QuickActionForm,
  SubmitButton,
  controlClassName,
} from "./form-controls";

/**
 * Variants and their stock, on the product edit screen.
 *
 * A variant is this product in one colour in one size. It is the row stock
 * hangs off and the row a future order line will name, which is why nothing
 * here deletes: a withdrawn variant keeps its SKU, its stock and its place,
 * and disappears from the shop because every public query filters on
 * `isActive`.
 *
 * ## Why there is a generator
 *
 * Fashion comes in a grid. Three colours by five sizes is fifteen rows, and
 * typing fifteen SKUs by hand is how a SKU gets a typo. So the generator
 * produces the combinations, suggests a SKU and stock for each using the same
 * rule the seed uses, and puts them in an editable table.
 *
 * **Nothing is written until the table is submitted.** What is saved is what
 * is on screen, edited or not, and the whole batch is one transaction — a
 * product with an arbitrary subset of its size run and no record of which rows
 * were meant to exist is worse than a failure.
 *
 * Colour and size are not editable on an existing variant. Changing either
 * would quietly turn one sellable thing into a different one while keeping its
 * identity and its stock. To sell a different combination, add a variant and
 * withdraw this one.
 */

type Colour = { id: string; name: string; slug: string; hex: string };
type Size = { id: string; code: string; name: string };

type Variant = {
  id: string;
  sku: string;
  isActive: boolean;
  colorId: string;
  sizeId: string;
  color: { name: string; slug: string; hex: string };
  size: { code: string; name: string };
  inventory: { quantity: number; lowStockThreshold: number } | null;
};

export function VariantManager({
  productId,
  articleNumber,
  variants,
  colours,
  sizes,
}: {
  productId: string;
  articleNumber: string;
  variants: readonly Variant[];
  colours: readonly Colour[];
  sizes: readonly Size[];
}) {
  const [mode, setMode] = useState<"none" | "single" | "bulk">("none");

  /** Combinations already on the product, live or withdrawn. */
  const taken = useMemo(
    () => new Set(variants.map((variant) => `${variant.colorId}/${variant.sizeId}`)),
    [variants],
  );

  return (
    <AdminPanel
      title="Variants and stock"
      description="Each row is a sellable combination with its own SKU and its own stock. Withdrawing one hides it from the shop and keeps everything about it."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button
            variant={mode === "single" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setMode(mode === "single" ? "none" : "single")}
            aria-expanded={mode === "single"}
          >
            Add one
          </Button>
          <Button
            variant={mode === "bulk" ? "primary" : "secondary"}
            size="sm"
            onClick={() => setMode(mode === "bulk" ? "none" : "bulk")}
            aria-expanded={mode === "bulk"}
          >
            Generate a grid
          </Button>
        </div>
      }
    >
      {mode === "single" ? (
        <SingleVariantForm
          productId={productId}
          articleNumber={articleNumber}
          colours={colours}
          sizes={sizes}
          taken={taken}
          onDone={() => setMode("none")}
        />
      ) : null}

      {mode === "bulk" ? (
        <BulkVariantForm
          productId={productId}
          articleNumber={articleNumber}
          colours={colours}
          sizes={sizes}
          taken={taken}
          onDone={() => setMode("none")}
        />
      ) : null}

      {variants.length === 0 ? (
        <AdminEmptyState
          title="No variants yet"
          description="A product with no variants cannot be bought and shows as out of stock. Add the colours and sizes it is cut in."
        />
      ) : (
        <ul className="divide-y divide-line">
          {variants.map((variant) => (
            <VariantRow key={variant.id} variant={variant} />
          ))}
        </ul>
      )}
    </AdminPanel>
  );
}

/** One variant: its identity, its stock, and what can be done to it. */
function VariantRow({ variant }: { variant: Variant }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useActionState(updateVariantAction, idleAdminAction);

  const quantity = variant.inventory?.quantity ?? 0;
  const threshold = variant.inventory?.lowStockThreshold ?? 0;
  const low = quantity > 0 && quantity <= threshold;

  return (
    <li className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            style={{ backgroundColor: variant.color.hex }}
            className="size-6 shrink-0 rounded-full ring-1 ring-inset ring-ink-950/15"
          />
          <div className="min-w-0">
            <p className="font-sans text-sm text-ink">
              {variant.color.name} · {variant.size.code}
            </p>
            <p className="font-sans text-xs text-ink-subtle">{variant.sku}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="font-sans text-xs tabular-nums text-ink-muted">
            {/* Stated in words as well as counted, so stock health never
                depends on noticing a colour. */}
            <span
              className={
                quantity === 0
                  ? "font-medium text-ink"
                  : low
                    ? "font-medium text-brand-strong"
                    : "text-ink-muted"
              }
            >
              {quantity === 0 ? "Out of stock" : low ? `Low: ${quantity}` : `${quantity} in stock`}
            </span>
            <span className="text-ink-subtle"> · threshold {threshold}</span>
          </span>

          <ActivePill active={variant.isActive} activeLabel="Sellable" inactiveLabel="Withdrawn" />

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEditing((open) => !open)}
            aria-expanded={editing}
          >
            {editing ? "Close" : "Edit"}
          </Button>

          {variant.isActive ? (
            <ConfirmAction
              triggerLabel="Withdraw"
              title={`Withdraw ${variant.color.name} ${variant.size.code}?`}
              description={
                <>
                  It disappears from the shop immediately and cannot be bought.
                  Its SKU, its stock and its place in the size run are all kept,
                  and you can restore it here at any time. Nothing is deleted.
                </>
              }
              confirmLabel="Withdraw variant"
              fields={{ id: variant.id, isActive: "" }}
              action={setVariantActiveAction}
            />
          ) : (
            <QuickActionForm
              action={setVariantActiveAction}
              fields={{ id: variant.id, isActive: "on" }}
              label="Restore"
              pendingLabel="Restoring…"
              variant="secondary"
            />
          )}
        </div>
      </div>

      {editing ? (
        <form action={formAction} className="mt-3 rounded-control bg-surface p-3">
          <input type="hidden" name="id" value={variant.id} />
          {/* Kept as it is unless the withdraw control changes it. */}
          <input
            type="hidden"
            name="isActive"
            value={variant.isActive ? "on" : ""}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block font-sans text-xs font-medium text-ink-muted">
                SKU
              </span>
              <Input name="sku" defaultValue={variant.sku} required maxLength={48} />
            </label>
            <label className="block">
              <span className="mb-1 block font-sans text-xs font-medium text-ink-muted">
                Quantity
              </span>
              <Input
                name="quantity"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                defaultValue={quantity}
                required
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-sans text-xs font-medium text-ink-muted">
                Low-stock threshold
              </span>
              <Input
                name="lowStockThreshold"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                defaultValue={threshold}
                required
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <ActionFeedback state={state} className="min-w-0 flex-1" />
            <SubmitButton size="sm">Save variant</SubmitButton>
          </div>
        </form>
      ) : null}
    </li>
  );
}

/** Add a single combination. */
function SingleVariantForm({
  productId,
  articleNumber,
  colours,
  sizes,
  taken,
  onDone,
}: {
  productId: string;
  articleNumber: string;
  colours: readonly Colour[];
  sizes: readonly Size[];
  taken: ReadonlySet<string>;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(createVariantAction, idleAdminAction);
  const [colourId, setColourId] = useState(colours[0]?.id ?? "");
  const [sizeId, setSizeId] = useState(sizes[0]?.id ?? "");

  const colour = colours.find((entry) => entry.id === colourId);
  const size = sizes.find((entry) => entry.id === sizeId);
  const exists = taken.has(`${colourId}/${sizeId}`);

  const sku =
    colour && size ? suggestSku(articleNumber, colour.slug, size.code) : "";

  return (
    <form
      action={formAction}
      className="mb-4 rounded-control border border-line-strong bg-surface p-4"
    >
      <input type="hidden" name="productId" value={productId} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="block">
          <span className="mb-1 block font-sans text-xs font-medium text-ink-muted">
            Colour
          </span>
          <select
            name="colorId"
            value={colourId}
            onChange={(event) => setColourId(event.target.value)}
            className={controlClassName}
            required
          >
            {colours.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block font-sans text-xs font-medium text-ink-muted">
            Size
          </span>
          <select
            name="sizeId"
            value={sizeId}
            onChange={(event) => setSizeId(event.target.value)}
            className={controlClassName}
            required
          >
            {sizes.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.code}
              </option>
            ))}
          </select>
        </label>

        <label className="block lg:col-span-1">
          <span className="mb-1 block font-sans text-xs font-medium text-ink-muted">
            SKU
          </span>
          {/* Keyed on the suggestion so it follows the colour and size until
              somebody types their own, at which point it stops moving. */}
          <Input key={sku} name="sku" defaultValue={sku} required maxLength={48} />
        </label>

        <label className="block">
          <span className="mb-1 block font-sans text-xs font-medium text-ink-muted">
            Quantity
          </span>
          <Input name="quantity" type="number" min={0} step={1} defaultValue={0} required />
        </label>

        <label className="block">
          <span className="mb-1 block font-sans text-xs font-medium text-ink-muted">
            Low-stock threshold
          </span>
          <Input
            name="lowStockThreshold"
            type="number"
            min={0}
            step={1}
            defaultValue={3}
            required
          />
        </label>
      </div>

      {exists ? (
        <p role="alert" className="mt-3 font-sans text-xs font-medium text-brand-strong">
          This product already has {colour?.name} in {size?.code}. Edit or
          restore the existing variant instead.
        </p>
      ) : null}

      <ActionFeedback state={state} className="mt-3" />

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <SubmitButton size="sm" pendingLabel="Adding…">
          Add variant
        </SubmitButton>
      </div>
    </form>
  );
}

/** Generate a colour-by-size grid, review it, then save it. */
function BulkVariantForm({
  productId,
  articleNumber,
  colours,
  sizes,
  taken,
  onDone,
}: {
  productId: string;
  articleNumber: string;
  colours: readonly Colour[];
  sizes: readonly Size[];
  taken: ReadonlySet<string>;
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(createVariantsAction, idleAdminAction);
  const [pickedColours, setPickedColours] = useState<string[]>([]);
  const [pickedSizes, setPickedSizes] = useState<string[]>([]);
  const [rows, setRows] = useState<
    | null
    | {
        colorId: string;
        sizeId: string;
        colourName: string;
        sizeCode: string;
        sku: string;
      }[]
  >(null);

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id];
  }

  /** Build the combinations, skipping any the product already has. */
  function generate() {
    const generated = pickedColours.flatMap((colorId) =>
      pickedSizes
        .filter((sizeId) => !taken.has(`${colorId}/${sizeId}`))
        .map((sizeId) => {
          const colour = colours.find((entry) => entry.id === colorId);
          const size = sizes.find((entry) => entry.id === sizeId);

          return {
            colorId,
            sizeId,
            colourName: colour?.name ?? "",
            sizeCode: size?.code ?? "",
            sku:
              colour && size
                ? suggestSku(articleNumber, colour.slug, size.code)
                : "",
          };
        }),
    );

    setRows(generated);
  }

  const skipped =
    pickedColours.length * pickedSizes.length - (rows?.length ?? 0);

  return (
    <div className="mb-4 rounded-control border border-line-strong bg-surface p-4">
      <fieldset>
        <legend className="font-sans text-xs font-medium text-ink-muted">
          Colours
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {colours.map((colour) => (
            <TogglePill
              key={colour.id}
              label={colour.name}
              hex={colour.hex}
              pressed={pickedColours.includes(colour.id)}
              onToggle={() => setPickedColours((list) => toggle(list, colour.id))}
            />
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="font-sans text-xs font-medium text-ink-muted">
          Sizes
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {sizes.map((size) => (
            <TogglePill
              key={size.id}
              label={size.code}
              pressed={pickedSizes.includes(size.id)}
              onToggle={() => setPickedSizes((list) => toggle(list, size.id))}
            />
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={generate}
          disabled={pickedColours.length === 0 || pickedSizes.length === 0}
        >
          Generate {pickedColours.length * pickedSizes.length || ""} combinations
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>

      {rows !== null ? (
        rows.length === 0 ? (
          <p role="status" className="mt-4 font-sans text-sm text-ink-muted">
            Every one of those combinations already exists on this product.
            Nothing to add.
          </p>
        ) : (
          <form action={formAction} className="mt-4">
            <input type="hidden" name="productId" value={productId} />

            <p className="font-sans text-sm text-ink">
              {rows.length} {rows.length === 1 ? "variant" : "variants"} to
              review
              {skipped > 0 ? (
                <span className="text-ink-subtle">
                  {" "}
                  · {skipped} skipped, already on this product
                </span>
              ) : null}
            </p>
            <p className="mt-1 font-sans text-xs leading-relaxed text-ink-subtle">
              Nothing is saved until you press Add. Edit anything here first.
            </p>

            <div className="mt-3 space-y-2">
              {rows.map((row, index) => (
                <div
                  key={`${row.colorId}-${row.sizeId}`}
                  className="grid gap-2 rounded-control bg-canvas p-2 sm:grid-cols-[10rem_1fr_6rem_8rem]"
                >
                  <input type="hidden" name="row.colorId" value={row.colorId} />
                  <input type="hidden" name="row.sizeId" value={row.sizeId} />

                  <span className="self-center font-sans text-sm text-ink">
                    {row.colourName} · {row.sizeCode}
                  </span>

                  <label className="block">
                    <span className="sr-only">
                      SKU for {row.colourName} {row.sizeCode}
                    </span>
                    <Input
                      name="row.sku"
                      defaultValue={row.sku}
                      required
                      maxLength={48}
                    />
                  </label>

                  <label className="block">
                    <span className="sr-only">
                      Quantity for {row.colourName} {row.sizeCode}
                    </span>
                    <Input
                      name="row.quantity"
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={0}
                      required
                      aria-label={`Quantity, row ${index + 1}`}
                    />
                  </label>

                  <label className="block">
                    <span className="sr-only">
                      Low-stock threshold for {row.colourName} {row.sizeCode}
                    </span>
                    <Input
                      name="row.lowStockThreshold"
                      type="number"
                      min={0}
                      step={1}
                      defaultValue={3}
                      required
                      aria-label={`Low-stock threshold, row ${index + 1}`}
                    />
                  </label>
                </div>
              ))}
            </div>

            <ActionFeedback state={state} className="mt-3" />

            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setRows(null)}>
                Start again
              </Button>
              <SubmitButton size="sm" pendingLabel="Adding…">
                Add {rows.length} {rows.length === 1 ? "variant" : "variants"}
              </SubmitButton>
            </div>
          </form>
        )
      ) : null}
    </div>
  );
}

/**
 * A pressable pill.
 *
 * A real `button` with `aria-pressed`, so its state is announced rather than
 * implied by a border, and it is reachable and operable from the keyboard
 * without anything being written here.
 */
function TogglePill({
  label,
  hex,
  pressed,
  onToggle,
}: {
  label: string;
  hex?: string;
  pressed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 font-sans text-sm transition-colors ${
        pressed
          ? "bg-ink text-canvas"
          : "border border-line-strong bg-canvas text-ink hover:border-ink-400"
      }`}
    >
      {hex ? (
        <span
          aria-hidden="true"
          style={{ backgroundColor: hex }}
          className="size-3.5 rounded-full ring-1 ring-inset ring-ink-950/15"
        />
      ) : null}
      {label}
    </button>
  );
}
