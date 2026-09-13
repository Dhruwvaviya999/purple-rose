import "server-only";

import { randomInt } from "node:crypto";

import { otpConfig } from "./config";
import { keyedHash } from "./secret";

/**
 * Generate a code using the cryptographic random source.
 *
 * `Math.random` is predictable and must never be used here. `randomInt` draws
 * uniformly, and zero padding keeps every value in the range equally likely,
 * including those with leading zeros.
 */
export function generateOtpCode(): string {
  const upperBound = 10 ** otpConfig.codeLength;
  return String(randomInt(0, upperBound)).padStart(otpConfig.codeLength, "0");
}

/**
 * Derive the stored digest for a code.
 *
 * The phone number is mixed in so a digest is only meaningful for the number
 * it was issued to, and cannot be transplanted onto another challenge.
 */
export function hashOtpCode(phoneNumber: string, code: string): string {
  return keyedHash(`otp:${phoneNumber}:${code}`);
}
