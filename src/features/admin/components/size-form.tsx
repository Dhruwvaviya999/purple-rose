"use client";

import { useActionState } from "react";
import Link from "next/link";

import { createSizeAction, updateSizeAction } from "@/actions/admin/sizes";
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
 * The size form, for both creating and editing.
 *
 * The sibling of the colour form. One difference in how it behaves: the
 * **code never follows the name**, not even while creating. A size code is the
 * stable identifier — it is what a SKU is built from (`PR-DR-0001-LAV-M`),
 * what `?size=m` resolves against, and what the size selector shows — and
 * "Medium" does not usefully derive "M". Both are typed.
 *
 * The measurements are optional and stay optional. A shop that has not put a
 * tape round its garments should not have to invent numbers to save a name
 * change, and a blank field stores null rather than zero, which would read as
 * "measured, and it is nothing".
 */

type SizeFormProps = {
  size?: {
    id: string;
    code: string;
    name: string;
    position: number;
    isActive: boolean;
    bustCm: number | null;
    waistCm: number | null;
    hipCm: number | null;
    updatedAt: Date;
    variantCount: number;
  };
  nextPosition?: number;
};

export function SizeForm({ size, nextPosition = 0 }: SizeFormProps) {
  const editing = size !== undefined;

  const [state, formAction] = useActionState<AdminActionState, FormData>(
    editing ? updateSizeAction : createSizeAction,
    idleAdminAction,
  );

  const errors = state.fieldErrors ?? {};
  const submitted = state.values ?? {};

  const value = (name: string, fallback: string | number | null | undefined): string =>
    submitted[name] ?? (fallback === null || fallback === undefined ? "" : String(fallback));

  return (
    <form action={formAction} className="space-y-5">
      {editing ? (
        <>
          <input type="hidden" name="id" value={size.id} />
          <input
            type="hidden"
            name="expectedUpdatedAt"
            value={size.updatedAt.toISOString()}
          />
        </>
      ) : null}

      <ActionFeedback state={state} />

      <FormSection
        title="The size"
        description="Shared by every product cut in it. The selector renders whatever it is given, so a run of XS to XXL and a run of 28 to 36 both work."
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Code"
            name="code"
            required
            maxLength={16}
            defaultValue={value("code", size?.code)}
            error={errors.code}
            hint={
              editing
                ? "The stable identifier. It is built into every SKU and carried by the shop filter, so changing it is a deliberate act."
                : "The short form a shopper reads: XS, M, 32, Free. Upper-cased automatically."
            }
          />

          <TextField
            label="Name"
            name="name"
            required
            maxLength={40}
            defaultValue={value("name", size?.name)}
            error={errors.name}
            hint="The spoken form: Medium, Extra large. Renaming this never changes the code."
          />
        </div>
      </FormSection>

      <FormSection
        title="Measurements"
        description="Optional, in whole centimetres. Nothing renders these yet; they are here so a size guide can be built from real numbers rather than invented ones. Leave them blank if the garments have not been measured."
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <TextField
            label="Bust (cm)"
            name="bustCm"
            inputMode="numeric"
            defaultValue={value("bustCm", size?.bustCm)}
            error={errors.bustCm}
          />
          <TextField
            label="Waist (cm)"
            name="waistCm"
            inputMode="numeric"
            defaultValue={value("waistCm", size?.waistCm)}
            error={errors.waistCm}
          />
          <TextField
            label="Hip (cm)"
            name="hipCm"
            inputMode="numeric"
            defaultValue={value("hipCm", size?.hipCm)}
            error={errors.hipCm}
          />
        </div>
      </FormSection>

      <FormSection
        title="Placement"
        description="Where it sits in the size selector and in the shop's size filter. This is what puts XS before XXL."
      >
        <TextField
          label="Position"
          name="position"
          required
          inputMode="numeric"
          defaultValue={value("position", size?.position ?? nextPosition)}
          error={errors.position}
          hint="Lower comes first, smallest to largest. The list screen has arrows for reordering."
        />

        <AdminCheckbox
          name="isActive"
          label="Offered for new variants"
          description={
            editing && size.variantCount > 0
              ? `Switching this off removes it from the choices when building variants and from the shop's size filter. The ${size.variantCount} ${size.variantCount === 1 ? "variant" : "variants"} already cut in it keep their stock and stay sellable.`
              : "Off means it is not offered when building variants and does not appear in the shop's size filter. Nothing already using it is affected."
          }
          defaultChecked={size?.isActive ?? true}
        />
      </FormSection>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link
          href="/admin/sizes"
          className="inline-block py-1 font-sans text-sm text-ink-muted underline decoration-line-strong underline-offset-4 transition-colors hover:decoration-brand"
        >
          Cancel
        </Link>
        <SubmitButton pendingLabel={editing ? "Saving…" : "Creating…"}>
          {editing ? "Save changes" : "Create size"}
        </SubmitButton>
      </div>
    </form>
  );
}
