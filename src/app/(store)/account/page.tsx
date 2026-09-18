import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { countAddresses, getDefaultAddress } from "@/lib/services/address-service";
import { Role } from "@/generated/prisma/enums";
import { AccountShell } from "@/features/account/components/account-shell";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

/**
 * Private, like `/wishlist` and `/cart`, and for a stronger reason than either:
 * this page shows somebody's name, their phone number and where they live.
 */
export const metadata: Metadata = {
  title: "Account",
  description: "Your Purple Rose account.",
  robots: { index: false, follow: false },
};

/**
 * The account overview.
 *
 * A Server Component. The only JavaScript on it is the sign-out control, which
 * is the one thing that has to act rather than link.
 *
 * ## Rendering
 *
 * Per request, and it must be: every word on it belongs to one person, so a
 * cached copy served to anybody else would be a data leak rather than a stale
 * page.
 *
 * ## What it deliberately does not show
 *
 * No order count, no amount spent, no loyalty points, no "member since" badge.
 * None of those systems exist, and a dashboard of invented numbers is how an
 * account area stops being believable. What is here is what is true: who is
 * signed in, how to reach the three things they own, and how to leave.
 *
 * ## Queries
 *
 * Two small ones, both scoped to the signed-in customer, run together. The user
 * itself costs nothing extra — `requireUser` resolves the session through the
 * request-cached `getCurrentUser`, which the header has already called.
 */
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser("/account");

  const [addressCount, defaultAddress] = await Promise.all([
    countAddresses(user.id),
    getDefaultAddress(user.id),
  ]);

  return (
    <AccountShell
      current="overview"
      title={user.name ? `Hello, ${user.name}` : "Your account"}
      description="Your details, where we deliver, and everything you have saved."
    >
      <div className="space-y-8">
        <section
          aria-labelledby="account-details"
          className="rounded-card border border-line bg-surface p-5 sm:p-6"
        >
          <h2
            id="account-details"
            className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle"
          >
            Signed in as
          </h2>

          <dl className="mt-4 space-y-3">
            <div>
              <dt className="font-sans text-xs text-ink-subtle">Phone number</dt>
              <dd className="mt-0.5 font-sans text-sm text-ink">
                {user.phoneNumber}
              </dd>
            </div>

            <div>
              <dt className="font-sans text-xs text-ink-subtle">Name</dt>
              <dd className="mt-0.5 font-sans text-sm text-ink">
                {user.name ?? (
                  <span className="text-ink-subtle">Not set yet</span>
                )}
              </dd>
            </div>
          </dl>

          <p className="mt-4 font-sans text-xs leading-relaxed text-ink-subtle">
            Your phone number is how you sign in, so it cannot be changed here.
          </p>

          <Link
            href={"/account/profile" as Route}
            className="mt-4 inline-flex min-h-11 items-center rounded-control border border-line-strong bg-canvas px-4 font-sans text-sm font-medium text-ink transition-colors hover:bg-surface-strong"
          >
            Edit your details
          </Link>
        </section>

        <section aria-labelledby="account-links">
          <h2
            id="account-links"
            className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle"
          >
            Everything else
          </h2>

          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            <QuickLink
              href={"/account/addresses" as Route}
              title="Addresses"
              detail={
                addressCount === 0
                  ? "None saved yet"
                  : defaultAddress
                    ? `${addressCount} saved · default is ${defaultAddress.label}`
                    : `${addressCount} saved`
              }
            />
            <QuickLink
              href={"/wishlist" as Route}
              title="Wishlist"
              detail="Pieces you have saved"
            />
            <QuickLink
              href={"/cart" as Route}
              title="Bag"
              detail="What you are ready to order"
            />
            {user.role === Role.ADMIN ? (
              <QuickLink
                href={"/admin" as Route}
                title="Admin console"
                detail="Manage the catalogue"
              />
            ) : null}
          </ul>
        </section>

        <section
          aria-labelledby="account-signout"
          className="border-t border-line pt-6"
        >
          <h2 id="account-signout" className="sr-only">
            Sign out
          </h2>
          {/* The existing control, not a second one. Signing out revokes the
              session row server-side, which is the half that matters. */}
          <SignOutButton />
        </section>
      </div>
    </AccountShell>
  );
}

/** A card-sized link. The whole tile is the target, not the title alone. */
function QuickLink({
  href,
  title,
  detail,
}: {
  href: Route;
  title: string;
  detail: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-11 flex-col justify-center rounded-card border border-line bg-canvas px-5 py-4 transition-colors hover:border-line-strong hover:bg-surface"
      >
        <span className="font-sans text-sm font-medium text-ink">{title}</span>
        <span className="mt-0.5 font-sans text-xs text-ink-subtle">
          {detail}
        </span>
      </Link>
    </li>
  );
}
