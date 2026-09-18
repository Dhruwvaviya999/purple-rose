# The bag

Phase 9. The first thing in this application a person can own **without an
account**.

The wishlist needed somebody to be signed in, because a saved list belongs to an
account. A bag does not: forcing a sign-in before letting somebody put a dress in
one is the most reliable way to lose a sale. So the bag has two kinds of owner,
and almost every decision below follows from that.

> **The database is the source of truth, the owner is resolved on the server, and
> the server computes every number.** Nothing about a bag lives in
> `localStorage`. The cookie carries an opaque token and nothing else — no
> product, no price, no quantity, no identity.

---

## Contents

- [What a shopper can do](#what-a-shopper-can-do)
- [Data model](#data-model)
- [Ownership](#ownership)
- [The guest token](#the-guest-token)
- [Guest bag lifetime](#guest-bag-lifetime)
- [The service layer](#the-service-layer)
- [Server Actions](#server-actions)
- [Validation](#validation)
- [Variant identity](#variant-identity)
- [Quantity rules](#quantity-rules)
- [Stock: read, never reserved](#stock-read-never-reserved)
- [Prices and the snapshot](#prices-and-the-snapshot)
- [Totals](#totals)
- [Unavailable lines](#unavailable-lines)
- [The merge](#the-merge)
- [Sign-in, sign-out and devices](#sign-in-sign-out-and-devices)
- [The interface](#the-interface)
- [Product cards](#product-cards)
- [Revalidation](#revalidation)
- [Caching and isolation](#caching-and-isolation)
- [Concurrency](#concurrency)
- [Security](#security)
- [Performance](#performance)
- [Testing](#testing)
- [What is deliberately not here](#what-is-deliberately-not-here)

---

## What a shopper can do

Choose a colour and a size, add the piece to a bag, see the count, open the
drawer, change the quantity, remove a line, empty the bag, and review it all on
`/cart`. Signed in or not.

A guest's bag survives a reload, a new tab and a closed browser. When they sign
in it becomes their account's bag, on every device they sign in on.

---

## Data model

Two tables, added in `prisma/migrations/20260918120000_add_cart`.

```
User ──0..1── Cart ──1:N── CartItem ──N:1── ProductVariant
guest token ──┘
```

### `Cart`

| Column           | Notes                                                |
| ---------------- | ---------------------------------------------------- |
| `id`             | UUIDv7. **The browser never sees it.**               |
| `userId`         | unique, nullable — set for a signed-in shopper       |
| `guestTokenHash` | unique, nullable — `sha256` of the guest cookie      |
| `expiresAt`      | guest bags only                                      |
| `createdAt`      |                                                      |
| `updatedAt`      | touched when the contents change                     |

Both owner columns are nullable, which in PostgreSQL means many rows may have
`NULL` in either — that is what lets thousands of guests each have a bag while
`guestTokenHash` stays unique. The rule that the nullability alone cannot express
is enforced by a CHECK:

```sql
CHECK (("userId" IS NULL) <> ("guestTokenHash" IS NULL))
```

Both null would be a bag nobody can reach. Both set would be a bag with two
claimants and an ambiguous merge. A second CHECK ties `expiresAt` to guest
ownership, so a guest bag cannot be created without an end date and an account
bag cannot be given one and vanish from under its owner.

### `CartItem`

| Column      | Notes                                |
| ----------- | ------------------------------------ |
| `id`        | UUIDv7                               |
| `cartId`    | FK → `Cart`, cascade                 |
| `variantId` | FK → `ProductVariant`, cascade       |
| `quantity`  | CHECK `>= 1 AND <= 999`              |
| `unitPrice` | paise, CHECK `>= 0`                  |
| `createdAt` | what the bag is ordered by           |
| `updatedAt` |                                      |

`@@unique([cartId, variantId])` is what makes "add the same thing twice" increase
a quantity rather than create a second line, whatever order the requests arrive
in.

The database CHECK on quantity is a **sanity** bound, not the business rule. The
per-line maximum of 20 lives in `lib/cart/limits.ts`, so merchandising can change
it without a migration; 999 catches the impossible.

### Indexes

| Index                                  | Why                                       |
| -------------------------------------- | ----------------------------------------- |
| `Cart_userId_key` (unique)             | one bag per account; every account lookup |
| `Cart_guestTokenHash_key` (unique)     | one bag per guest; every guest lookup     |
| `Cart_expiresAt_idx`                   | the expiry sweep                          |
| `CartItem_cartId_variantId_key` (unique) | no duplicate lines; every read of a bag |
| `CartItem_variantId_idx`               | the FK check when a variant is deleted    |

No separate index on `Cart.userId`, `Cart.guestTokenHash` or `CartItem.cartId` —
the unique constraints already create one each, and the composite's leading
column covers the third. A redundant index is maintained on every write.

### Foreign keys

All cascade. `Cart.userId` because nothing here outlives the account it belongs
to. `CartItem.variantId` to match every other child of the catalogue. In practice
the variant cascade never fires: the catalogue **archives rather than deletes**,
there is no product-delete workflow in the admin area, and Phase 9 did not add
one. The cascade exists so a hard delete, wherever one is ever introduced, cannot
leave a line pointing at nothing.

---

## Ownership

Resolved once per request, in `lib/cart/owner.ts`, and never derived from
anything in a request body:

```
signed in?  → session cookie → Session row → User.id → Cart.userId
otherwise   → cart cookie → sha256 → Cart.guestTokenHash
neither     → null, which means an empty bag and no row
```

Everything below that takes a `CartOwner` and never looks at a cookie or a
session again. The consequences:

- **No service function takes a `cartId`.** A bag id from a browser has nowhere
  to go, and the browser never receives one anyway.
- **No schema accepts a `userId`.**
- A `cartItemId` *is* accepted, because the interface has to say which line the
  `−` was pressed on. It is not authority: every statement that takes one is
  scoped to the caller's own bag in the same query, so a line id belonging to
  somebody else matches nothing.

`pnpm check:cart` asserts all of this by reading the source, not only by
exercising the behaviour.

### Reads and writes are deliberately different

A cookie can only be written from a Server Action or a Route Handler; a Server
Component may read one. That is not a limitation to route around — it is the
right shape:

- `resolveOwnerForRead()` returns `null` when there is no cookie. **Browsing
  never mints a guest bag.** Somebody who looks at ten pages and adds nothing
  leaves no row and no cookie behind.
- `resolveOwnerForWrite()` is reachable only from an action, and is the only
  thing that creates an identity.

---

## The guest token

The cookie is `pr_cart`. Its value is 32 random bytes in base64url — 43
characters, 256 bits — and the database stores only `sha256(token)`.

| Property   | Value                                    |
| ---------- | ---------------------------------------- |
| `HttpOnly` | yes — no script can read it              |
| `Secure`   | in production; off on `http://localhost` |
| `SameSite` | `Lax`                                    |
| `Path`     | `/`                                      |
| `Expires`  | 30 days, pushed forward on every write   |

**Why a token and not the `Cart.id`.** A bag id in a cookie is a bag id an
attacker can guess, enumerate or paste. A hashed opaque token means the `Cart`
table holds no usable key: leaking it hands nobody a bag. It is the same design
as the session cookie, for the same reason, and a plain SHA-256 is enough for
both — 256 bits of entropy cannot be brute forced from a digest, unlike a
six-digit code, which is why OTPs get an HMAC and these do not.

**What the cookie does not carry**: no product, no price, no quantity, no user
id, no bag id, no role. It is a bearer credential for one row.

**A token of the wrong shape is discarded without a query.** It cannot become a
database round trip, and it never produces an error a shopper has to read — they
simply have no bag, and the next thing they add issues a fresh identity.

---

## Guest bag lifetime

Thirty days, matching the session lifetime, configurable with
`CART_GUEST_TTL_DAYS`. Written on the row at creation and pushed forward on every
write, so an active shopper's bag does not lapse under them.

**Cleanup** is `deleteExpiredGuestCarts()`. It is deliberately **not** wired to a
page view: a shopper loading the home page should not pay for a sweep of somebody
else's abandoned bag. It exists so the scheduled job that will call it has
something correct to call — the same arrangement as `deleteExpiredSessions`. No
worker was introduced in this phase.

Account bags never expire and are untouched by the sweep by construction: they
have no `expiresAt`, and the CHECK constraint guarantees it.

---

## The service layer

`src/lib/services/cart-service.ts` is the only module that queries the cart
tables.

| Function                  | Purpose                                     |
| ------------------------- | ------------------------------------------- |
| `getCart`                 | the whole bag, reconciled with the catalogue |
| `getCartCount`            | one aggregate, for the badge                 |
| `addToCart`               | add, or increase an existing line            |
| `updateCartItemQuantity`  | set a line to an exact quantity              |
| `removeFromCart`          | remove a line                                |
| `clearCart`               | empty the bag                                |
| `mergeGuestCart`          | fold a guest bag into an account bag         |
| `deleteExpiredGuestCarts` | housekeeping for a future scheduled job      |

**Nothing Prisma-shaped leaves it.** Callers get `CartItemData` and `CartData`
from `types/cart.ts`.

**It reads no request state.** No `cookies()`, no `getCurrentUser()`, no Next
import at all — which is what lets `pnpm check:cart` exercise it directly. The
request-bound half is `lib/cart/owner.ts`, and the Next-free primitives they
share are in `lib/cart/ownership.ts`. Same split as the wishlist's.

Expected failures are result codes, not exceptions:

```ts
type CartResult =
  | { ok: true; quantity: number; capped: boolean; available: number }
  | { ok: false; code: "variant-not-found" | "variant-unavailable"
                     | "out-of-stock" | "invalid-quantity"
                     | "line-not-found" | "cart-full" }
```

---

## Server Actions

`src/actions/cart.ts` exports exactly four: `addToCartAction`,
`updateCartItemAction`, `removeCartItemAction`, `clearCartAction`. Shared helpers
live in `lib/cart/action-support.ts`, because a helper exported from a
`"use server"` file would be a public endpoint with no authorisation of its own.

Each does the same five steps in the same order, and the order is asserted:

1. **Resolve the owner** — `resolveOwnerForWrite()`, first, before any input is
   read. This is also what issues a first-time guest their cookie.
2. **Validate** with Zod.
3. **Act as that owner.**
4. **Revalidate** the routes that render a bag or a badge.
5. **Return a safe result**, carrying the server's own count.

### What the browser is told

`src/features/cart/cart-state.ts` holds the result type and the complete message
table. Nothing downstream improvises wording.

| Situation                        | Message                                                    |
| -------------------------------- | ---------------------------------------------------------- |
| added                            | "Added to your bag."                                       |
| added, capped by stock           | "Only 5 available, so that is what is in your bag."         |
| quantity changed                 | "Bag updated."                                             |
| removed                          | "Removed from your bag."                                   |
| unknown id, draft or archived    | "That piece is no longer available."                       |
| no stock                         | "That size has just sold out."                             |
| line already gone                | "That item is no longer in your bag."                      |
| 100-line ceiling                 | "Your bag is full. Remove something to make room…"          |
| anything else                    | "Unable to update your bag. Please try again."             |

A malformed id and an id naming a draft produce **the same sentence**
deliberately, so the reply cannot be used to ask whether an unpublished piece
exists. No Prisma error, SQL string, constraint name, Neon detail or stack ever
crosses this boundary; failures are logged server-side and become the generic
message.

---

## Validation

`src/lib/validations/cart.ts`. A mutation says **which variant** or **which
line**, and **how many**. That is all there is.

```ts
export const addToCartSchema = z.object({
  variantId: variantIdSchema,   // z.uuid()
  quantity: quantitySchema,     // z.int().min(1).max(999)
});
```

`z.int()` rejects decimals, `NaN` and both infinities outright rather than
coercing them. There is no field for a price, a subtotal, a stock figure, a
product name, a colour label or a size label, because the server derives every
one of those and would ignore them if they were sent.

---

## Variant identity

A bag holds `ProductVariant` — this product, in this colour, in this size — never
a product, a slug, a name or a SKU string.

The interface speaks in labels and the database speaks in ids, so
`ProductDetailData.variants` carries the translation: `{ id, sku, colourSlug,
sizeValue, available }`, built in the product mapper from rows the page was
already reading. The purchase panel looks up the pair the shopper chose and sends
that id.

**The id is not authority.** `resolvePurchasableVariant` re-checks, on every
mutation, that:

- the variant exists;
- it is still offered (`isActive`);
- **its product is ACTIVE** — a draft and an archived piece are equally not for
  sale;
- there is stock.

The product is reached *through* the variant rather than taken as a second
argument, which makes "does this variant belong to this product?" unanswerable
rather than merely answered — there is no pair that could disagree.

---

## Quantity rules

| Rule                   | Value                                        |
| ---------------------- | -------------------------------------------- |
| Minimum per line       | 1                                            |
| Maximum per line       | 20 (`lib/cart/limits.ts`)                    |
| Database sanity bound  | 1–999 (CHECK)                                |
| Maximum lines per bag  | 100                                          |
| `quantity: 0` on update| removes the line                             |

**Adding is relative; updating is absolute.** "Add two" to a line holding one
makes three, which is what a shopper means; a `+` control sets an exact number,
which is what the control shows. Both are computed from the row the database
holds, not from a quantity the browser believed — which is what makes a second
tab harmless.

The per-line maximum is **not** environment-configurable, unlike the guest
lifetime. The browser imports the same constant to grey out `+`, and a limit the
two runtimes could disagree about is a control that looks broken on exactly the
deployment where it matters.

---

## Stock: read, never reserved

**Adding to a bag reserves nothing.** Nothing in the cart service decrements
`Inventory`, creates a reservation or writes a movement — `pnpm check:cart`
asserts that by reading the source, and again by comparing stock before and after
an add.

Stock is *read*, for two purposes: to refuse a quantity that plainly cannot be
met, and to tell a shopper what is left.

Over-asking is **capped, not refused**. Somebody asking for seven of the five
that exist gets five and is told "Only 5 available, so that is what is in your
bag." Refusing outright would leave them with nothing and no obvious next step.

Two shoppers can hold the last dress in two bags at once, and that is correct
behaviour rather than a bug: cart validation is a courtesy, and **final stock
commitment belongs to the order phase**, which does not exist yet. Until it does,
nothing in this application promises that what is in a bag can be bought.

---

## Prices and the snapshot

`CartItem.unitPrice` stores what one cost when the line was last written.

**It is not an order price and not a promise.** It exists for exactly one
purpose: so the application can notice the catalogue price has moved since the
shopper added the piece.

On every read, `getCart` compares the snapshot with `Product.price`. Where they
differ it:

1. renders the **current** price and recomputes the totals from it;
2. flags the line `priceChanged` and the bag `hasPriceChanges`, which the page
   turns into "Prices have changed for some pieces since you added them. Your bag
   shows the current price.";
3. writes the current price back to the snapshot, so the notice is shown once
   rather than on every page view forever.

That third step is a write during a read, which is unusual enough to justify: the
snapshot has done its job the moment the change has been noticed and said. The
write is best-effort and its failure is swallowed, because the bag renders from
the current catalogue price either way — a failed refresh costs a repeated notice
and nothing else.

Sale transitions fall out of the same rule. `compareAtPrice` is read live and
never snapshotted, so regular→sale, sale→regular and a changed sale price all
simply show the current state. **The old price is never presented.**

Nothing else is copied onto a line: no name, no image, no colour, no size. Those
are reachable through the variant and would only drift.

---

## Totals

Integer paise throughout. No float, no `parseFloat`, no decimal arithmetic —
`unitPrice * quantity` on integers, summed.

`subtotal` counts only lines that can actually be bought. Withdrawn and
out-of-stock lines are shown and excluded, because a total including things the
shopper cannot have is a number that changes at checkout for reasons nobody
explained.

`count` — the badge — is more generous: it includes out-of-stock lines, because
the piece is still offered and the stock may come back, and excludes withdrawn
ones, because they are not part of the shop any more. It counts **garments, not
lines**: two of a dress and one of a top is three.

There is **no tax line, no shipping line and no discount line**. None of those
exist, and a fabricated number beside a real subtotal is how a total stops being
believable.

---

## Unavailable lines

Four states, because the causes differ and a shopper can act on some of them:

| Status         | Meaning                              | In count | In subtotal |
| -------------- | ------------------------------------ | -------- | ----------- |
| `available`    | offered, enough stock                | yes      | yes         |
| `limited`      | offered, fewer left than asked for   | yes      | yes         |
| `out-of-stock` | offered, none left                   | yes      | no          |
| `unavailable`  | withdrawn, or the variant retired    | no       | no          |

**Nothing is ever silently deleted.** An admin archiving a piece is not a reason
to throw away what a shopper told us they wanted, and a bag that quietly loses
things is a bag nobody trusts. A withdrawn line keeps its photograph and name,
loses its link (the product page 404s for anything not ACTIVE), says "Currently
unavailable" in words, and can be removed by hand whenever the shopper chooses.

If the piece is republished or restocked, the same line becomes ordinary again by
itself, with nothing re-added.

---

## The merge

`mergeGuestCart(userId, guestTokenHash)`, run once immediately after a successful
sign-in. Everything about it is built around one requirement: **a shopper must
not lose anything.**

### What it does

1. Find the guest bag. No guest bag → nothing happens.
2. Resolve (or create) the account bag.
3. Read both, and the current catalogue state of every variant involved.
4. Add quantities for the same variant together.
5. Cap each against current stock and the per-line maximum.
6. Take every price from the catalogue — a week-old guest price cannot survive a
   sign-in.
7. Upsert every line into the account bag **and delete the guest bag, in one
   transaction**.

Guest `A×2, B×1` plus account `A×1, C×3` becomes `A×3, B×1, C×3`, subject to
stock.

A line whose product has since been withdrawn is **still moved**. It will show as
unavailable, and dropping it would be exactly the silent loss this design avoids.

### Why it cannot half-happen

The guest bag is deleted in the same transaction that writes its contents. If any
part fails, nothing happened: the account bag is untouched and the guest bag is
still there, cookie and all, for the next attempt. The one ordering that would
lose a bag — delete the guest side, then fail to write the account side — is
impossible by construction rather than by care.

### Why it is idempotent

The guest bag is gone on success, so a second call finds nothing and writes
nothing. Two tabs signing in at once, or a retried action, cannot double a
quantity. The unique index on `(cartId, variantId)` is the backstop underneath
that.

### Why it cannot fail a sign-in

`lib/cart/sign-in.ts` wraps the whole thing in a `try`. Authentication has
already succeeded — the session row exists and the cookie is set — before the
merge runs, and a bag is not a reason to refuse somebody entry to their own
account. `actions/auth.ts` gained one line, not a commerce branch.

---

## Sign-in, sign-out and devices

| Event                         | What happens                                                     |
| ----------------------------- | ---------------------------------------------------------------- |
| First visit                   | No cookie, no row, empty bag                                     |
| First add as a guest          | Token minted, cookie set, `Cart` created                         |
| Reload / new tab              | Same cookie, same bag                                            |
| Sign in                       | Guest bag merged in, guest cookie cleared                        |
| Sign in on a second device    | The account's bag, already there                                 |
| Sign out                      | Account bag stays in the database, unreachable from this browser |
| Merge failed, then sign out   | The guest cookie is still there; the guest bag is still theirs   |
| Cookie expires or is cleared  | A fresh identity on the next add                                 |
| Tampered cookie               | Treated as no cookie; a fresh identity on the next add           |

**Sign-out deliberately does not touch the bag.** The account's bag stays tied to
the account and becomes unreachable the instant the session is revoked, because
reaching it needs a session. The browser is left with whatever guest identity it
has — in the ordinary case none, because a successful sign-in cleared the cookie
as it merged. So an anonymous browser after sign-out sees an empty bag, never the
account's.

---

## The interface

Everything below the drawer is a Server Component. The only client components are
the ones that must be: the drawer's open state, the quantity controls, the
add-to-bag button and the clear-bag confirmation.

**Server-confirmed, never optimistic.** The badge moves when the database says it
moved. Nothing counts up and quietly counts back down if a write failed. While a
write is in flight the control shows a spinner, reports `aria-busy` and refuses a
second press — and behind that the server computes from the row, so even a press
that slipped through could not double anything.

Controls are marked `aria-disabled`, **not** `disabled`, while working: a
disabled element cannot hold focus, so a keyboard user pressing `−` down to one
would be thrown to the top of the document by their own last press. This is the
same bug the wishlist heart avoided in Phase 8.

**The drawer is the shared `Drawer` from Phase 4**, unchanged — portalled out of
the header, Escape to close, background scroll locked, everything behind it
`inert`, focus starting on the close button and returning to the trigger. A
second drawer implementation would be a second set of those behaviours to keep
correct.

**Accessibility.** Every control names the piece it acts on ("Increase quantity
for Poppy Cotton Sundress"), because six identical "Increase quantity" buttons
down a list are six unusable buttons. The quantity is real text, not a number
implied by the shape of a control. The count is in the bag button's accessible
name, not only in a small badge. Outcomes go to a polite live region that is
rendered from the start, because a region inserted with its text is frequently
missed. `CartLineItem` is one component used by both the drawer and the page, so
the two cannot drift.

**Checkout is a placeholder and says so.** It is `aria-disabled` rather than
hidden, so the explanation is heard rather than skipped past. No address is
collected and no payment SDK exists.

---

## Product cards

A card has no colour control and no size control, so most of the time it cannot
know which variant "add to bag" would mean. **It does not guess.** Picking
whatever the sort happened to put first is how a shopper receives the wrong
garment.

So there are exactly two behaviours, decided by data rather than by the
component:

- **Exactly one purchasable combination** — a one-size piece, or one cut in a
  single colour and size. `ProductCardData.soleVariantId` is set, and the card
  adds it directly.
- **Anything else** — a link labelled "Choose size", to the product page where
  the controls are.

`soleVariantId` is computed in the product mapper from variant rows the card
query already reads, so this costs no extra query and no per-card lookup. The
test is on the *shape* of the product — one active variant — not on today's
inventory alone, so a card does not silently change meaning when a second size
comes back into stock.

The control is revealed on hover **and on focus** on large screens, and is always
visible below the large breakpoint where there is no hover.

This is also the wishlist's "move to bag": wishlist cards are the same
`ProductCard`, so a saved piece gets the same quick-add or the same route to the
size controls. A dedicated wishlist-to-bag flow with its own variant picker was
left for a later phase.

---

## Revalidation

`revalidateCartRoutes()` in `lib/cart/action-support.ts`:

- `/cart`
- `/` as a **layout**

Every storefront route renders per request, so nothing stale is held on the
server. What this clears is the **client Router Cache**: the RSC payloads a
browser keeps for routes it has already visited.

The layout revalidation is the part that differs from the wishlist's, on purpose.
The bag badge lives in the store layout and is the thing that visibly changes on
every add; a shopper adding from the shop grid watches that number, and a stale
one reads as a failed add. The wishlist heart is inside the page, so refreshing
the page was enough there.

Nothing product-specific is revalidated: adding to a bag changes nothing about a
product page, and throwing away cached catalogue payloads on every add would be
paying for nothing.

---

## Caching and isolation

**This is the part to get wrong quietly, so it is spelled out.**

A bag is the most personal thing in the application, and most of the people
holding one are not even signed in — they are identified by a cookie. Serving one
shopper's bag to another would be worse than a stale page.

- `/cart` is `dynamic = "force-dynamic"`. So is every storefront route, because
  the header badge is in the shared layout.
- `getCartForRequest` and `resolveOwnerForRead` are wrapped in React's `cache()`.
  That is **request-scoped memoisation**, not a shared or persistent cache: it
  lives for one render of one request and is discarded. It takes no arguments and
  reads the owner from the request precisely because, within one request, there
  is exactly one shopper.
- Nothing cart-shaped is tagged, and no cart read uses `use cache`.
- `/cart` carries `robots: { index: false, follow: true }` and is not in the
  sitemap. No shopper-specific data appears in any metadata.

`pnpm check:cart:http` checks the last of these from the outside: two cookie
jars, two bags, and neither one's pieces in the other's HTML.

---

## Concurrency

| Race                                   | What handles it                                        |
| -------------------------------------- | ------------------------------------------------------ |
| Two first adds, no bag yet             | `upsert` on the unique owner column, plus a `P2002` catch |
| Same variant added twice at once       | `upsert` on `(cartId, variantId)`                      |
| `+` pressed twice in one frame         | A `useRef` guard (synchronous, unlike `pending`)       |
| Two tabs changing one line             | The server sets from the row, not from a sent quantity |
| Sign-in in two tabs                    | The merge is idempotent; the guest bag is gone after the first |
| Two shoppers, one last garment         | Allowed. The bag reserves nothing; the order phase settles it |

No transaction is used for a simple add or remove: each is a single statement
guarded by a unique index. The merge **is** a transaction, because several writes
and a delete must succeed together. `touchCart` updates housekeeping columns
outside the transaction, because nothing reads them closely enough to pay for
one.

---

## Security

| Requirement                          | How                                                       |
| ------------------------------------ | --------------------------------------------------------- |
| No `userId` from the client          | No schema field, no action parameter, no service argument   |
| No `cartId` as authorisation         | No function takes one; the browser never receives one       |
| `cartItemId` is not authorisation    | Every statement taking one is scoped to the owner's bag     |
| No client-supplied money             | No price field anywhere; totals derived from `Product.price` |
| Guest isolation                      | One token, one bag; two browsers are two bags               |
| Customer isolation                   | Every query scoped by the resolved owner                    |
| Tampered token                       | Wrong shape → discarded without a query; unknown → empty bag |
| Cookie theft surface                 | `HttpOnly`, `Secure` in production, `SameSite=Lax`          |
| Database leak surface                | Only `sha256(token)` is stored                              |
| No internal detail leaks             | Fixed message table; errors logged server-side only         |
| No cross-user cache contamination    | `force-dynamic` + request-scoped memoisation only           |
| Admin has no special behaviour       | `ADMIN` is a `User` with an ordinary personal bag           |
| CSRF                                 | Server Actions: Next compares Origin against Host           |

---

## Performance

| Page                        | Cart queries                                        |
| --------------------------- | --------------------------------------------------- |
| Any page, no bag and no cookie | **0**                                            |
| Any storefront page with a bag | 1 (the whole bag, reused by header and drawer)   |
| `/cart`                     | 0 of its own — it reuses the layout's read          |

One query per request, not one per line: `getCart` joins lines, variants,
products, colours, sizes, stock and photographs in a single statement. On a
ten-line bag the naive version would be sixty round trips.

The alternative — a cheap `COUNT` for the badge and a lazy fetch when the drawer
opens — was considered and rejected: it means a spinner every time somebody
checks their bag, and two queries on `/cart`. `getCartCount` exists and is a
single aggregate, but it is used by the **actions**, which need a fresh number
after a write and not a whole bag.

---

## Testing

```bash
pnpm check:cart        # data, ownership, merge, catalogue interaction, constraints
pnpm check:cart:http   # status codes, cookies, isolation on the wire
pnpm check:cart:ui     # the whole feature in headless Chromium
```

`pnpm check:cart` runs in three parts. **Offline** reads `src/actions/cart.ts` as
source and asserts the endpoint shape — four exports, owner before validation, no
`userId`, no `cartId`, no price, every reply from one of two constructors, and no
write to `Inventory` anywhere in the service. **Database** exercises the real
service: guest bags, account bags, quantity rules, capping, isolation in both
directions, archiving, restocking, repricing, sale transitions, and the merge in
every shape. **Constraints** pushes the refused cases straight at PostgreSQL — a
bag owned by nobody, a bag owned by two, a line with zero in it.

`pnpm check:cart:ui` drives headless Chromium: a guest from product page to
drawer to `/cart` to reload to removal to emptying the bag, two browser contexts
proving guest isolation, the sign-in merge, the product-card quick-add, archive
and republish, keyboard operation of the drawer, and nine viewport widths. It
reuses the Phase 7 Playwright setup; no second browser-testing system was
introduced.

**The sign-in it drives depends on where you point it.** Against a development
server it fills the form, recovers the one-time code from the challenge row and
submits it, so the merge under test is the one `loginAction` performs. Against a
production build the console OTP transport refuses to run — deliberately, so a
code can never reach a production log — and the suite falls back to replaying
what `loginAction` does, printing a note saying which path it took. A suite that
degraded silently would be worse than one that reports it.

**Its test account is not in the `+1555…` block** the other suites reserve. That
range is the NANP's fictional block and `libphonenumber-js` correctly refuses it
as not a possible number, so the sign-in form rejects it at the first field and
no code is ever requested — fine for fixtures that must never collide with a
real account, useless for driving the real form. This suite uses a valid Indian
mobile in an obviously synthetic pattern instead, and deletes it by exact match
like every other fixture.

**All three write, and all three clean up in a `finally`.** Test accounts use
reserved `+1555…` numbers and are deleted by exact match — never by a pattern —
because a real customer record must never be removed to make a test report tidy.
Archive and restock checks operate on a product the script created.

> **Run the verification suites sequentially.** Several of them assert that the
> seeded catalogue is intact by counting rows, so a suite running beside another
> sees the other's in-flight fixtures and fails for the wrong reason. This bit
> during Phase 8 and is a convention now, not a preference.

---

## What is deliberately not here

- **Checkout, orders, payments, shipping, addresses, coupons, reviews, stock
  ledger.** Later phases. No payment SDK is installed.
- **Stock reservation.** See [Stock](#stock-read-never-reserved).
- **Tax and delivery figures.** Nothing to compute them from yet.
- **A saved-for-later list inside the bag.** The wishlist already is one.
- **A dedicated wishlist "move to bag" flow** with its own variant picker. The
  shared quick-add covers the simple case; the rest is a later phase.
- **A scheduled cleanup worker.** The function it will call exists.
- **Optimistic mutation.** Server-confirmed for the first transactional feature;
  revisit when there is a rollback story worth the complexity.
- **A bag on the admin side.** An admin browsing the storefront has an ordinary
  personal bag; nothing in `/admin` reads or writes one.
