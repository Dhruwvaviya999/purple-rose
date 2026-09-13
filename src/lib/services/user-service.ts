import "server-only";

import { prisma } from "@/lib/db/client";
import { Role } from "@/generated/prisma/enums";
import type { SessionUser } from "./session-service";

/**
 * Account lookup and creation for the sign-in flow.
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
