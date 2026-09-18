"use client";

import { useActionState, useId } from "react";
import { useFormStatus } from "react-dom";

import { updateProfileAction } from "@/actions/account";
import {
  idleAccountAction,
  type AccountActionState,
} from "@/features/account/account-state";
import { MAX_NAME_LENGTH } from "@/lib/account/limits";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

/**
 * The one thing a customer may change about their account.
 *
 * A real `<form>` with a real `action`, through `useActionState`, so it submits
 * and works before any JavaScript loads. The hook adds the pending state and the
 * message on top.
 *
 * Clearing the field is allowed and means "I would rather you did not use a
 * name". An account created by a one-time code starts with none, and somebody
 * who mistyped theirs should not be stuck with it.
 */
export function ProfileForm({ name }: { name: string | null }) {
  const [state, formAction] = useActionState<AccountActionState, FormData>(
    updateProfileAction,
    idleAccountAction,
  );

  const id = useId();
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;

  const error = state.fieldErrors?.name;
  // What they just typed survives a refusal; otherwise what is saved.
  const value = state.values?.name ?? name ?? "";

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor={id}>Your name</Label>

        <Input
          id={id}
          name="name"
          defaultValue={value}
          maxLength={MAX_NAME_LENGTH}
          autoComplete="name"
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [hintId, error ? errorId : null].filter(Boolean).join(" ") ||
            undefined
          }
        />

        <p
          id={hintId}
          className="font-sans text-xs leading-relaxed text-ink-subtle"
        >
          Optional. Leave it empty if you would rather we did not use a name.
        </p>

        {error ? (
          <p
            id={errorId}
            className="font-sans text-xs font-medium leading-relaxed text-brand-strong"
          >
            {error}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <SaveButton />

        {/*
          Always present, so the announcement is not competing with the region's
          own insertion. `role` switches with the outcome: a refusal interrupts,
          a confirmation waits its turn.
        */}
        <p
          role={state.status === "error" ? "alert" : "status"}
          aria-live="polite"
          className={cn(
            "font-sans text-sm",
            state.message
              ? state.status === "error"
                ? "text-brand-strong"
                : "text-ink-muted"
              : "sr-only",
          )}
        >
          {state.message ?? ""}
        </p>
      </div>
    </form>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}
