import "server-only";

import { prisma } from "@/lib/db/client";
import { Role } from "@/generated/prisma/enums";
import type { SessionUser } from "./session-service";

/**
 * Account lookup and creation for the sign-in flow, and the one thing a
 * customer may change about their own account.
 */

/**
 * Return the account for a verified number, creating one if it is new.
 *
 * A new account is always a CUSTOMER. The role is set here, by the server,
 * from a constant: it is never read from the request, so no amount of crafted
 * input can make a public sign-in produce an administrator. Promotion to ADMIN
 * happens only through the seed or a direct database change.
 *
 * The existing branch deliberately does not touch `role`, so an administrator
 * signing in stays an administrator.
 *
 * `upsert` on the unique phone number makes two simultaneous verifications for
 * one new number settle into a single account rather than racing to insert
 * twice.
 */
export async function findOrCreateUserByPhone(
  phoneNumber: string,
): Promise<SessionUser> {
  return prisma.user.upsert({
    where: { phoneNumber },
    update: {},
    create: { phoneNumber, role: Role.CUSTOMER },
    select: { id: true, phoneNumber: true, name: true, role: true },
  });
}

/**
 * Change a customer's own display name.
 *
 * The only column this application lets somebody edit about themselves, and the
 * `select` is what makes that true rather than merely intended: `data` names one
 * field, so there is no path by which a form could reach `role` or
 * `phoneNumber`. Both are identity — the role is set by the server and the
 * number is proven by a one-time code — and changing a phone number is a
 * verification flow, not a text input.
 *
 * `null` is a legitimate value. An account created by a one-time code has no
 * name until somebody types one, and clearing a mistyped one back to nothing
 * should not be impossible.
 *
 * Scoped by `id`, which the caller resolved from the session. Nothing from a
 * request reaches it.
 */
export async function updateUserName(
  userId: string,
  name: string | null,
): Promise<SessionUser> {
  return prisma.user.update({
    where: { id: userId },
    data: { name },
    select: { id: true, phoneNumber: true, name: true, role: true },
  });
}
