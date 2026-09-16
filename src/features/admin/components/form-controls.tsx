"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import type { AdminActionState } from "@/features/admin/action-state";
import { idleAdminAction } from "@/features/admin/action-state";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils/cn";

/**
 * The interactive parts of the admin forms.
 *
 * Small client components with a clear job each, so the pages around them stay
 * Server Components. None of them decides anything: they collect input, submit
 * it, and render whatever the server said.
 */

/* ------------------------------------------------------------------ *
 * Fields
 * ------------------------------------------------------------------ */

type FieldProps = {
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
  }) => ReactNode;
};

/**
 * A labelled control with its hint and its error.
 *
 * The render-prop keeps the wiring — the generated id, `aria-invalid`,
 * `aria-describedby` — in one place instead of repeated correctly on thirty
 * fields and incorrectly on the thirty-first. The error is announced when it
 * appears, and it sits next to the field rather than in a list at the top,
 * because "check the highlighted fields" is only useful if they are.
 */
export function AdminField({
  label,
  name,
  error,
  hint,
  required,
  children,
}: FieldProps) {
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
          <span className="text-brand" aria-hidden="true">
            {" "}
            *
          </span>
        ) : null}
        {required ? <span className="sr-only"> (required)</span> : null}
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

/** The shared look of a `select` and a `textarea`, matching `Input`. */
export const controlClassName =
  "block w-full rounded-control border border-line-strong bg-canvas px-3 py-2.5 font-sans text-sm text-ink transition-colors placeholder:text-ink-subtle focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:opacity-60";

