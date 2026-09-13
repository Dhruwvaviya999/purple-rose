import { z } from "zod";

/**
 * Input schemas for the authentication flow.
 *
 * These run on the server, inside the Server Actions, because that is the only
 * place a check is a real boundary: a request can be sent without ever loading
 * the page. Anything the browser does with the same rules is convenience, not
 * protection.
 *
 * Kept free of `server-only` so the client form may reuse the shapes for
 * inline feedback. They import no secrets and touch no database.
 */

/**
 * Raw phone input. Bounded and cheaply sanity-checked here; the authoritative
 * check is normalisation in `lib/auth/phone.ts`, which knows the per-country
 * rules this schema cannot express.
 */
export const phoneInputSchema = z
  .string()
  .trim()
  .min(6, "Enter a valid mobile number.")
  .max(24, "Enter a valid mobile number.")
  .regex(/^[+\d][\d\s\-().]*$/, "Enter a valid mobile number.");

/** Exactly six digits, with spacing a paste might carry already stripped. */
export const otpCodeSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\D/g, ""))
  .pipe(z.string().regex(/^\d{6}$/, "Enter the 6-digit code."));

/** A challenge identifier as issued by the server. */
export const challengeIdSchema = z.uuid();

export const requestOtpSchema = z.object({
  phoneNumber: phoneInputSchema,
  next: z.string().max(512).optional(),
});

export const verifyOtpSchema = z.object({
  challengeId: challengeIdSchema,
  code: otpCodeSchema,
  next: z.string().max(512).optional(),
});
