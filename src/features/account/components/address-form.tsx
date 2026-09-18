"use client";

import { useActionState, useEffect, useId } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { createAddressAction, updateAddressAction } from "@/actions/addresses";
import {
  idleAccountAction,
  type AccountActionState,
} from "@/features/account/account-state";
import type { AddressData } from "@/types/account";
import {
  DEFAULT_COUNTRY,
  SUGGESTED_ADDRESS_LABELS,
  SUPPORTED_COUNTRIES,
} from "@/lib/account/limits";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

/**
 * The address form, for both creating and editing.
 *
 * One component for both, because they differ in exactly two things — which
 * action they submit to and whether they carry an id — and two near-identical
 * eleven-field forms would drift the first time a field was added to one.
 *
 * ## Nothing is lost on a refusal
 *
 * Every field's `defaultValue` reads from `state.values` first and the address
 * being edited second. So a refused submission comes back with everything the
 * customer typed still in place, including the fields that were fine. Retyping
 * an address because a PIN code was a digit short is how somebody abandons a
 * purchase.
 *
 * ## Errors sit with their fields
 *
 * `state.fieldErrors` is keyed by field name and each message renders under its
 * own input, tied to it with `aria-describedby` and marked `aria-invalid`.
 * "Check the highlighted fields" is only useful if they are.
 *
 * ## Where it goes afterwards
 *
 * Back to the address book, from here rather than from the action. See the
 * effect below and the note in `actions/addresses.ts`.
 *
 * ## Progressive by construction
 *
 * A real `<form>` with a real `action`, through `useActionState`. It submits and
 * works before any JavaScript loads; the hook adds the pending state and the
 * messages on top. That is also why the values come back from the server rather
 * than being held in component state.
 */
