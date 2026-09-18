import "server-only";

import type { AddressBook, AddressData } from "@/types/account";
import type { Prisma } from "@/generated/prisma/client";
import { countryName, MAX_ADDRESSES_PER_CUSTOMER } from "@/lib/account/limits";
import { prisma } from "@/lib/db/client";

/**
 * Saved delivery addresses.
 *
 * Four rules hold throughout, and they are why this file exists rather than the
 * queries living in pages and actions.
 *
 * **Every statement is scoped by `userId`.** Not "look it up, then check who
 * owns it" — the ownership is part of the `where`, in the same query, every
 * time. `WHERE id = $1 AND "userId" = $2` cannot be got wrong by a later reader
 * the way a forgotten follow-up check can. An address id belonging to another
 * customer matches nothing, which is indistinguishable from an id that names
 * nothing, which is exactly what an attacker should learn.
 *
 * **At most one default per customer, and the database agrees.** The
 * transactions below clear the old default before setting the new one, and a
 * partial unique index makes a second default impossible even if a future
 * caller forgets. See the migration.
 *
 * **Nothing Prisma-shaped leaves.** Callers get `AddressData`, which carries no
 * `userId` and no timestamps.
 *
 * **Nothing is silently destroyed.** Deleting is explicit and confirmed in the
 * interface; reaching the address limit refuses the new one rather than evicting
 * an old one.
 *
 * It reads no request state — no `cookies()`, no `getCurrentUser()` — so
 * `pnpm check:addresses` can exercise it directly. The signed-in customer is
 * resolved by the caller, in `actions/addresses.ts` and in the pages.
 */

/* ------------------------------------------------------------------ *
 * Results
 * ------------------------------------------------------------------ */

export type AddressErrorCode =
  | "not-found"
  | "limit-reached"
  | "nothing-to-delete";

export type AddressFailure = { ok: false; code: AddressErrorCode };
export type AddressSuccess = { ok: true; id: string };
export type AddressResult = AddressSuccess | AddressFailure;

const fail = (code: AddressErrorCode): AddressFailure => ({ ok: false, code });

/** What a write supplies. Note the absence of a `userId` and of an `id`. */
export type AddressWrite = {
  label: string;
  recipientName: string;
  /** Already normalised to E.164 by the caller. */
  phoneNumber: string;
  addressLine1: string;
  addressLine2?: string | undefined;
  landmark?: string | undefined;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
};

/* ------------------------------------------------------------------ *
 * Reading
 * ------------------------------------------------------------------ */

const addressSelect = {
  id: true,
  label: true,
  recipientName: true,
  phoneNumber: true,
  addressLine1: true,
  addressLine2: true,
  landmark: true,
  city: true,
  state: true,
  postalCode: true,
  country: true,
  isDefault: true,
} as const satisfies Prisma.AddressSelect;

type AddressRow = Prisma.AddressGetPayload<{ select: typeof addressSelect }>;

/**
 * The address as one line of plain text.
 *
 * Built once, on the server, so the card, the delete confirmation and every
 * accessible name describe the same address identically. Empty parts are
 * dropped rather than leaving ", , " where a landmark was not given.
 */
function summarise(row: AddressRow): string {
  return [
    row.addressLine1,
    row.addressLine2,
    row.landmark,
    row.city,
    row.state,
    row.postalCode,
    countryName(row.country),
  ]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(", ");
}

function toAddressData(row: AddressRow): AddressData {
  return {
    id: row.id,
    label: row.label,
    recipientName: row.recipientName,
    phoneNumber: row.phoneNumber,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    landmark: row.landmark,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    countryName: countryName(row.country),
    isDefault: row.isDefault,
    summary: summarise(row),
  };
}

/**
 * One customer's addresses, default first.
 *
 * **Ordering is declared, never inherited from the database.** Default first,
 * because it is the one a future checkout opens with and the one somebody
 * scanning the page is looking for; then most recently changed, so an address
 * just edited is near the top; then by id, so two rows written in the same
 * millisecond still come back in a fixed order rather than a different one on
 * every request.
 *
 * One query, filtered in the database. Nothing loads every address and narrows
 * it in JavaScript.
 */
export async function listAddresses(userId: string): Promise<AddressBook> {
  const rows = await prisma.address.findMany({
    where: { userId },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
    take: MAX_ADDRESSES_PER_CUSTOMER,
    select: addressSelect,
  });

  return {
    addresses: rows.map(toAddressData),
    isFull: rows.length >= MAX_ADDRESSES_PER_CUSTOMER,
    limit: MAX_ADDRESSES_PER_CUSTOMER,
  };
}

/**
 * One address, if it belongs to this customer.
 *
 * `findFirst` with both columns in the `where`, rather than `findUnique` by id
 * followed by an ownership check. The two are not equivalent: the second reads
 * the row before deciding, which is one forgotten `if` away from handing it
 * over. This cannot return somebody else's address at all.
 */
export async function getAddress(
  userId: string,
  addressId: string,
): Promise<AddressData | null> {
  const row = await prisma.address.findFirst({
    where: { id: addressId, userId },
    select: addressSelect,
  });

  return row ? toAddressData(row) : null;
}

/** How many they have saved. For the overview line and the limit check. */
export async function countAddresses(userId: string): Promise<number> {
  return prisma.address.count({ where: { userId } });
}

