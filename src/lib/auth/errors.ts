/**
 * Outcomes the authentication flow can report to a browser.
 *
 * Every user-visible message is defined here, so nothing downstream can
 * improvise wording that leaks internal state. The messages are deliberately
 * plain: they tell a legitimate user what to do next without confirming to an
 * attacker whether a number belongs to an account.
 */
export type AuthFailureCode =
  | "INVALID_PHONE"
  | "INVALID_CODE_FORMAT"
  | "RESEND_TOO_SOON"
  | "TOO_MANY_REQUESTS"
  | "CHALLENGE_NOT_FOUND"
  | "CHALLENGE_EXPIRED"
  | "CODE_INCORRECT"
  | "TOO_MANY_ATTEMPTS"
  | "DELIVERY_FAILED"
  | "UNEXPECTED";

const MESSAGES: Record<AuthFailureCode, string> = {
  INVALID_PHONE: "Enter a valid mobile number, including the country code.",
  INVALID_CODE_FORMAT: "Enter the 6-digit code from your message.",
  RESEND_TOO_SOON: "Hold on a moment before asking for another code.",
  TOO_MANY_REQUESTS:
    "Too many codes have been requested. Please try again later.",
  CHALLENGE_NOT_FOUND: "That sign-in attempt is no longer valid. Start again.",
  CHALLENGE_EXPIRED: "That code has expired. Ask for a new one.",
  CODE_INCORRECT: "That code is not right. Check it and try again.",
  TOO_MANY_ATTEMPTS:
    "Too many incorrect attempts. Request a new code to continue.",
  DELIVERY_FAILED: "We could not send a code right now. Please try again.",
  UNEXPECTED: "Something went wrong. Please try again.",
};

export function authFailureMessage(code: AuthFailureCode): string {
  return MESSAGES[code];
}
