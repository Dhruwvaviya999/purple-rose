import Link from "next/link";

import { getCurrentUser } from "@/lib/auth/current-user";
import { Role } from "@/generated/prisma/enums";
import { UserIcon } from "@/components/shared/icons";
import { IconLink } from "@/components/ui/icon-button";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

/**
 * The account control in the storefront header.
 *
 * Signed out, it is a plain link to sign in. Signed in, it opens a small panel
 * showing which number is signed in, a link to the admin area for
 * administrators, and sign out.
 *
 * Built on `<details>` rather than a scripted dropdown so the whole thing stays
 * a Server Component: no client bundle, keyboard and screen-reader behaviour
 * come from the browser. The trade-off is that it does not close on an outside
 * click, which is acceptable for a control this small.
 *
 * The admin link here is convenience, not security. `/admin` enforces the role
 * on the server whether or not this link is rendered.
 */
export async function AccountMenu() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <IconLink href="/login" label="Sign in">
        <UserIcon />
      </IconLink>
    );
  }

  return (
    <details className="relative [&[open]>summary>svg]:text-brand-strong">
      <summary
        // `list-item` display would show a disclosure triangle next to the icon.
        className="flex size-10 cursor-pointer list-none items-center justify-center rounded-control text-ink transition-colors hover:bg-surface-strong hover:text-brand-strong [&::-webkit-details-marker]:hidden"
        aria-label="Account menu"
      >
        <UserIcon className="size-5" />
      </summary>

      <div className="absolute right-0 z-50 mt-2 w-60 rounded-card border border-line bg-canvas p-2 shadow-raised">
        <p className="px-3 py-2 font-sans text-xs text-ink-subtle">
          Signed in as
          <span className="mt-0.5 block text-sm text-ink">
            {user.phoneNumber}
          </span>
        </p>

        {user.role === Role.ADMIN ? (
          <Link
            href="/admin"
            className="block rounded-control px-3 py-2 font-sans text-sm text-ink transition-colors hover:bg-surface-strong hover:text-brand-strong"
          >
            Admin console
          </Link>
        ) : null}

        <div className="mt-1 border-t border-line pt-1">
          <SignOutButton className="[&_button]:w-full [&_button]:justify-start" />
        </div>
      </div>
    </details>
  );
}
