import type { Metadata } from "next";
import type { Route } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { listAddresses } from "@/lib/services/address-service";
import { AccountShell } from "@/features/account/components/account-shell";
import { AddressCard } from "@/features/account/components/address-card";
import { EmptyState } from "@/components/shared/empty-state";
import { HomeIcon } from "@/components/shared/icons";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Addresses",
  description: "Where your orders are delivered.",
  robots: { index: false, follow: false },
};

/**
 * The address book.
 *
 * A Server Component. The cards are interactive — setting a default and
 * deleting are both actions — but the list itself, its order and its empty state
 * are rendered on the server.
 *
 * ## Ordering
 *
 * Default first, then most recently changed, then by id. Declared in the query,
 * never inherited from whatever order the database happened to return: a list
 * that reshuffles between visits is a list nobody can scan.
 *
 * ## Queries
 *
 * One, filtered by the signed-in customer in the database. Nothing loads a set
 * of addresses and narrows it in JavaScript, and nothing queries per card.
 *
 * Rendered per request. These are somebody's home and work addresses; a cached
 * copy reaching anybody else would be the worst leak in the application.
 */
export const dynamic = "force-dynamic";

export default async function AddressesPage() {
  const user = await requireUser("/account/addresses");
  const { addresses, isFull, limit } = await listAddresses(user.id);

  return (
    <AccountShell
      current="addresses"
      title="Addresses"
      description="Where we deliver. The default is the one we will suggest first."
      breadcrumb={[{ label: "Addresses" }]}
      actions={
        addresses.length > 0 && !isFull ? (
          <ButtonLink href={"/account/addresses/new" as Route}>
            Add an address
          </ButtonLink>
        ) : null
      }
    >
      {addresses.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-strong bg-surface px-6 py-14 sm:py-16">
          {/* Not an error, and not styled as one. An account with no saved
              address is a new account, which is a good thing. */}
          <EmptyState
            icon={<HomeIcon />}
            title="No saved addresses yet"
            description="Save where you would like your orders delivered, and it will be ready and waiting when you order."
            action={
              <ButtonLink href={"/account/addresses/new" as Route}>
                Add an address
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {addresses.map((address) => (
              <AddressCard key={address.id} address={address} />
            ))}
          </ul>

          {isFull ? (
            <p
              role="status"
              className="mt-6 rounded-control border border-line-strong bg-surface px-4 py-3 font-sans text-sm leading-relaxed text-ink-muted"
            >
              You have saved the most addresses an account can hold ({limit}).
              Remove one to add another — nothing is ever removed for you.
            </p>
          ) : null}
        </>
      )}
    </AccountShell>
  );
}
