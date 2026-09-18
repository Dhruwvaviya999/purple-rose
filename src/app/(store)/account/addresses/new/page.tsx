import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Route } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { countAddresses } from "@/lib/services/address-service";
import { MAX_ADDRESSES_PER_CUSTOMER } from "@/lib/account/limits";
import { AccountShell } from "@/features/account/components/account-shell";
import { AddressForm } from "@/features/account/components/address-form";

export const metadata: Metadata = {
  title: "Add an address",
  robots: { index: false, follow: false },
};

/**
 * Add an address.
 *
 * The limit is checked here as well as in the service, for different reasons: the
 * service refuses a write that would exceed it, and this stops somebody reaching
 * a form they cannot submit. Neither replaces the other — the page is a courtesy
 * and the service is the rule.
 *
 * The first address a customer saves becomes their default automatically, which
 * the form does not need to know about: the service applies it, so the rule holds
 * whatever route reaches it.
 */
export const dynamic = "force-dynamic";

export default async function NewAddressPage() {
  const user = await requireUser("/account/addresses/new");

  if ((await countAddresses(user.id)) >= MAX_ADDRESSES_PER_CUSTOMER) {
    redirect("/account/addresses" as Route);
  }

  return (
    <AccountShell
      current="addresses"
      title="Add an address"
      description="Where should we deliver?"
      breadcrumb={[
        { label: "Addresses", href: "/account/addresses" as Route },
        { label: "Add an address" },
      ]}
    >
      <div className="max-w-2xl">
        <AddressForm />
      </div>
    </AccountShell>
  );
}
