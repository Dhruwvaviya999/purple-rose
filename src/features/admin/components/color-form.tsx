"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import { createColorAction, updateColorAction } from "@/actions/admin/colors";
import {
  idleAdminAction,
  type AdminActionState,
} from "@/features/admin/action-state";
import { FormSection } from "./admin-ui";
import {
  ActionFeedback,
  AdminCheckbox,
  SubmitButton,
  TextField,
} from "./form-controls";

/**
 * The colour form, for both creating and editing.
 *
 * One component rather than two: the fields and their rules are identical and
 * only the action differs. Same arrangement as the product and collection
 * forms, so the three read the same way.
 *
 * Two things here are not just form plumbing.
 *
 * **The swatch is previewed live**, next to the field, because a hex code is
 * unreadable and getting it wrong is silent — `#a87bc9` and `#a87bd9` look
 * identical as text and different on a product page. The preview is the only
 * way to know what was typed is what was meant.
 *
 * **The slug follows the name only while creating.** A colour slug is a live
 * URL: the shop's colour filter carries it (`?colour=dusty-plum`). Re-deriving
 * it when a colour is renamed would break every filtered link anyone has
 * shared, so on an existing colour the two are completely independent.
 */

type ColorFormProps = {
  color?: {
    id: string;
    name: string;
    slug: string;
    hex: string;
    position: number;
    isActive: boolean;
    updatedAt: Date;
    variantCount: number;
  };
  nextPosition?: number;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Is this something the preview can render? Mirrors `hexColorSchema`. */
function isRenderableHex(value: string): boolean {
  return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

export function ColorForm({ color, nextPosition = 0 }: ColorFormProps) {
  const editing = color !== undefined;

  const [state, formAction] = useActionState<AdminActionState, FormData>(
    editing ? updateColorAction : createColorAction,
    idleAdminAction,
  );

  const errors = state.fieldErrors ?? {};
  const submitted = state.values ?? {};

  const value = (name: string, fallback: string | null | undefined): string =>
    submitted[name] ?? fallback ?? "";

  const [slug, setSlug] = useState(color?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(editing);
  const [hex, setHex] = useState(value("hex", color?.hex) || "#");

  return (
    <form action={formAction} className="space-y-5">
      {editing ? (
        <>
          <input type="hidden" name="id" value={color.id} />
          {/* Pins the write to the version this form was rendered from. */}
          <input
            type="hidden"
            name="expectedUpdatedAt"
            value={color.updatedAt.toISOString()}
          />
        </>
      ) : null}

      <ActionFeedback state={state} />

      <FormSection
        title="The colour"
        description="Shared by every product cut in it, so the name, the spelling and the swatch are the same everywhere."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Name"
            name="name"
            required
            maxLength={60}
            defaultValue={value("name", color?.name)}
            error={errors.name}
            hint="What a shopper reads, and what a screen reader announces. Lavender, Dusty plum."
            onChange={
              editing || slugTouched ? undefined : (next) => setSlug(slugify(next))
            }
          />

          <div className="space-y-1.5">
            <label
              htmlFor="color-slug"
              className="block font-sans text-sm font-medium text-ink"
            >
              Slug
              <span className="text-brand" aria-hidden="true">
                {" "}
                *
              </span>
              <span className="sr-only"> (required)</span>
            </label>
            <div className="flex items-center gap-2">
              <span className="shrink-0 font-sans text-sm text-ink-subtle">
                ?colour=
              </span>
              <input
                id="color-slug"
                name="slug"
                value={submitted.slug ?? slug}
                onChange={(event) => {
                  setSlug(event.target.value);
                  setSlugTouched(true);
                }}
                required
                maxLength={60}
                aria-invalid={errors.slug ? true : undefined}
                aria-describedby="color-slug-hint"
                className="block w-full rounded-control border border-line-strong bg-canvas px-3 py-2.5 font-sans text-sm text-ink transition-colors focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            </div>
            <p
              id="color-slug-hint"
              className="font-sans text-xs leading-relaxed text-ink-subtle"
            >
              {editing
                ? "This is a live URL — the shop's colour filter carries it. Changing it breaks filtered links already shared."
                : "Suggested from the name until you edit it. It becomes the value the shop filter uses."}
            </p>
            {errors.slug ? (
              <p className="font-sans text-xs font-medium leading-relaxed text-brand-strong">
                {errors.slug}
              </p>
            ) : null}
          </div>
        </div>

        <HexField
          value={hex}
          onChange={setHex}
          error={errors.hex}
          name={value("name", color?.name) || "this colour"}
        />
      </FormSection>

      <FormSection
        title="Placement"
        description="Where it sits in the swatch row on a product page, and in the shop's colour filter."
      >
        <TextField
          label="Position"
          name="position"
          required
          inputMode="numeric"
          defaultValue={value("position", String(color?.position ?? nextPosition))}
          error={errors.position}
          hint="Lower comes first. The list screen has arrows for reordering, which is usually easier than typing numbers."
        />

        <AdminCheckbox
          name="isActive"
          label="Offered for new variants"
          description={
            editing && color.variantCount > 0
              ? `Switching this off removes it from the choices when building variants and from the shop's colour filter. The ${color.variantCount} ${color.variantCount === 1 ? "variant" : "variants"} already cut in it keep their stock and stay sellable.`
              : "Off means it is not offered when building variants and does not appear in the shop's colour filter. Nothing already using it is affected."
          }
          defaultChecked={color?.isActive ?? true}
        />
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link
          href="/admin/colors"
          className="inline-block py-1 font-sans text-sm text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel={editing ? "Saving…" : "Creating…"}>
          {editing ? "Save changes" : "Create colour"}
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * The hex field, with the swatch it will produce.
 *
 * A native colour picker sits beside the text input rather than replacing it:
 * the picker is how somebody chooses a colour they can see, and the text field
 * is how somebody pastes the exact value from a brand sheet. The two are bound
 * to the same state, so either works and both agree.
 *
 * The preview carries a text label as well as the fill. A square of colour
 * with no name tells a screen reader user nothing, which is the whole reason
 * colour is never the only channel anywhere in this application.
 */
function HexField({
  value,
  onChange,
  error,
  name,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  name: string;
}) {
  const renderable = isRenderableHex(value);

  return (
    <div className="space-y-1.5">
      <label
        htmlFor="color-hex"
        className="block font-sans text-sm font-medium text-ink"
      >
        Hex value
        <span className="text-brand" aria-hidden="true">
          {" "}
          *
        </span>
        <span className="sr-only"> (required)</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <input
          id="color-hex"
          name="hex"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          maxLength={7}
          spellCheck={false}
          placeholder="#a87bc9"
          aria-invalid={error ? true : undefined}
          aria-describedby="color-hex-hint"
          className="w-40 rounded-control border border-line-strong bg-canvas px-3 py-2.5 font-mono text-sm text-ink transition-colors focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
        />

        <label className="flex items-center gap-2">
          <span className="sr-only">Pick {name} visually</span>
          <input
            type="color"
            value={renderable ? expand(value) : "#000000"}
            onChange={(event) => onChange(event.target.value)}
            className="size-10 cursor-pointer rounded-control border border-line-strong bg-canvas p-1"
          />
        </label>

        {/* The preview. Named in text, so it is never a square of colour with
            nothing to announce. */}
        <span className="flex items-center gap-2 rounded-control border border-line-strong bg-surface px-3 py-2">
          <span
            aria-hidden="true"
            style={renderable ? { backgroundColor: expand(value) } : undefined}
            className={`size-6 rounded-full ring-1 ring-inset ring-ink-950/15 ${renderable ? "" : "bg-surface-strong"}`}
          />
          <span className="font-sans text-xs text-ink-muted">
            {renderable ? `Preview of ${name}` : "Not a hex colour yet"}
          </span>
        </span>
      </div>

      <p
        id="color-hex-hint"
        className="font-sans text-xs leading-relaxed text-ink-subtle"
      >
        Six hex digits, for example <code className="font-mono">#a87bc9</code>.
        Three are accepted and expanded. This is rendered as a swatch and
        nothing else, so no other CSS colour form is allowed.
      </p>

      {error ? (
        <p className="font-sans text-xs font-medium leading-relaxed text-brand-strong">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** `#abc` to `#aabbcc`, so the native picker gets a value it understands. */
function expand(value: string): string {
  const trimmed = value.trim().toLowerCase();

  if (trimmed.length !== 4) {
    return trimmed;
  }

  return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
}