export function AddressForm({
  address,
  /** Where Cancel goes, and where a success sends them. */
  returnHref = "/account/addresses",
}: {
  /** The address being edited, or undefined when creating a new one. */
  address?: AddressData;
  returnHref?: string;
}) {
  const [state, formAction] = useActionState<AccountActionState, FormData>(
    address ? updateAddressAction : createAddressAction,
    idleAccountAction,
  );

  const labelListId = useId();
  const router = useRouter();

  /**
   * Back to the list once the server says the write committed.
   *
   * Not a preference: `redirect()` from the action is the tidier design and it
   * is not applied in this setup, while a returned state is. See
   * `actions/addresses.ts` for the measurements. Navigating on a
   * server-confirmed success is the same outcome by a route that works.
   *
   * Without JavaScript this never runs and the form renders "Address saved."
   * instead — the write already happened, so nothing is lost either way.
   */
  useEffect(() => {
    if (state.status === "success") {
      router.push(returnHref as Route);
    }
  }, [state.status, router, returnHref]);

  /** Submitted value first, then the saved address, then nothing. */
  const value = (field: keyof AddressData, fallback = "") => {
    const submitted = state.values?.[field];

    if (submitted !== undefined) {
      return submitted;
    }

    const saved = address?.[field];

    return typeof saved === "string" ? saved : fallback;
  };

  const errorFor = (field: string) => state.fieldErrors?.[field];

  // A ticked box that was rejected should come back ticked. `values` only has
  // the key when it was ticked, so its presence is the answer — but only once
  // something has been submitted, otherwise fall back to the saved row.
  const defaultChecked =
    state.status === "idle"
      ? (address?.isDefault ?? false)
      : state.values?.isDefault !== undefined;

  return (
    <form action={formAction} className="space-y-8" noValidate>
      {address ? (
        <input type="hidden" name="addressId" value={address.id} />
      ) : null}

      {state.status === "error" && state.message ? (
        <p
          role="alert"
          className="rounded-control border border-brand/40 bg-brand-soft px-3.5 py-2.5 font-sans text-sm leading-relaxed text-brand-strong"
        >
          {state.message}
        </p>
      ) : null}

      {state.status === "success" && state.message ? (
        <p
          role="status"
          className="rounded-control border border-line-strong bg-surface px-3.5 py-2.5 font-sans text-sm leading-relaxed text-ink"
        >
          {state.message}
        </p>
      ) : null}

      <Fieldset legend="Who is receiving it">
        <div className="grid gap-5 sm:grid-cols-2">
          <AddressField
            label="Recipient name"
            name="recipientName"
            required
            error={errorFor("recipientName")}
            hint="The person who will take the delivery."
          >
            {(props) => (
              <Input
                {...props}
                autoComplete="name"
                defaultValue={value("recipientName")}
              />
            )}
          </AddressField>

          <AddressField
            label="Phone number"
            name="phoneNumber"
            required
            error={errorFor("phoneNumber")}
            hint="Include the country code. Numbers without one are treated as Indian."
          >
            {(props) => (
              <Input
                {...props}
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                defaultValue={value("phoneNumber")}
              />
            )}
          </AddressField>
        </div>
      </Fieldset>

      <Fieldset legend="Where it goes">
        <div className="space-y-5">
          <AddressField
            label="Address line 1"
            name="addressLine1"
            required
            error={errorFor("addressLine1")}
            hint="Flat or house number, building, street."
          >
            {(props) => (
              <Input
                {...props}
                autoComplete="address-line1"
                defaultValue={value("addressLine1")}
              />
            )}
          </AddressField>

          <div className="grid gap-5 sm:grid-cols-2">
            <AddressField
              label="Address line 2"
              name="addressLine2"
              error={errorFor("addressLine2")}
              hint="Optional."
            >
              {(props) => (
                <Input
                  {...props}
                  autoComplete="address-line2"
                  defaultValue={value("addressLine2")}
                />
              )}
            </AddressField>

            <AddressField
              label="Landmark"
              name="landmark"
              error={errorFor("landmark")}
              hint="Optional, and often the fastest way to find a door."
            >
              {(props) => (
                <Input {...props} defaultValue={value("landmark")} />
              )}
            </AddressField>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <AddressField
              label="City"
              name="city"
              required
              error={errorFor("city")}
            >
              {(props) => (
                <Input
                  {...props}
                  autoComplete="address-level2"
                  defaultValue={value("city")}
                />
              )}
            </AddressField>

            <AddressField
              label="State"
              name="state"
              required
              error={errorFor("state")}
            >
              {(props) => (
                <Input
                  {...props}
                  autoComplete="address-level1"
                  defaultValue={value("state")}
                />
              )}
            </AddressField>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <AddressField
              label="PIN code"
              name="postalCode"
              required
              error={errorFor("postalCode")}
            >
              {(props) => (
                <Input
                  {...props}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  defaultValue={value("postalCode")}
                />
              )}
            </AddressField>

            <AddressField
              label="Country"
              name="country"
              required
              error={errorFor("country")}
              hint="We deliver locally in India for now."
            >
              {(props) => (
                <select
                  {...props}
                  autoComplete="country"
                  defaultValue={value("country", DEFAULT_COUNTRY)}
                  className="block w-full rounded-control border border-line-strong bg-canvas px-3.5 py-2.5 font-sans text-sm text-ink transition-colors"
                >
                  {SUPPORTED_COUNTRIES.map((entry) => (
                    <option key={entry.code} value={entry.code}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              )}
            </AddressField>
          </div>
        </div>
      </Fieldset>

      <Fieldset legend="How you will recognise it">
        <div className="space-y-5">
          <AddressField
            label="Name this address"
            name="label"
            required
            error={errorFor("label")}
            hint="Home, Work, or anything that makes sense to you."
          >
            {(props) => (
              <>
                <Input
                  {...props}
                  list={labelListId}
                  defaultValue={value("label")}
                />
                {/* Suggestions, never a closed set: two homes need two names. */}
                <datalist id={labelListId}>
                  {SUGGESTED_ADDRESS_LABELS.map((entry) => (
                    <option key={entry} value={entry} />
                  ))}
                </datalist>
              </>
            )}
          </AddressField>

          <DefaultCheckbox
            defaultChecked={defaultChecked}
            lockedOn={address?.isDefault ?? false}
          />
        </div>
      </Fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
        <SaveButton editing={Boolean(address)} />

        <Link
          href={returnHref as never}
          className="flex min-h-11 items-center rounded-control px-4 font-sans text-sm text-ink-muted transition-colors hover:text-ink"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

/** A group of related fields, announced as a group rather than as a run. */
function Fieldset({
  legend,
  children,
}: {
  legend: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset>
      <legend className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle">
        {legend}
      </legend>
      <div className="mt-4">{children}</div>
    </fieldset>
  );
}

/**
 * A labelled control with its hint and its error.
 *
 * The render-prop keeps the generated id, `aria-invalid` and `aria-describedby`
 * in one place instead of repeated correctly on ten fields and incorrectly on
 * the eleventh. The same shape the admin forms use.
 */
function AddressField({
  label,
  name,
  error,
  hint,
  required,
  children,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: {
    id: string;
    name: string;
    "aria-invalid": true | undefined;
    "aria-describedby": string | undefined;
  }) => React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required ? (
          <>
            <span className="text-brand" aria-hidden="true">
              {" "}
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        ) : null}
      </Label>

      {children({
        id,
        name,
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy,
      })}

      {hint ? (
        <p id={hintId} className="font-sans text-xs leading-relaxed text-ink-subtle">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p
          id={errorId}
          className="font-sans text-xs font-medium leading-relaxed text-brand-strong"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The default-address tick box.
 *
 * When the address being edited is already the default, the box is ticked and
 * locked on, and it says why. Unticking it would leave a customer with addresses
 * and no default — a state the interface should not be able to reach, because a
 * future checkout would then open on nothing. Choosing a *different* default is
 * how you stop this one being it, and that lives on the list.
 */
function DefaultCheckbox({
  defaultChecked,
  lockedOn,
}: {
  defaultChecked: boolean;
  lockedOn: boolean;
}) {
  const id = useId();

  return (
    <div className="rounded-control border border-line bg-surface p-4">
      <label
        htmlFor={id}
        className={cn(
          "flex items-start gap-3",
          lockedOn ? "cursor-default" : "cursor-pointer",
        )}
      >
        <input
          id={id}
          type="checkbox"
          name="isDefault"
          defaultChecked={defaultChecked || lockedOn}
          // Read-only rather than disabled: a disabled box submits nothing, and
          // the value has to reach the server to stay true.
          readOnly={lockedOn}
          onClick={lockedOn ? (event) => event.preventDefault() : undefined}
          className="mt-0.5 size-4 shrink-0 rounded border-line-strong text-brand"
        />

        <span className="font-sans text-sm text-ink">
          Deliver here by default
          <span className="mt-0.5 block text-xs leading-relaxed text-ink-subtle">
            {lockedOn
              ? "This is your default address. To change it, choose another address as default from the list."
              : "We will suggest this address first when you order."}
          </span>
        </span>
      </label>
    </div>
  );
}

/**
 * Submit, with a pending state.
 *
 * `useFormStatus` has to be read from inside the form, which is why this is its
 * own component rather than a prop threaded down from the hook above.
 */
function SaveButton({ editing }: { editing: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" size="lg" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : editing ? "Save changes" : "Save address"}
    </Button>
  );
}