/** The address a future checkout would open with, or null. */
export async function getDefaultAddress(
  userId: string,
): Promise<AddressData | null> {
  const row = await prisma.address.findFirst({
    where: { userId, isDefault: true },
    select: addressSelect,
  });

  return row ? toAddressData(row) : null;
}

/* ------------------------------------------------------------------ *
 * Writing
 * ------------------------------------------------------------------ */

/**
 * Save a new address.
 *
 * **The first one is always the default.** A customer with exactly one saved
 * address and no default is a customer who will reach a future checkout and be
 * asked to choose from a list of one — so the rule is applied here, at the
 * point the situation arises, rather than patched at checkout.
 *
 * Everything happens in one transaction. Clearing the previous default and
 * writing the new row must both happen or neither: the partial unique index
 * would reject two defaults, so a non-transactional version would fail *after*
 * clearing the old one and leave the customer with none.
 */
export async function createAddress(
  userId: string,
  input: AddressWrite,
): Promise<AddressResult> {
  const existing = await prisma.address.count({ where: { userId } });

  if (existing >= MAX_ADDRESSES_PER_CUSTOMER) {
    return fail("limit-reached");
  }

  // The first address is the default whatever the form said.
  const shouldDefault = input.isDefault || existing === 0;

  const created = await prisma.$transaction(async (tx) => {
    if (shouldDefault) {
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return tx.address.create({
      data: {
        userId,
        label: input.label,
        recipientName: input.recipientName,
        phoneNumber: input.phoneNumber,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        landmark: input.landmark ?? null,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: input.country,
        isDefault: shouldDefault,
      },
      select: { id: true },
    });
  });

  return { ok: true, id: created.id };
}

/**
 * Change an address the customer owns.
 *
 * The update is scoped with `updateMany` on both columns, so an id belonging to
 * somebody else changes nothing and reports `not-found` — the same answer an id
 * that never existed gets. Neither `userId` nor `id` is writable: they are not
 * in the `data`, so there is no path by which an address changes hands.
 *
 * Turning the default **on** clears the previous one in the same transaction.
 * Turning it **off** is deliberately not offered: a customer with addresses
 * should always have one default, and "none" is not a state the interface can
 * reach. Choosing a different default is how you stop this one being it.
 */
export async function updateAddress(
  userId: string,
  addressId: string,
  input: AddressWrite,
): Promise<AddressResult> {
  const owned = await prisma.address.findFirst({
    where: { id: addressId, userId },
    select: { id: true, isDefault: true },
  });

  if (!owned) {
    return fail("not-found");
  }

  const shouldDefault = input.isDefault || owned.isDefault;

  await prisma.$transaction(async (tx) => {
    if (shouldDefault && !owned.isDefault) {
      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    await tx.address.updateMany({
      // Both columns, again. The row was confirmed a moment ago, but a write
      // scoped only by id is a write that a later edit could quietly widen.
      where: { id: addressId, userId },
      data: {
        label: input.label,
        recipientName: input.recipientName,
        phoneNumber: input.phoneNumber,
        addressLine1: input.addressLine1,
        addressLine2: input.addressLine2 ?? null,
        landmark: input.landmark ?? null,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: input.country,
        isDefault: shouldDefault,
      },
    });
  });

  return { ok: true, id: addressId };
}

/**
 * Make one address the default.
 *
 * Both writes in one transaction, in this order: clear, then set. The reverse
 * order would momentarily hold two defaults, which the partial unique index
 * refuses outright — so the ordering is not a preference, it is the only one
 * that commits.
 *
 * Two tabs both setting a default end with exactly one, whichever commits last,
 * because each transaction clears everything else before setting its own.
 */
export async function setDefaultAddress(
  userId: string,
  addressId: string,
): Promise<AddressResult> {
  const owned = await prisma.address.findFirst({
    where: { id: addressId, userId },
    select: { id: true },
  });

  if (!owned) {
    return fail("not-found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.address.updateMany({
      where: { userId, isDefault: true, id: { not: addressId } },
      data: { isDefault: false },
    });

    await tx.address.updateMany({
      where: { id: addressId, userId },
      data: { isDefault: true },
    });
  });

  return { ok: true, id: addressId };
}

/**
 * Delete an address, and promote a replacement if it was the default.
 *
 * **The promotion rule, stated exactly:** when the deleted address was the
 * default and others remain, the most recently updated of them becomes the new
 * default. When none remain, the customer has no default, which is correct —
 * there is nothing to be default.
 *
 * Deterministic, and it has to be: "whichever the database returns first" would
 * promote a different address on different days. The tie-break is id, for the
 * same reason the list has one.
 *
 * All of it is one transaction, so there is no moment where the customer has
 * two defaults or has lost an address without gaining a replacement default.
 */
export async function deleteAddress(
  userId: string,
  addressId: string,
): Promise<AddressResult> {
  const owned = await prisma.address.findFirst({
    where: { id: addressId, userId },
    select: { id: true, isDefault: true },
  });

  if (!owned) {
    return fail("not-found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.address.deleteMany({ where: { id: addressId, userId } });

    if (!owned.isDefault) {
      return;
    }

    const replacement = await tx.address.findFirst({
      where: { userId },
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      select: { id: true },
    });

    if (replacement) {
      await tx.address.updateMany({
        where: { id: replacement.id, userId },
        data: { isDefault: true },
      });
    }
  });

  return { ok: true, id: addressId };
}
