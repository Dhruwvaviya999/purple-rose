import { headerPlaceholders } from "@/config/navigation";
import { BagIcon, HeartIcon, SearchIcon, UserIcon } from "@/components/shared/icons";
import { IconButton, IconLink } from "@/components/ui/icon-button";

/**
 * Header utility controls.
 *
 * Account points at the sign-in route, which exists. Search, wishlist and cart
 * are designed but not implemented, so they render as `aria-disabled` controls
 * with an explanatory accessible name rather than links to nowhere.
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

      <IconLink href="/login" label="Account">
        <UserIcon />
      </IconLink>

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
