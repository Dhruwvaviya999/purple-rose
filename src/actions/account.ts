"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { updateUserName } from "@/lib/services/user-service";
import { profileInputSchema } from "@/lib/validations/address";
import {
  accountSuccess,
  PROFILE_SAVED_MESSAGE,
  type AccountActionState,
} from "@/features/account/account-state";
import {
  failureFor,
  fieldErrorsFrom,
  revalidateProfileRoutes,
  text,
  toUnexpectedFailure,
  valuesFrom,
} from "@/lib/account/action-support";

/**
 * The customer's own profile.
 *
 * One endpoint, because there is one thing a customer may change about their
 * account: what they would like to be called.
 *
 * **Not here, deliberately:** the phone number, which is the account's identity
 * and is proven by a one-time code — changing it is a verification flow, not a
 * text field, and a later phase. The role, which the server sets and no form
 * ever touches. And nothing else at all: no avatar, no birthday, no
 * preferences, no saved cards. A profile page that collects data the shop has
 * no use for is a liability rather than a feature.
 *
 * The narrowness is enforced below rather than merely intended: the schema has
 * one field, and `updateUserName` writes one column.
 */
export async function updateProfileAction(
  _previous: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  // 1. Authenticate, before any input is read.
  const user = await getCurrentUser();

  if (!user) {
    return failureFor("SIGNED_OUT");
  }

  const values = valuesFrom(formData);

  // 2. Validate. One field; anything else in the payload is ignored because
  //    nothing reads it.
  const parsed = profileInputSchema.safeParse({ name: text(formData, "name") });

  if (!parsed.success) {
    return failureFor("INVALID_INPUT", {
      fieldErrors: fieldErrorsFrom(parsed.error),
      values,
    });
  }

  try {
    // 3. Act as the authenticated customer. `user.id` comes from the session.
    await updateUserName(user.id, parsed.data.name);

    // 4. The header greets them by name, so the shell refreshes too.
    revalidateProfileRoutes();

    return accountSuccess(PROFILE_SAVED_MESSAGE);
  } catch (error) {
    return toUnexpectedFailure(error, { values });
  }
}
