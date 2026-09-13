"use client";

import { useActionState, useId } from "react";

import { loginAction } from "@/actions/auth";
import {
  initialLoginState,
  type LoginFormState,
} from "@/features/auth/login-state";
import { Button } from "@/components/ui/button";
import { Field, FieldHint, Input, Label } from "@/components/ui/input";
import { Heading, Text } from "@/components/ui/typography";
import { OtpInput } from "./otp-input";
import { useResendCountdown } from "./resend-countdown";

/**
 * The two-stage sign-in form.
 *
 * The stage is whatever the server last returned, so a reload or a failed
 * submission cannot leave the UI claiming a code was sent when it was not.
 * No authentication decision is made here: this component collects input,
 * shows what the server said, and nothing else.
 */

type LoginFormProps = {
  /** Where to land after signing in. Validated again on the server. */
  next?: string;
};

export function LoginForm({ next }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState<
    LoginFormState,
    FormData
  >(loginAction, initialLoginState);

  return state.status === "code" ? (
    <CodeStage state={state} formAction={formAction} isPending={isPending} next={next} />
  ) : (
    <PhoneStage state={state} formAction={formAction} isPending={isPending} next={next} />
  );
}

type StageProps<S extends LoginFormState> = {
  state: S;
  formAction: (payload: FormData) => void;
  isPending: boolean;
  next?: string;
};

function PhoneStage({
  state,
  formAction,
  isPending,
  next,
}: StageProps<Extract<LoginFormState, { status: "phone" }>>) {
  const errorId = useId();

  return (
    <>
      <Heading as="h1" level="lg">
        Sign in
      </Heading>

      <Text size="sm" className="mt-3">
        Enter your mobile number and we will text you a 6-digit code. No
        password to remember.
      </Text>

      <form action={formAction} className="mt-8 space-y-5">
        <input type="hidden" name="intent" value="request" />
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <Field>
          <Label htmlFor="phoneNumber">Mobile number</Label>
          <Input
            id="phoneNumber"
            name="phoneNumber"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            // A country code is accepted and preferred. Without one the number
            // is read as Indian, which is the launch market.
            placeholder="+91 98765 43210"
            required
            autoFocus
            disabled={isPending}
            aria-invalid={state.error ? true : undefined}
            aria-describedby={state.error ? errorId : undefined}
          />
          <FieldHint>
            Include your country code. Numbers without one are treated as
            Indian.
          </FieldHint>
        </Field>

        {state.error ? <FormError id={errorId}>{state.error}</FormError> : null}

        <Button type="submit" size="lg" className="w-full" disabled={isPending}>
          {isPending ? "Sending code…" : "Send code"}
        </Button>
      </form>
    </>
  );
}

function CodeStage({
  state,
  formAction,
  isPending,
  next,
}: StageProps<Extract<LoginFormState, { status: "code" }>>) {
  const errorId = useId();
  const hintId = useId();
  const secondsLeft = useResendCountdown(state.resendAvailableAt);

  return (
    <>
      <Heading as="h1" level="lg">
        Enter your code
      </Heading>

      <Text size="sm" className="mt-3">
        We sent a 6-digit code to{" "}
        <span className="font-medium text-ink">{state.maskedPhone}</span>.
      </Text>

      <form action={formAction} className="mt-8 space-y-5">
        <input type="hidden" name="intent" value="verify" />
        <input type="hidden" name="challengeId" value={state.challengeId} />
        {next ? <input type="hidden" name="next" value={next} /> : null}

        <OtpInput
          name="code"
          describedBy={state.error ? errorId : hintId}
          invalid={Boolean(state.error)}
          disabled={isPending}
        />

        {state.error ? (
          <FormError id={errorId}>{state.error}</FormError>
        ) : (
          <FieldHint id={hintId}>
            {state.notice ?? "The code expires in a few minutes."}
          </FieldHint>
        )}

        <Button
          type="submit"
          size="lg"
          className="w-full"
          disabled={isPending}
        >
          {isPending ? "Verifying…" : "Verify and continue"}
        </Button>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
        {/* Its own form, so resending never submits the code field. */}
        <form action={formAction}>
          <input type="hidden" name="intent" value="request" />
          <input type="hidden" name="phoneNumber" value={state.phoneNumber} />
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <Button
            type="submit"
            variant="link"
            size="sm"
            className="px-0"
            disabled={isPending || secondsLeft > 0}
          >
            {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Send a new code"}
          </Button>
        </form>

        {/* Discards the challenge and returns to the number stage. */}
        <form action={formAction}>
          <input type="hidden" name="intent" value="restart" />
          <Button
            type="submit"
            variant="link"
            size="sm"
            className="px-0"
            disabled={isPending}
          >
            Use a different number
          </Button>
        </form>
      </div>
    </>
  );
}

function FormError({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p
      id={id}
      // Announced when it appears, so the error is not visual-only.
      role="alert"
      aria-live="polite"
      className="rounded-control border border-plum-200 bg-brand-soft px-3.5 py-2.5 font-sans text-sm leading-relaxed text-brand-strong"
    >
      {children}
    </p>
  );
}