/** A tick box with its label as the whole row, so the target is the width. */
export function AdminCheckbox({
  name,
  label,
  description,
  defaultChecked,
  value = "on",
}: {
  name: string;
  label: string;
  description?: string;
  defaultChecked?: boolean;
  /**
   * What the box submits when ticked. Defaults to "on", which is what the
   * boolean schemas read; a multi-select group passes the id instead.
   */
  value?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-control px-1 py-1.5 transition-colors hover:bg-surface has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand">
      <input
        type="checkbox"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-ink"
      />
      <span className="min-w-0">
        <span className="block font-sans text-sm text-ink">{label}</span>
        {description ? (
          <span className="mt-0.5 block font-sans text-xs leading-relaxed text-ink-subtle">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * Submitting
 * ------------------------------------------------------------------ */

/**
 * A submit button that knows the form is in flight.
 *
 * `useFormStatus` reads the pending state of the form it sits inside, which is
 * what disables it. That is the whole of the duplicate-submission guard: a
 * disabled button cannot be pressed twice, and a second Enter on a disabled
 * form does nothing. The label changes too, so the state is visible and not
 * only implied by the button being dim.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  variant = "primary",
  size = "md",
  className,
  formAction,
  name,
  value,
}: {
  children: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "link";
  size?: "sm" | "md" | "lg";
  className?: string;
  formAction?: (formData: FormData) => void;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={pending}
      formAction={formAction}
      name={name}
      value={value}
      className={className}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}

/**
 * What the server said about the last submission.
 *
 * A failure is `role="alert"`, so it interrupts and is heard; a success is
 * `role="status"`, so it is announced without cutting across whatever is being
 * read. Nothing here is rendered before the action resolves — no optimistic
 * "Saved" that might not be true.
 */
export function ActionFeedback({
  state,
  className,
}: {
  state: AdminActionState;
  className?: string;
}) {
  if (state.status === "idle" || !state.message) {
    return null;
  }

  const failed = state.status === "error";

  return (
    <p
      role={failed ? "alert" : "status"}
      className={cn(
        "rounded-control border px-3.5 py-2.5 font-sans text-sm leading-relaxed",
        failed
          ? "border-brand/40 bg-brand-soft text-brand-strong"
          : "border-line-strong bg-surface text-ink",
        className,
      )}
    >
      {state.message}
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * Confirmation
 * ------------------------------------------------------------------ */

type ConfirmActionProps = {
  /** The button that opens the dialog. */
  triggerLabel: string;
  triggerVariant?: "primary" | "secondary" | "ghost" | "link";
  triggerSize?: "sm" | "md";
  title: string;
  /** What will happen, and whether it can be undone. */
  description: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  /** Hidden inputs submitted with the confirmation. */
  fields: Record<string, string>;
  action: (
    state: AdminActionState,
    formData: FormData,
  ) => Promise<AdminActionState>;
  /** Extra emphasis for something that cannot be undone. */
  destructive?: boolean;
};

/**
 * A button that asks before it does something.
 *
 * Every irreversible or far-reaching admin operation goes through this:
 * archiving a product, switching off a collection, withdrawing a variant,
 * removing a photograph. The dialog says what will happen **and whether it can
 * be reversed**, because "Are you sure?" answers neither.
 *
 * `window.confirm()` is not used: it cannot explain consequences, cannot be
 * styled to match anything, and blocks the tab. `Modal` gives the same
 * guarantees the storefront drawers already have.
 *
 * The dialog closes only once the server has confirmed the change. A failure
 * keeps it open with the reason inside it, so nothing is dismissed on a
 * promise that did not hold.
 */
export function ConfirmAction({
  triggerLabel,
  triggerVariant = "secondary",
  triggerSize = "sm",
  title,
  description,
  confirmLabel,
  pendingLabel = "Working…",
  fields,
  action,
  destructive = false,
}: ConfirmActionProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  /**
   * Close once the change has actually been applied, never before.
   *
   * Done by wrapping the action rather than by watching its result in an
   * effect. The close is a consequence of the submission, so it belongs in the
   * submission; an effect reacting to the state afterwards would be a second
   * render pass to express the same thing, and React rightly objects to
   * setting state from one.
   *
   * A failure leaves the dialog open with the reason inside it. Nothing is
   * dismissed on a promise that did not hold.
   */
  const [state, formAction] = useActionState(
    async (previous: AdminActionState, formData: FormData) => {
      const result = await action(previous, formData);

      if (result.status === "success") {
        setOpen(false);
      }

      return result;
    },
    idleAdminAction,
  );

  return (
    <>
      <Button
        ref={triggerRef}
        variant={triggerVariant}
        size={triggerSize}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        description={description}
        returnFocusRef={triggerRef}
        footer={
          <form action={formAction} className="flex flex-wrap justify-end gap-3">
            {Object.entries(fields).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
            <Button variant="ghost" size="md" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SubmitButton
              variant={destructive ? "primary" : "secondary"}
              pendingLabel={pendingLabel}
            >
              {confirmLabel}
            </SubmitButton>
          </form>
        }
      >
        {state.status === "error" ? (
          <div className="mt-4">
            <ActionFeedback state={state} />
          </div>
        ) : null}
      </Modal>
    </>
  );
}

/**
 * A one-button form for a change small enough not to need confirming.
 *
 * Reordering, publishing, toggling a variant back on. It still goes through a
 * Server Action, still shows a pending state and still cannot be double
 * submitted; it just does not stop to ask.
 */
export function QuickActionForm({
  fields,
  action,
  label,
  pendingLabel,
  variant = "ghost",
  disabled,
  title,
}: {
  fields: Record<string, string>;
  action: (
    state: AdminActionState,
    formData: FormData,
  ) => Promise<AdminActionState>;
  label: ReactNode;
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "link";
  disabled?: boolean;
  title?: string;
}) {
  const [, formAction] = useActionState(action, idleAdminAction);

  return (
    <form action={formAction} className="inline-flex">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <QuickSubmit
        label={label}
        pendingLabel={pendingLabel}
        variant={variant}
        disabled={disabled}
        title={title}
      />
    </form>
  );
}

function QuickSubmit({
  label,
  pendingLabel,
  variant,
  disabled,
  title,
}: {
  label: ReactNode;
  pendingLabel?: string;
  variant: "primary" | "secondary" | "ghost" | "link";
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size="sm"
      disabled={disabled || pending}
      title={title}
    >
      {pending && pendingLabel ? pendingLabel : label}
    </Button>
  );
}

/** A text input bound to a field, for the many plain cases. */
export function TextField({
  label,
  name,
  error,
  hint,
  required,
  defaultValue,
  placeholder,
  type = "text",
  inputMode,
  maxLength,
  onChange,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  inputMode?: "text" | "numeric" | "decimal";
  maxLength?: number;
  /**
   * Notified as the value changes. Only used where another field follows this
   * one, such as a new product's slug following its name; the input itself
   * stays uncontrolled so a long form does not re-render per keystroke.
   */
  onChange?: (value: string) => void;
}) {
  return (
    <AdminField label={label} name={name} error={error} hint={hint} required={required}>
      {(props) => (
        <Input
          {...props}
          type={type}
          inputMode={inputMode}
          defaultValue={defaultValue}
          placeholder={placeholder}
          maxLength={maxLength}
          required={required}
          onChange={onChange ? (event) => onChange(event.target.value) : undefined}
        />
      )}
    </AdminField>
  );
}

/** A multi-line text field. */
export function TextAreaField({
  label,
  name,
  error,
  hint,
  required,
  defaultValue,
  rows = 4,
  maxLength,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <AdminField label={label} name={name} error={error} hint={hint} required={required}>
      {(props) => (
        <textarea
          {...props}
          rows={rows}
          defaultValue={defaultValue}
          maxLength={maxLength}
          required={required}
          className={controlClassName}
        />
      )}
    </AdminField>
  );
}

/** A native select. On a phone this is the system picker, which is correct. */
export function SelectField({
  label,
  name,
  error,
  hint,
  required,
  defaultValue,
  options,
  placeholder,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
  defaultValue?: string;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <AdminField label={label} name={name} error={error} hint={hint} required={required}>
      {(props) => (
        <select
          {...props}
          defaultValue={defaultValue}
          required={required}
          className={controlClassName}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </AdminField>
  );
}
