import "server-only";

import { SESSION_COOKIE_NAME } from "./cookie";

/**
 * Tunable authentication settings.
 *
 * Every value has a safe default, so the application runs without any of these
 * set. Each is read from the environment once, here, rather than scattered
 * through the services that use them.
 */

function readInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();

  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    console.warn(
      `${name} is not an integer between ${min} and ${max}; using ${fallback}.`,
    );
    return fallback;
  }

  return parsed;
}

export const otpConfig = {
  /** Digits in a code. Six is the norm users expect from an SMS. */
  codeLength: 6,
  /** How long a code stays valid. Short, because it is the main defence. */
  ttlSeconds: readInt("AUTH_OTP_TTL_SECONDS", 5 * 60, 60, 30 * 60),
  /** Wrong guesses allowed before a challenge is burned. */
  maxAttempts: readInt("AUTH_OTP_MAX_ATTEMPTS", 5, 1, 20),
  /** Minimum gap between two codes for the same number. */
  resendCooldownSeconds: readInt("AUTH_OTP_RESEND_COOLDOWN_SECONDS", 60, 15, 600),
  /** Ceiling on codes per number, and per source address, each hour. */
  maxPerPhonePerHour: readInt("AUTH_OTP_MAX_PER_PHONE_PER_HOUR", 5, 1, 50),
  maxPerIpPerHour: readInt("AUTH_OTP_MAX_PER_IP_PER_HOUR", 20, 1, 500),
  /** Challenges older than this are deleted opportunistically. Must exceed
   *  the rate-limit window, or cleanup would erase the evidence the limiter
   *  counts. */
  retentionHours: 24,
} as const;

export const sessionConfig = {
  cookieName: SESSION_COOKIE_NAME,
  /** Absolute lifetime. Not extended on use; see docs/authentication. */
  ttlDays: readInt("AUTH_SESSION_TTL_DAYS", 30, 1, 365),
} as const;
