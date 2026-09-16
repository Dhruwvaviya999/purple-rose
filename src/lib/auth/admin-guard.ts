import "server-only";

import { getCurrentUser, type SessionUser } from "./current-user";
import { AdminAuthorizationError, isAdmin } from "./admin-policy";

/**
 * The authorisation gate for mutations.
 *
 * `requireAdmin()` in `current-user.ts` is for *pages*: it redirects, which is
 * the right answer for somebody who navigated somewhere they cannot go. It is
 * the wrong answer for a Server Action. A redirect to a Server Action reads as
 * success to anything that is not a browser following it, and it tells an
 * attacker probing the endpoint that the action exists and merely declined.
 *
 * So mutations use this instead: it refuses, identically, for every caller who
 * is not an administrator, and the action turns that refusal into the same
 * flat message whatever the reason.
 *
 * **Every exported Server Action under `actions/admin/` calls this before it
 * touches anything.** Not the page that renders the form, not the component,
 * not the service: the action, because the action is the endpoint. A form is
 * not a boundary — the request can be sent without ever loading the page that
 * would have rendered it.
 *
 * `pnpm check:admin` asserts that mechanically: it reads every action module
 * and fails if an exported action does not run this guard, or runs it after
 * parsing input.
 *
 * The rule itself lives in `admin-policy.ts`, which imports no Next runtime,
 * so it can be exercised directly by the checks.
 */

/**
 * The signed-in administrator, or a refusal.
 *
 * Anonymous and signed-in-but-not-an-administrator fail the same way.
 */
export async function requireAdminActor(): Promise<SessionUser> {
  const user = await getCurrentUser();

  if (!isAdmin(user)) {
    throw new AdminAuthorizationError();
  }

  return user;
}

export { AdminAuthorizationError, isAdmin };
export type { SessionUser };
