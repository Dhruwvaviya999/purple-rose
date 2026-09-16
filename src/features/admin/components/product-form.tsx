"use client";

import { useActionState, useState } from "react";
import Link from "next/link";

import {
  createProductAction,
  updateProductAction,
} from "@/actions/admin/products";
import {
  idleAdminAction,
  type AdminActionState,
} from "@/features/admin/action-state";
import {
  fabricVocabulary,
  fitVocabulary,
  occasionVocabulary,
  patternVocabulary,
  type Vocabulary,
} from "@/lib/catalog/vocabulary";
import { paiseToRupeeInput } from "@/lib/admin/money";
import { ProductStatus } from "@/generated/prisma/enums";
import type { ProductFormOptions } from "@/lib/services/admin/product-admin-service";
import { FormSection } from "./admin-ui";
import {
  ActionFeedback,
  AdminCheckbox,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "./form-controls";

/**
 * The product form, for both creating and editing.
 *
 * One component rather than two, because the fields, their rules and their
 * explanations are identical; only the action and a couple of hidden inputs
 * differ. Two copies would drift the first time somebody added a field.
 *
 * ## Why it is sectioned
 *
 * A product has more than twenty fields. As one flat column it is a wall that
 * nobody reads, and the fields that matter — the price, whether it is live —
 * are lost among the ones that rarely change. Each `FormSection` is a real
 * `fieldset` with a `legend`, so the grouping a sighted user gets from the
 * headings is the same grouping a screen reader announces.
 *
 * ## Why so much of it is uncontrolled
 *
 * The inputs hold their own values and the form is read on submit. That is
 * what keeps a twenty-field form from re-rendering on every keystroke, and it
 * is why a validation failure does not empty it: the server echoes back what
 * was submitted and the fields are re-rendered with it.
 *
 * Only two things need React state — the slug's link to the name on a new
 * product, and the expanding SEO section — and both are local.
 *
 * ## What it does not do
 *
 * Variants and photographs are managed on the edit screen, not here. A create
 * form that also collected them would be very long to fill in before anything
 * was saved, and the first thing anybody wants after naming a product is to
 * see it saved.
 */

type ProductFormProps = {
  options: ProductFormOptions;
  /** Absent when creating. */
  product?: {
    id: string;
    name: string;
    slug: string;
    articleNumber: string;
    shortDescription: string;
    description: string;
    careInstructions: string;
    status: ProductStatus;
    price: number;
    compareAtPrice: number | null;
    fabric: string;
    pattern: string;
    fit: string;
    occasion: string;
    featured: boolean;
    newArrival: boolean;
    bestSeller: boolean;
    seasonal: boolean;
    seoTitle: string | null;
    seoDescription: string | null;
    primaryCategoryId: string;
    categoryIds: string[];
    updatedAt: Date;
  };
};

/** `COTTON_POPLIN` and friends, as `<option>`s. */
function vocabularyOptions<T extends string>(vocabulary: Vocabulary<T>) {
  return vocabulary.values.map((value) => ({
    value,
    label: vocabulary.labels[value],
  }));
}

/** A name, as a slug. Only ever a suggestion, and only for a new product. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

export function ProductForm({ options, product }: ProductFormProps) {
  const editing = product !== undefined;

  const [state, formAction] = useActionState<AdminActionState, FormData>(
    editing ? updateProductAction : createProductAction,
    idleAdminAction,
  );

  /**
   * The slug follows the name **only while creating, and only until touched.**
   *
   * A slug is a permanent URL. Re-deriving it when a live product is renamed
   * would break every link anyone has shared, every crawled result and every
   * bookmark — so on an existing product the two are completely independent,
   * and changing the slug is a deliberate act with its own warning.
   */
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(editing);

  const errors = state.fieldErrors ?? {};
  const submitted = state.values ?? {};

  /** What a field should show: what was submitted, else what was stored. */
  const value = (name: string, fallback: string | null | undefined): string =>
    submitted[name] ?? fallback ?? "";

  const categoryOptions = options.categories.map((category) => ({
    value: category.id,
    label: category.isActive ? category.name : `${category.name} (switched off)`,
  }));

  /**
   * Which collections are ticked.
   *
   * After a failed submission this is what was actually submitted, so a
   * selection is not lost to a typo in another field. `valuesFrom` joins a
   * repeated field with commas for exactly this.
   */
  const selectedAdditional = new Set(
    submitted.additionalCategoryIds !== undefined
      ? submitted.additionalCategoryIds.split(",").filter(Boolean)
      : (product?.categoryIds ?? []),
  );

  return (
    <form action={formAction} className="space-y-5">
      {editing ? (
        <>
          <input type="hidden" name="id" value={product.id} />
          {/*
            The version this form was rendered from. The service refuses to
            write if the row has moved on, so two administrators editing the
            same product cannot silently overwrite one another.
          */}
          <input
            type="hidden"
            name="expectedUpdatedAt"
            value={product.updatedAt.toISOString()}
          />
        </>
      ) : null}

      <ActionFeedback state={state} />

      <FormSection
        title="Basic information"
        description="What the piece is called and how it reads on the page."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Product name"
            name="name"
            required
            defaultValue={value("name", product?.name)}
            error={errors.name}
            maxLength={160}
            onChange={
              editing || slugTouched
                ? undefined
                : (next) => setSlug(slugify(next))
            }
          />

          <TextField
            label="Article number"
            name="articleNumber"
            required
            defaultValue={value("articleNumber", product?.articleNumber)}
            error={errors.articleNumber}
            hint="Product-level identity, printed on a swing tag. PR-DR-0001."
            maxLength={32}
          />
        </div>

        <SlugField
          value={submitted.slug ?? slug}
          onChange={(next) => {
            setSlug(next);
            setSlugTouched(true);
          }}
          error={errors.slug}
          editing={editing}
        />

        <TextAreaField
          label="Short description"
          name="shortDescription"
          required
          rows={2}
          maxLength={280}
          defaultValue={value("shortDescription", product?.shortDescription)}
          error={errors.shortDescription}
          hint="One or two sentences. Used on cards, in search results and as the meta description when no SEO description is written."
        />

        <TextAreaField
          label="Description"
          name="description"
          required
          rows={7}
          maxLength={8000}
          defaultValue={value("description", product?.description)}
          error={errors.description}
          hint="The full copy on the product page. Plain text: it is rendered as text, never as markup."
        />

        <TextField
          label="Care instructions"
          name="careInstructions"
          required
          defaultValue={value("careInstructions", product?.careInstructions)}
          error={errors.careInstructions}
          hint="Shown in the details list. Machine wash cold, line dry."
          maxLength={280}
        />
      </FormSection>

      <FormSection
        title="Classification"
        description="Where the piece sits in the shop, and the attributes shoppers filter by."
      >
        <SelectField
          label="Primary collection"
          name="primaryCategoryId"
          required
          defaultValue={value("primaryCategoryId", product?.primaryCategoryId)}
          error={errors.primaryCategoryId}
          options={categoryOptions}
          placeholder="Choose a collection"
          hint="The one shown on the card and in the breadcrumb. It is always a membership too, so the piece is findable there."
        />

        <fieldset>
          <legend className="font-sans text-sm font-medium text-ink">
            Also in these collections
          </legend>
          <p className="mb-2 mt-1 font-sans text-xs leading-relaxed text-ink-subtle">
            A piece can belong to several. A printed cotton dress is genuinely a
            cotton dress and a fresh print. Ticked boxes replace whatever was
            stored, so unticking one removes it.
          </p>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {options.categories.map((category) => (
              <AdminCheckbox
                key={category.id}
                name="additionalCategoryIds"
                value={category.id}
                label={
                  category.isActive
                    ? category.name
                    : `${category.name} (switched off)`
                }
                defaultChecked={selectedAdditional.has(category.id)}
              />
            ))}
          </div>
        </fieldset>

        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            label="Fabric"
            name="fabric"
            required
            defaultValue={value("fabric", product?.fabric)}
            error={errors.fabric}
            options={vocabularyOptions(fabricVocabulary)}
            placeholder="Choose a fabric"
          />
          <SelectField
            label="Pattern"
            name="pattern"
            required
            defaultValue={value("pattern", product?.pattern)}
            error={errors.pattern}
            options={vocabularyOptions(patternVocabulary)}
            placeholder="Choose a pattern"
          />
          <SelectField
            label="Fit"
            name="fit"
            required
            defaultValue={value("fit", product?.fit)}
            error={errors.fit}
            options={vocabularyOptions(fitVocabulary)}
            placeholder="Choose a fit"
          />
          <SelectField
            label="Occasion"
            name="occasion"
            required
            defaultValue={value("occasion", product?.occasion)}
            error={errors.occasion}
            options={vocabularyOptions(occasionVocabulary)}
            placeholder="Choose an occasion"
          />
        </div>
      </FormSection>

      <FormSection
        title="Pricing"
        description="Enter rupees. They are stored as exact whole paise, so nothing is ever a fraction of a rounding error."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Price"
            name="price"
            required
            inputMode="decimal"
            placeholder="1299"
            defaultValue={value(
              "price",
              product ? paiseToRupeeInput(product.price) : "",
            )}
            error={errors.price}
            hint="In rupees. Up to two decimal places."
          />
          <TextField
            label="Compare-at price"
            name="compareAtPrice"
            inputMode="decimal"
            placeholder="Leave blank if not reduced"
            defaultValue={value(
              "compareAtPrice",
              product?.compareAtPrice !== null && product?.compareAtPrice !== undefined
                ? paiseToRupeeInput(product.compareAtPrice)
                : "",
            )}
            error={errors.compareAtPrice}
            hint="What it used to cost. Must be higher than the price; that comparison is the whole definition of 'on sale'."
          />
        </div>
      </FormSection>

      <FormSection
        title="Merchandising"
        description="Editorial choices about what to put in front of people. None of these is a measurement: no order system exists, so nothing here is derived from what has sold."
      >
        <div className="grid gap-x-4 sm:grid-cols-2">
          <AdminCheckbox
            name="featured"
            label="Featured"
            description="Leads the default sort on the shop page."
            defaultChecked={product?.featured ?? false}
          />
          <AdminCheckbox
            name="newArrival"
            label="New arrival"
            description="Appears in the New this week rail and under New in."
            defaultChecked={product?.newArrival ?? false}
          />
          <AdminCheckbox
            name="bestSeller"
            label="Purple Rose pick"
            description="Appears in the picks rail. An editorial choice, not a sales figure."
            defaultChecked={product?.bestSeller ?? false}
          />
          <AdminCheckbox
            name="seasonal"
            label="Seasonal"
            description="Part of the current season's edit."
            defaultChecked={product?.seasonal ?? false}
          />
        </div>
      </FormSection>

      <FormSection
        title="Publication"
        description="Only live products appear in the shop, in search, in the filters or in the sitemap."
      >
        <SelectField
          label="Status"
          name="status"
          required
          defaultValue={value("status", product?.status ?? ProductStatus.DRAFT)}
          error={errors.status}
          options={[
            { value: ProductStatus.DRAFT, label: "Draft — not public" },
            { value: ProductStatus.ACTIVE, label: "Live — public" },
            { value: ProductStatus.ARCHIVED, label: "Archived — withdrawn, not public" },
          ]}
          hint="Publishing stamps the publication date the first time only, so taking a piece down and putting it back does not send it to the top of Newest."
        />
      </FormSection>

      <FormSection
        title="Search engines"
        description="Optional. Left blank, the shop falls back to the product name and the short description, which is usually the right answer."
      >
        <TextField
          label="SEO title"
          name="seoTitle"
          defaultValue={value("seoTitle", product?.seoTitle)}
          error={errors.seoTitle}
          maxLength={160}
        />
        <TextAreaField
          label="SEO description"
          name="seoDescription"
          rows={2}
          maxLength={320}
          defaultValue={value("seoDescription", product?.seoDescription)}
          error={errors.seoDescription}
        />
      </FormSection>

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-line bg-canvas/95 px-4 py-3 backdrop-blur-none sm:mx-0 sm:rounded-card sm:border sm:px-5">
        <Link
          href="/admin/products"
          className="font-sans text-sm text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel={editing ? "Saving…" : "Creating…"}>
          {editing ? "Save changes" : "Create product"}
        </SubmitButton>
      </div>
    </form>
  );
}

