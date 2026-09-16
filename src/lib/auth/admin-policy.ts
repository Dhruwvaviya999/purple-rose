import { Role } from "@/generated/prisma/enums";
import type { SessionUser } from "@/lib/services/session-service";

/**
 * The rule: who counts as an administrator.
 *
 * Separate from `admin-guard.ts`, which resolves the session, for two reasons.
 *
 * The practical one: `current-user.ts` imports `redirect` from
 * `next/navigation`, so anything that reaches it drags in the App Router
 * client runtime and cannot be loaded outside Next. `pnpm check:admin` needs
 * to exercise this rule directly, and a security rule that cannot be tested on
 * its own is a security rule nobody tests.
 *
 * The honest one: this is policy and that is plumbing. The policy is four
 * lines and should be readable without the machinery around it.
 *
 * It takes a resolved `SessionUser` rather than a role string on purpose. The
 * role has to come from a database row: there is no role field in any form, in
 * any URL or in any cookie, and supplying one would do nothing.
 */
export function isAdmin(user: SessionUser | null): user is SessionUser {
  return user !== null && user.role === Role.ADMIN;
}

/**
 * Refusal. Carries no detail, on purpose.
 *
 * Anonymous and signed-in-but-not-an-administrator produce exactly this, so
 * the response cannot be used to work out which one you are, or whether a
 * given number has an account at all.
 */
export class AdminAuthorizationError extends Error {
  constructor() {
    super("Administrator access is required.");
    this.name = "AdminAuthorizationError";
  }
}
