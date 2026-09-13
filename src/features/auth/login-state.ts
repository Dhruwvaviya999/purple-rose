/**
 * The shape the sign-in form and the sign-in action agree on.
 *
 * It lives here rather than in `src/actions/auth.ts` because a "use server"
 * module may only export async functions: every export there becomes a callable
 * endpoint, so a plain constant is rejected. Keeping the shared type and its
 * initial value in an ordinary module lets both sides import them.
 *
 * Nothing in this state is trusted by the server. It travels through the
 * browser, so each action re-reads and re-validates whatever it needs from the
 * submitted form instead.
 */
export type LoginFormState =
  | { status: "phone"; error?: string }
  | {
      status: "code";
      challengeId: string;
      /** Kept so "resend" can reissue without asking for the number again. */
      phoneNumber: string;
      maskedPhone: string;
      /** Epoch milliseconds. The form counts down to it. */
      resendAvailableAt: number;
      error?: string;
      notice?: string;
    };

export const initialLoginState: LoginFormState = { status: "phone" };
