import { headerPlaceholders } from "@/config/navigation";
import { BagIcon, HeartIcon, SearchIcon } from "@/components/shared/icons";
import { IconButton } from "@/components/ui/icon-button";
import { AccountMenu } from "./account-menu";

/**
 * Header utility controls.
 *
 * Account is live: it signs you in, or shows who is signed in. Search,
 * wishlist and cart are designed but not implemented, so they render as
 * `aria-disabled` controls with an explanatory accessible name rather than
 * links to nowhere.
 */
export function HeaderActions() {
  return (
    <div className="flex items-center gap-0.5 sm:gap-1">
      <IconButton
        label={`${headerPlaceholders.search.label} — ${headerPlaceholders.search.note}`}
        title={headerPlaceholders.search.note}
        aria-disabled="true"
        className="hidden sm:inline-flex"
      >
        <SearchIcon />
      </IconButton>

      <IconButton
        label={`${headerPlaceholders.wishlist.label} — ${headerPlaceholders.wishlist.note}`}
        title={headerPlaceholders.wishlist.note}
        aria-disabled="true"
        className="hidden sm:inline-flex"
      >
        <HeartIcon />
      </IconButton>

      <AccountMenu />

      <IconButton
        label={`${headerPlaceholders.cart.label} — ${headerPlaceholders.cart.note}`}
        title={headerPlaceholders.cart.note}
        aria-disabled="true"
      >
        <BagIcon />
      </IconButton>
    </div>
  );
}
