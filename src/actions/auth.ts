"use server";

import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { authFailureMessage, type AuthFailureCode } from "@/lib/auth/errors";
import { normalisePhoneNumber } from "@/lib/auth/phone";
import {
  defaultDestinationForRole,
  safeRedirectPath,
} from "@/lib/auth/redirect";
import { endSession, startSession } from "@/lib/auth/session";
import {
  issueOtpChallenge,
  verifyOtpChallenge,
} from "@/lib/services/otp-service";
import { findOrCreateUserByPhone } from "@/lib/services/user-service";
import { requestOtpSchema, verifyOtpSchema } from "@/lib/validations/auth";
import {
  initialLoginState,
  type LoginFormState,
} from "@/features/auth/login-state";

/**
 * Authentication entry points.
 *
 * Server Actions rather than Route Handlers, deliberately. Next.js compares
 * the request Origin against the Host on every action and rejects a mismatch,
 * which is CSRF protection we would otherwise have to build and maintain by
 * hand. Action ids are encrypted at build time, so there is also no stable
 * public URL for an attacker to script against. Nothing here needs to be
 * callable by a third party, so no public API is created.
 *
 * Only two actions are exported, because every export in a "use server" file
 * becomes a callable endpoint. The stage handlers below stay private and are
 * reached through `loginAction`.
 *
 * Each action validates its own input from scratch. That a form is only
 * rendered on a particular page is not a boundary: the request can be sent
 * without ever loading it.
 */

function phoneStageError(code: AuthFailureCode): LoginFormState {
  return { status: "phone", error: authFailureMessage(code) };
}

/**
 * Best-effort client address, used only to rate limit.
 *
 * Vercel sets `x-forwarded-for`. The header is client-controlled in general,
 * so it is treated as a hint that makes bulk abuse more expensive, never as
 * identity and never as an authorisation input.
 */
async function requestIp(): Promise<string | null> {
  const headerList = await headers();
  const forwarded = headerList.get("x-forwarded-for");

  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }

  return headerList.get("x-real-ip")?.trim() || null;
}

/**
 * Stage one: accept a number and send a code.
 *
 * The reply is the same whether or not the number has an account, because an
 * account is only created once a code is verified. There is nothing here an
 * attacker can use to learn who is registered.
 */
async function handleRequest(
  previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const parsed = requestOtpSchema.safeParse({
    phoneNumber: formData.get("phoneNumber"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return phoneStageError("INVALID_PHONE");
  }

  const phone = normalisePhoneNumber(parsed.data.phoneNumber);

  if (!phone) {
    return phoneStageError("INVALID_PHONE");
  }

  try {
    const result = await issueOtpChallenge(phone.e164, await requestIp());

    if (!result.ok) {
      // A rejected resend must not throw the user back to stage one, or they
      // would lose the code they are waiting for.
      if (previous.status === "code") {
        return { ...previous, error: authFailureMessage(result.code) };
      }

      return phoneStageError(result.code);
    }

    return {
      status: "code",
      challengeId: result.challengeId,
      phoneNumber: phone.e164,
      maskedPhone: phone.masked,
      resendAvailableAt: result.resendAvailableAt.getTime(),
      notice:
        previous.status === "code" ? "A new code is on its way." : undefined,
    };
  } catch (error) {
    // The reason stays on the server; the user gets a generic message.
    console.error("Failed to issue an OTP challenge.", error);
    return phoneStageError("UNEXPECTED");
  }
}

/**
 * Stage two: verify the code, then sign the person in.
 *
 * On success this redirects and never returns. `redirect` throws a control
 * signal that must not be swallowed, which is why the try block wraps only the
 * work that can genuinely fail.
 */
async function handleVerify(
  previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const codeStage = previous.status === "code" ? previous : null;

  const fail = (code: AuthFailureCode): LoginFormState =>
    codeStage
      ? { ...codeStage, notice: undefined, error: authFailureMessage(code) }
      : phoneStageError(code);

  const parsed = verifyOtpSchema.safeParse({
    challengeId: formData.get("challengeId"),
    code: formData.get("code"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return fail("INVALID_CODE_FORMAT");
  }

  let destination: string;

  try {
    const verified = await verifyOtpChallenge(
      parsed.data.challengeId,
      parsed.data.code,
    );

    if (!verified.ok) {
      return fail(verified.code);
    }

    // The role comes from the database record, never from the request, so a
    // public sign-in cannot mint an administrator.
    const user = await findOrCreateUserByPhone(verified.phoneNumber);
    await startSession(user.id);

    destination =
      safeRedirectPath(parsed.data.next) ?? defaultDestinationForRole(user.role);
  } catch (error) {
    console.error("Failed to complete sign-in.", error);
    return fail("UNEXPECTED");
  }

  // Typed routes cannot check a string built at runtime. `destination` is
  // either a constant from `defaultDestinationForRole` or a path that
  // `safeRedirectPath` has already restricted to this site.
  redirect(destination as Route);
}

/**
 * The single action behind the sign-in form.
 *
 * The stage is taken from the submitted `intent` rather than from `previous`,
 * because the previous state travels through the client and is therefore not
 * trustworthy. Either branch re-validates everything it uses.
 */
export async function loginAction(
  previous: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const intent = formData.get("intent");

  if (intent === "verify") {
    return handleVerify(previous, formData);
  }

  // "Use a different number": drop the challenge and show a clean first stage.
  // The abandoned challenge is left to expire; it cannot be reused because
  // verification needs its id, which the browser has just discarded.
  if (intent === "restart") {
    return initialLoginState;
  }

  return handleRequest(previous, formData);
}

/**
 * Sign out: revoke the session record, clear the cookie, land on the
 * storefront. Revoking server-side is what makes this real. Clearing the
 * cookie alone would leave a token that still worked if it had been captured.
 */
export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/");
}