/**
 * The slug field.
 *
 * Controlled, unlike the rest of the form, because on a new product it mirrors
 * the name until somebody types in it. On an existing product it never
 * follows anything, and the hint says why: the slug is a live URL.
 */
function SlugField({
  value,
  onChange,
  error,
  editing,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  editing: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor="product-slug"
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
        <span className="shrink-0 font-sans text-sm text-ink-subtle">/shop/</span>
        <input
          id="product-slug"
          name="slug"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required
          maxLength={180}
          aria-invalid={error ? true : undefined}
          aria-describedby="product-slug-hint"
          className="block w-full rounded-control border border-line-strong bg-canvas px-3 py-2.5 font-sans text-sm text-ink transition-colors placeholder:text-ink-subtle focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      </div>

      <p
        id="product-slug-hint"
        className="font-sans text-xs leading-relaxed text-ink-subtle"
      >
        {editing
          ? "This is a live URL. Changing it breaks every link, share and search result already pointing at this piece, so change it only deliberately."
          : "Suggested from the name until you edit it. It becomes a permanent URL, so it is worth getting right now."}
      </p>

      {error ? (
        <p className="font-sans text-xs font-medium leading-relaxed text-brand-strong">
          {error}
        </p>
      ) : null}
    </div>
  );
}
