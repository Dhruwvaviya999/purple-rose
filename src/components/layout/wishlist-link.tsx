import { getCurrentUser } from "@/lib/auth/current-user";
import { countWishlistItems } from "@/lib/services/wishlist-service";
import { HeartIcon } from "@/components/shared/icons";
import { IconLink } from "@/components/ui/icon-button";

/**
 * The wishlist control in the storefront header.
 *
 * A Server Component, so the header still ships no JavaScript for it.
 *
 * **Signed out, it does not query anything.** `getCurrentUser` is already
 * resolved for this request by `AccountMenu` and is request-cached, so an
 * anonymous visitor costs zero extra database work here. The link still goes to
 * `/wishlist`, which sends them to sign in and brings them back: making the
 * icon itself a sign-in link would be a control that changes destination
 * depending on who you are, which is worse than a page that explains itself.
 *
 * **Signed in, it costs one `COUNT`** on an indexed column. That is the whole
 * price of the number, and it is why the number exists at all: §25 rules out
 * putting a query on every anonymous request, not a count for people who have a
 * list to count.
 *
 * Nothing is invented. A customer with nothing saved gets no badge rather than
 * a zero, because a badge reading "0" is noise dressed as information.
 */
export async function WishlistLink({ className }: { className?: string }) {
  const user = await getCurrentUser();
  const count = user ? await countWishlistItems(user.id) : 0;

  const label =
    count > 0
      ? `Wishlist, ${count} ${count === 1 ? "piece" : "pieces"} saved`
      : "Wishlist";

  return (
    <IconLink href="/wishlist" label={label} className={className}>
      <span className="relative inline-flex">
        <HeartIcon />

        {count > 0 ? (
          /* Hidden from assistive technology: the count is already in the
             link's accessible name, and hearing it twice is worse than once. */
          <span
            aria-hidden="true"
            className="absolute -right-1.5 -top-1 min-w-4 rounded-full bg-brand px-1 text-center font-sans text-[0.625rem] font-medium leading-4 text-on-brand"
          >
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </span>
    </IconLink>
  );
}
