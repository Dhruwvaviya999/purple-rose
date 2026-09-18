"use server";

import { getCurrentUser } from "@/lib/auth/current-user";
import { normalisePhoneNumber } from "@/lib/auth/phone";
import {
  createAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from "@/lib/services/address-service";
import { addressIdSchema, addressInputSchema } from "@/lib/validations/address";
import {
  accountSuccess,
  ADDRESS_DELETED_MESSAGE,
  ADDRESS_SAVED_MESSAGE,
  ADDRESS_UPDATED_MESSAGE,
  DEFAULT_CHANGED_MESSAGE,
  type AccountActionState,
} from "@/features/account/account-state";
import {
  checked,
  failureFor,
  fieldErrorsFrom,
  fromServiceFailure,
  revalidateAccountRoutes,
  text,
  toUnexpectedFailure,
  valuesFrom,
} from "@/lib/account/action-support";

/**
 * The address write path.
 *
 * Four endpoints. Each does the same six steps in the same order, written out
 * rather than hidden in a wrapper, because the order is the security property
 * and `pnpm check:addresses` asserts it by reading this file:
 *
 * 1. **Authenticate.** `getCurrentUser()` resolves the session cookie against
 *    the database. First, before any input is read.
 * 2. **Validate.** Zod, on the form's own fields and nothing else.
 * 3. **Normalise.** The delivery phone goes through the same
 *    `normalisePhoneNumber` the sign-in uses, so one canonical format reaches
 *    the database rather than two.
 * 4. **Act as that customer.** The `userId` handed to the service is the
 *    session's. Ownership is part of every statement's `where`.
 * 5. **Revalidate** the account routes.
 * 6. **Return a safe result** — a sentence, and field errors where they belong.
 *
 * ## Saving returns a state, and does not revalidate
 *
 * Two things about the save paths were arrived at by measurement rather than by
 * preference, and both matter to anyone editing them.
 *
 * **They call no `revalidatePath`.** `revalidateAccountRoutes()` refreshes
 * `/account`, which is the layout segment the address form itself renders under.
 * Calling it from inside that form's own action made the router re-render the
 * tree while the action was still in flight, and whatever the action returned
 * was discarded along with the component waiting for it: the row was written and
 * the browser sat on the filled-in form as though nothing had happened. Nothing
 * is lost by dropping it, because the destination is `force-dynamic` and renders
 * fresh on arrival. The paths that *stay* on the page after writing — setting a
 * default, deleting — still revalidate, because there the cached page is what
 * the customer is looking at.
 *
 * **They return a success state rather than calling `redirect()`.** The redirect
 * is correct on the wire: the action's POST comes back 200 with
 * `x-action-redirect: /account/addresses;push`. It was not acted on here, even
 * with the revalidation removed, while a returned state from the same action on
 * the same request reaches the component reliably. So the navigation is done by
 * `AddressForm`, which knows the server has committed because it was told so.
 *
 * ## What none of them accept
 *
 * No `userId`. An address id **is** accepted, because a form has to say which
 * row it is editing, and it is not authority: the service scopes every statement
 * to the signed-in customer's own rows in the same query, so an id belonging to
 * somebody else matches nothing and is answered exactly as a made-up id would
 * be. That symmetry is deliberate — a different answer would turn these into a
 * way of testing whether an id exists.
 *
 * ## Why they refuse instead of redirecting
 *
 * A signed-out caller gets `SIGNED_OUT` back, not `redirect("/login")`. A
 * redirect from a Server Action reads as success to anything that is not a
 * browser following it, and tells a prober that the endpoint exists and merely
 * declined. The *pages* redirect, through `requireUser()`; the endpoints refuse.
 *
 * Only four functions are exported, because every export in a `"use server"`
 * file becomes a callable endpoint. Shared helpers live in
 * `lib/account/action-support.ts`.
 */

/**
 * Read the form, validate it, and normalise the phone number.
 *
 * Private — not exported — so it is not itself an endpoint.
 */
function parseAddressForm(formData: FormData) {
  const values = valuesFrom(formData);

  const parsed = addressInputSchema.safeParse({
    label: text(formData, "label"),
    recipientName: text(formData, "recipientName"),
    phoneNumber: text(formData, "phoneNumber"),
    addressLine1: text(formData, "addressLine1"),
    addressLine2: text(formData, "addressLine2"),
    landmark: text(formData, "landmark"),
    city: text(formData, "city"),
    state: text(formData, "state"),
    postalCode: text(formData, "postalCode"),
    country: text(formData, "country") || undefined,
    isDefault: checked(formData, "isDefault"),
  });

  if (!parsed.success) {
    return {
      ok: false as const,
      state: failureFor("INVALID_INPUT", {
        fieldErrors: fieldErrorsFrom(parsed.error),
        values,
      }),
    };
  }

  // The authoritative phone check. The schema only bounded the string; this
  // knows the per-country rules and produces the canonical E.164 the database
  // stores for every number in the application.
  const phone = normalisePhoneNumber(parsed.data.phoneNumber);

  if (!phone) {
    return {
      ok: false as const,
      state: failureFor("INVALID_INPUT", {
        fieldErrors: {
          phoneNumber: "Enter a valid phone number, including the country code.",
        },
        values,
      }),
    };
  }

  return {
    ok: true as const,
    values,
    write: { ...parsed.data, phoneNumber: phone.e164 },
  };
}

/** Save a new address. The first one a customer saves becomes their default. */
export async function createAddressAction(
  _previous: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const user = await getCurrentUser();

  if (!user) {
    return failureFor("SIGNED_OUT");
  }

  const parsed = parseAddressForm(formData);

  if (!parsed.ok) {
    return parsed.state;
  }

  try {
    const result = await createAddress(user.id, parsed.write);

    if (!result.ok) {
      return fromServiceFailure(result.code, { values: parsed.values });
    }

    return accountSuccess(ADDRESS_SAVED_MESSAGE);
  } catch (error) {
    return toUnexpectedFailure(error, { values: parsed.values });
  }
}

/** Change an address the signed-in customer owns. */
export async function updateAddressAction(
  _previous: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const user = await getCurrentUser();

  if (!user) {
    return failureFor("SIGNED_OUT");
  }

  const id = addressIdSchema.safeParse(text(formData, "addressId"));

  if (!id.success) {
    return failureFor("NOT_FOUND");
  }

  const parsed = parseAddressForm(formData);

  if (!parsed.ok) {
    return parsed.state;
  }

  try {
    const result = await updateAddress(user.id, id.data, parsed.write);

    if (!result.ok) {
      return fromServiceFailure(result.code, { values: parsed.values });
    }

    return accountSuccess(ADDRESS_UPDATED_MESSAGE);
  } catch (error) {
    return toUnexpectedFailure(error, { values: parsed.values });
  }
}

/**
 * Make one address the default.
 *
 * Its own endpoint rather than a round trip through the edit form, because
 * changing which address a parcel goes to should not require reopening and
 * resaving every field of it.
 */
export async function setDefaultAddressAction(
  addressId: string,
): Promise<AccountActionState> {
  const user = await getCurrentUser();

  if (!user) {
    return failureFor("SIGNED_OUT");
  }

  const id = addressIdSchema.safeParse(addressId);

  if (!id.success) {
    return failureFor("NOT_FOUND");
  }

  try {
    const result = await setDefaultAddress(user.id, id.data);

    if (!result.ok) {
      return fromServiceFailure(result.code);
    }

    revalidateAccountRoutes();

    return accountSuccess(DEFAULT_CHANGED_MESSAGE);
  } catch (error) {
    return toUnexpectedFailure(error);
  }
}

/**
 * Remove an address.
 *
 * Deleting the default promotes the most recently updated remaining address in
 * its place, in the same transaction. See the service for why that rule is
 * stated rather than left to whatever the database returns first.
 */
export async function deleteAddressAction(
  addressId: string,
): Promise<AccountActionState> {
  const user = await getCurrentUser();

  if (!user) {
    return failureFor("SIGNED_OUT");
  }

  const id = addressIdSchema.safeParse(addressId);

  if (!id.success) {
    return failureFor("NOT_FOUND");
  }

  try {
    const result = await deleteAddress(user.id, id.data);

    if (!result.ok) {
      return fromServiceFailure(result.code);
    }

    revalidateAccountRoutes();

    return accountSuccess(ADDRESS_DELETED_MESSAGE);
  } catch (error) {
    return toUnexpectedFailure(error);
  }
}
