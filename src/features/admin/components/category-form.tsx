"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import {
  createCategoryAction,
  updateCategoryAction,
} from "@/actions/admin/categories";
import {
  idleAdminAction,
  type AdminActionState,
} from "@/features/admin/action-state";
import { allowedImageHostList } from "@/config/images";
import { FormSection } from "./admin-ui";
import {
  ActionFeedback,
  AdminCheckbox,
  SubmitButton,
  TextAreaField,
  TextField,
} from "./form-controls";

/**
 * The collection form, for both creating and editing.
 *
 * Shorter than the product form and sectioned for the same reason: the fields
 * that decide what a shopper sees — the name, whether it is switched on —
 * should not be buried among SEO copy.
 *
 * The slug follows the name only while creating and only until touched, and
 * never on an existing collection. A collection slug is a live URL
 * (`/shop?category=…`), in the navigation, the footer, the home tiles and the
 * sitemap; re-deriving it on a rename would break every one of them at once.
 */

type CategoryFormProps = {
  category?: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    imageUrl: string | null;
    imageAlt: string | null;
    position: number;
    isActive: boolean;
    seoTitle: string | null;
    seoDescription: string | null;
    updatedAt: Date;
  };
  /** Where a new collection lands in the running order. */
  nextPosition?: number;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

export function CategoryForm({ category, nextPosition = 0 }: CategoryFormProps) {
  const editing = category !== undefined;

  const [state, formAction] = useActionState<AdminActionState, FormData>(
    editing ? updateCategoryAction : createCategoryAction,
    idleAdminAction,
  );

  const [slug, setSlug] = useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(editing);

  const errors = state.fieldErrors ?? {};
  const submitted = state.values ?? {};

  const value = (name: string, fallback: string | null | undefined): string =>
    submitted[name] ?? fallback ?? "";

  return (
    <form action={formAction} className="space-y-5">
      {editing ? (
        <>
          <input type="hidden" name="id" value={category.id} />
          {/* Pins the write to the version this form was built from. */}
          <input
            type="hidden"
            name="expectedUpdatedAt"
            value={category.updatedAt.toISOString()}
          />
        </>
      ) : null}

      <ActionFeedback state={state} />

      <FormSection
        title="Basic information"
        description="What the collection is called, and the URL it lives at."
      >
        <TextField
          label="Name"
          name="name"
          required
          defaultValue={value("name", category?.name)}
          error={errors.name}
          maxLength={120}
          onChange={
            editing || slugTouched ? undefined : (next) => setSlug(slugify(next))
          }
        />

        <div className="space-y-1.5">
          <label
            htmlFor="category-slug"
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
              /shop?category=
            </span>
            <input
              id="category-slug"
              name="slug"
              value={submitted.slug ?? slug}
              onChange={(event) => {
                setSlug(event.target.value);
                setSlugTouched(true);
              }}
              required
              maxLength={140}
              aria-invalid={errors.slug ? true : undefined}
              aria-describedby="category-slug-hint"
              className="block w-full rounded-control border border-line-strong bg-canvas px-3 py-2.5 font-sans text-sm text-ink transition-colors focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
          <p
            id="category-slug-hint"
            className="font-sans text-xs leading-relaxed text-ink-subtle"
          >
            {editing
              ? "This is a live URL, and it is in the navigation, the footer, the home tiles and the sitemap. Changing it breaks every link already pointing here."
              : "Suggested from the name until you edit it. It becomes a permanent URL."}
          </p>
          {errors.slug ? (
            <p className="font-sans text-xs font-medium leading-relaxed text-brand-strong">
              {errors.slug}
            </p>
          ) : null}
        </div>

        <TextAreaField
          label="Description"
          name="description"
          rows={2}
          maxLength={280}
          defaultValue={value("description", category?.description)}
          error={errors.description}
          hint="One line. Shown under the home page tile and as the heading text on a filtered listing."
        />
      </FormSection>

      <FormSection
        title="Tile photograph"
        description="Optional. A collection with no photograph simply has no home page tile; it still works everywhere else."
      >
        <TextField
          label="Image URL"
          name="imageUrl"
          type="url"
          defaultValue={value("imageUrl", category?.imageUrl)}
          error={errors.imageUrl}
          maxLength={2048}
          placeholder="https://…"
          hint={`An https address on an approved host (${allowedImageHostList}). Other hosts are refused here, because the shop cannot render them.`}
        />
        <TextField
          label="Image alt text"
          name="imageAlt"
          defaultValue={value("imageAlt", category?.imageAlt)}
          error={errors.imageAlt}
          maxLength={280}
          hint="Describe the photograph, for anyone who cannot see it. Left blank, the collection name is used."
        />
      </FormSection>

      <FormSection
        title="Placement"
        description="Where it sits in the navigation, and whether it appears at all."
      >
        <TextField
          label="Position"
          name="position"
          required
          inputMode="numeric"
          defaultValue={value("position", String(category?.position ?? nextPosition))}
          error={errors.position}
          hint="Lower comes first. The list screen has arrows for reordering, which is usually easier than typing numbers."
        />

        <AdminCheckbox
          name="isActive"
          label="Switched on"
          description="Off means hidden from the navigation, the tiles, the filter panel and the sitemap. Its products stay exactly where they are and remain in the shop."
          defaultChecked={category?.isActive ?? true}
        />
      </FormSection>

      <FormSection
        title="Search engines"
        description="Optional. Left blank, the shop falls back to the collection name and description."
      >
        <TextField
          label="SEO title"
          name="seoTitle"
          defaultValue={value("seoTitle", category?.seoTitle)}
          error={errors.seoTitle}
          maxLength={160}
        />
        <TextAreaField
          label="SEO description"
          name="seoDescription"
          rows={2}
          maxLength={320}
          defaultValue={value("seoDescription", category?.seoDescription)}
          error={errors.seoDescription}
        />
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link
          href="/admin/categories"
          className="inline-block py-1 font-sans text-sm text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel={editing ? "Saving…" : "Creating…"}>
          {editing ? "Save changes" : "Create collection"}
        </SubmitButton>
      </div>
    </form>
  );
}
