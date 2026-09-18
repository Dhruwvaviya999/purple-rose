/**
 * Presentation types for the customer account.
 *
 * The same contract as `commerce.ts` and `cart.ts`: these describe what the
 * interface renders, not how anything is stored. No component imports a Prisma
 * type, so the `Address` table can change shape without a component changing
 * with it.
 */

/** What the account area knows about whoever is signed in. */
export type AccountProfile = {
  /** What they have chosen to be called, or null if they never said. */
  name: string | null;
  /**
   * The number they sign in with, in E.164.
   *
   * Shown, never editable here. It is the account's identity and it is proven
   * by a one-time code; changing it needs a verification flow of its own, which
   * is a later phase.
   */
  phoneNumber: string;
  /**
   * Whether to offer the admin link in the account navigation.
   *
   * Convenience only. `/admin` enforces the role on the server whether or not
   * this is true, so a customer who sets it in a debugger gets no further than
   * one who cannot see the link.
   */
  isAdmin: boolean;
  /** How many addresses they have saved, for the overview's summary line. */
  addressCount: number;
};

/** One saved address, as a card and a form render it. */
export type AddressData = {
  /**
   * Used in the edit link and as the id an action names.
   *
   * **Not authorisation.** Every statement taking one is scoped to the
   * signed-in customer's own rows in the same query, exactly as a cart line id
   * is. It is never rendered as text — a customer has no use for a UUID.
   */
  id: string;

  label: string;
  recipientName: string;
  /** E.164, as stored. Their own number, so it is shown in full. */
  phoneNumber: string;

  addressLine1: string;
  addressLine2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  postalCode: string;
  /** ISO alpha-2, as stored. */
  country: string;
  /** "India" — resolved for display so no component maps codes to names. */
  countryName: string;

  isDefault: boolean;

  /**
   * The address as one line of plain text.
   *
   * Built on the server so the card, the delete confirmation and an accessible
   * name all describe the same address the same way. Plain text throughout:
   * nothing in an address is ever rendered as HTML.
   */
  summary: string;
};

/** The whole list, plus what the page needs to decide around it. */
export type AddressBook = {
  addresses: readonly AddressData[];
  /** True when another address would exceed the per-customer limit. */
  isFull: boolean;
  /** The ceiling, so the message can name it. */
  limit: number;
};
