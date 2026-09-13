import { CartDrawer } from "@/components/commerce/cart-drawer";
import {
  SearchOverlay,
  type SearchSuggestion,
} from "@/components/commerce/search-overlay";
import { HeartIcon } from "@/components/shared/icons";
import { IconLink } from "@/components/ui/icon-button";
import { AccountMenu } from "./account-menu";

/**
 * The controls on the right of the header: search, wishlist, account, bag.
 *
 * All four are genuinely interactive. Search opens a panel, the wishlist and
 * the bag go to pages that exist, and the bag also opens a drawer. Where the
 * feature behind a control is not built, the control says so rather than doing
 * nothing quietly: none of them is a dead button.
 *
 * Every one is at least 40 pixels square, which is a comfortable thumb target
 * on a phone, and each carries a text name for screen readers because they are
 * icon-only.
 *
 * A server component. The three controls that need state are their own client
 * components, so the header itself ships no JavaScript.
 */
export function HeaderActions({
  searchSuggestions,
}: {
  searchSuggestions: readonly SearchSuggestion[];
}) {
  return (
    <div className="flex items-center gap-0.5 sm:gap-1">
      <SearchOverlay suggestions={searchSuggestions} />

      <IconLink href="/wishlist" label="Wishlist" className="hidden sm:inline-flex">
        <HeartIcon />
      </IconLink>

      <AccountMenu />

      <CartDrawer />
    </div>
  );
}
