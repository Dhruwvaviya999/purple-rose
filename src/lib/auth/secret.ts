import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Keyed hashing for low-entropy secrets.
 *
 * A six-digit code has about twenty bits of entropy. An unkeyed digest of one
 * is trivially reversible: an attacker holding the database can hash all one
 * million codes in a moment and read every pending challenge. Keying the hash
 * with a server-side secret removes that, because the attacker would also need
 * the key, which lives in the environment and not in the database.
 *
 * The same reasoning does not apply to session tokens, which carry 256 bits of
 * entropy and are therefore hashed with a plain digest elsewhere.
 */

let cachedSecret: string | undefined;

function authSecret(): string {
  if (cachedSecret) {
    return cachedSecret;
  }

  const value = process.env.AUTH_SECRET?.trim();

  if (!value || value.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Set it to at least 32 characters " +
        "in .env.local. Generate one with: openssl rand -base64 32",
    );
  }

  cachedSecret = value;
  return value;
}

/** Hex-encoded HMAC-SHA256 of `value`, keyed with AUTH_SECRET. */
export function keyedHash(value: string): string {
  return createHmac("sha256", authSecret()).update(value).digest("hex");
}

/**
 * Compare two hex digests without leaking how many characters matched.
 *
 * Both inputs are the same fixed length here, so the length check below only
 * guards against a malformed stored value.
 */
export function hashesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");

  if (left.length === 0 || left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}
