import { CartDrawer } from "@/components/commerce/cart-drawer";
import type { CartData } from "@/types/cart";
import {
  SearchOverlay,
  type SearchSuggestion,
} from "@/components/commerce/search-overlay";
import { AccountMenu } from "./account-menu";
import { WishlistLink } from "./wishlist-link";

/**
 * The controls on the right of the header: search, wishlist, account, bag.
 *
 * All four are genuinely interactive. Search opens a panel, the wishlist and
 * the bag go to pages that exist, and the bag also opens a drawer. Where the
 * feature behind a control is not built, the control says so rather than doing
 * nothing quietly: none of them is a dead button.
 *
 * The wishlist and the bag are both fully real now. `WishlistLink` reads the
 * signed-in customer's saved count on the server; see that file for why it
 * costs nothing for an anonymous visitor. The bag arrives as a prop, read once
 * per request by the store layout, so the drawer opens with its contents
 * already there and no page pays for the same query twice.
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
  cart,
}: {
  searchSuggestions: readonly SearchSuggestion[];
  cart: CartData;
}) {
  return (
    <div className="flex items-center gap-0.5 sm:gap-1">
      <SearchOverlay suggestions={searchSuggestions} />

      <WishlistLink className="hidden sm:inline-flex" />

      <AccountMenu />

      <CartDrawer cart={cart} />
    </div>
  );
}
