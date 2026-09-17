/**
 * The quantity rules, shared by the server and the browser.
 *
 * In their own module, free of `server-only`, because both sides genuinely need
 * them: the service caps a quantity against them, and the `+` control greys out
 * when it reaches them. Deliberately **not** read from the environment, unlike
 * the guest lifetime next door — a limit the server could be configured to
 * disagree with the browser about is a control that looks broken on exactly the
 * deployment where it matters.
 *
 * These are business policy, not a technical ceiling. The database carries its
 * own much higher sanity bound (1 to 999, in the migration), so changing a
 * figure here is a deployment rather than a migration.
 */

/** A line holds at least one. Zero is a removal, handled as one. */
export const MIN_QUANTITY_PER_LINE = 1;

/**
 * The most of one variant a single line may hold.
 *
 * Twenty is a retail figure rather than a technical one: far above any real
 * order for one size of one garment, and low enough that a scripted client
 * cannot turn a bag into a denial-of-service. A shopper who asks for more is
 * not refused silently — the service caps the line and says what it did.
 */
export const MAX_QUANTITY_PER_LINE = 20;

/**
 * The most distinct lines one bag may hold.
 *
 * Same reasoning as the wishlist ceiling: nothing in the product asks for a
 * limit, and a shopper with forty lines is a shopper. This stops a script
 * growing one line per variant in the catalogue against an endpoint that needs
 * no payment.
 */
export const MAX_LINES_PER_CART = 100;

/** The shape the interface reads. Kept as one object so imports stay tidy. */
export const cartConfig = {
  minQuantityPerLine: MIN_QUANTITY_PER_LINE,
  maxQuantityPerLine: MAX_QUANTITY_PER_LINE,
  maxLines: MAX_LINES_PER_CART,
} as const;
