import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { Route } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { getAddress } from "@/lib/services/address-service";
import { AccountShell } from "@/features/account/components/account-shell";
import { AddressForm } from "@/features/account/components/address-form";

export const metadata: Metadata = {
  title: "Edit address",
  robots: { index: false, follow: false },
};

/**
 * Edit one saved address.
 *
 * `getAddress` takes the signed-in customer and the id together, and its query
 * carries both columns — so an id belonging to somebody else returns null and
 * lands here as a 404, exactly as an id that names nothing does. **The two are
 * deliberately indistinguishable.** A different response for "exists but is not
 * yours" would turn this route into a way of asking whether an address id is
 * real.
 *
 * That is also why there is no ownership check written after the read: there is
 * no moment at which the row has been fetched and not yet been checked.
 *
 * Rendered per request.
 */
export const dynamic = "force-dynamic";

export default async function EditAddressPage(
  props: PageProps<"/account/addresses/[id]">,
) {
  const { id } = await props.params;
  const user = await requireUser(`/account/addresses/${id}`);

  const address = await getAddress(user.id, id);

  if (!address) {
    notFound();
  }

  return (
    <AccountShell
      current="addresses"
      title="Edit address"
      description={`Changes apply to ${address.label} only.`}
      breadcrumb={[
        { label: "Addresses", href: "/account/addresses" as Route },
        { label: address.label },
      ]}
    >
      <div className="max-w-2xl">
        <AddressForm address={address} />
      </div>
    </AccountShell>
  );
}
