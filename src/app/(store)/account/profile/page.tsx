import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/current-user";
import { AccountShell } from "@/features/account/components/account-shell";
import { ProfileForm } from "@/features/account/components/profile-form";

export const metadata: Metadata = {
  title: "Your details",
  description: "The name we use for you.",
  robots: { index: false, follow: false },
};

/**
 * The profile page.
 *
 * Deliberately one field. A customer account in a clothes shop needs to know
 * what to call somebody and where to send a parcel; everything beyond that is
 * data the shop has no use for and a liability it would have to protect. No
 * avatar, no birthday, no gender, no preferences, no saved cards.
 *
 * The phone number is shown and not editable. It is the account's identity, it
 * was proven with a one-time code, and changing it is a verification flow rather
 * than a text input — a later phase, if ever.
 *
 * Rendered per request: it shows one person's name and number.
 */
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser("/account/profile");

  return (
    <AccountShell
      current="profile"
      title="Your details"
      description="How we address you when we write, and the number you sign in with."
      breadcrumb={[{ label: "Your details" }]}
    >
      <div className="max-w-xl space-y-8">
        <ProfileForm name={user.name} />

        <section
          aria-labelledby="profile-phone"
          className="rounded-card border border-line bg-surface p-5"
        >
          <h2
            id="profile-phone"
            className="font-sans text-xs font-medium uppercase tracking-eyebrow text-ink-subtle"
          >
            Phone number
          </h2>

          <p className="mt-2 font-sans text-sm text-ink">{user.phoneNumber}</p>

          <p className="mt-3 font-sans text-xs leading-relaxed text-ink-subtle">
            This is how you sign in, so it is not something you can edit here.
            Changing it would mean proving the new number with a code, which is
            not built yet.
          </p>
        </section>
      </div>
    </AccountShell>
  );
}
