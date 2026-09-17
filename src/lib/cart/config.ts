import "server-only";

import { CART_COOKIE_NAME } from "./cookie";
import {
  MAX_LINES_PER_CART,
  MAX_QUANTITY_PER_LINE,
  MIN_QUANTITY_PER_LINE,
} from "./limits";

/**
 * Tunable bag settings.
 *
 * Every value has a safe default, so the application runs without any of them
 * set, and each is read from the environment once, here, rather than scattered
 * through the service that uses them. Same shape as `lib/auth/config.ts`.
 *
 * The quantity limits are **not** read from the environment; they come from
 * `limits.ts`, which the browser imports too. See that file for why a limit the
 * two runtimes could disagree about would be worse than one that is fixed.
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

export const cartConfig = {
  cookieName: CART_COOKIE_NAME,

  /**
   * How long a guest bag stays reachable.
   *
   * Thirty days, matching the session lifetime, so a shopper who signs in a
   * fortnight later still has what they left. It is not forever: a guest bag
   * nobody returns to is litter, and an unbounded one is a table that only
   * grows. The expiry is written on the row at creation and pushed forward on
   * every write, so an active shopper's bag does not lapse under them. Sweeping
   * the lapsed ones is a job for a scheduled task that does not exist yet;
   * `deleteExpiredGuestCarts` is what it will call.
   */
  guestTtlDays: readInt("CART_GUEST_TTL_DAYS", 30, 1, 365),

  minQuantityPerLine: MIN_QUANTITY_PER_LINE,
  maxQuantityPerLine: MAX_QUANTITY_PER_LINE,
  maxLines: MAX_LINES_PER_CART,
} as const;
