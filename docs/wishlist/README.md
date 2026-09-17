# Wishlist

Phase 8. The first customer-owned persistent domain in the application.

Everything before this belonged to the shop: a catalogue anyone can read, an
admin area a staff member edits. The wishlist belongs to one person. That one
fact is what drives almost every decision below, so it is worth stating plainly
before the details:

> **The database is the source of truth, the session decides who is asking, and
> the server decides what they may do.** No wishlist state lives in
> `localStorage`, no wishlist state lives in a cookie, and no identifier that
> arrived from a browser is ever used to decide whose list is being touched.

---

## Contents

- [What a customer can do](#what-a-customer-can-do)
- [Data model](#data-model)
- [Ownership](#ownership)
- [The service layer](#the-service-layer)
- [Server Actions](#server-actions)
- [Validation](#validation)
- [Authentication and the sign-in journey](#authentication-and-the-sign-in-journey)
- [Product-level, not variant-level](#product-level-not-variant-level)
- [Archived products](#archived-products)
- [Batch wishlist state](#batch-wishlist-state)
- [The interface](#the-interface)
- [Revalidation](#revalidation)
- [Caching and isolation](#caching-and-isolation)
- [Concurrency](#concurrency)
- [Security](#security)
- [Performance](#performance)
- [Testing](#testing)
- [How Cart will use this](#how-cart-will-use-this)
- [What is deliberately not here](#what-is-deliberately-not-here)

---

## What a customer can do

Save a product, remove it, and see what they have saved. The same heart appears
on every product card and on the product page, and it does the same thing
everywhere because it is the same component.

The list survives a refresh, a sign-out and a different device, because it is
rows in PostgreSQL rather than anything in the browser.

A signed-out visitor sees the heart too. Theirs is a link to sign in that
remembers where they were.

---

## Data model

Two tables, added in `prisma/migrations/20260917120000_add_wishlist`.

```
User ─1:1─ Wishlist ─1:N─ WishlistItem ─N:1─ Product
```

### `Wishlist`

| Column      | Notes                                      |
| ----------- | ------------------------------------------ |
| `id`        | UUIDv7                                     |
| `userId`    | **unique** — the one-per-customer rule      |
| `createdAt` |                                            |
| `updatedAt` | touched when the contents change            |

`userId` is unique, and that constraint *is* the rule. Nothing relies on the
application checking first, which matters because two requests can check at the
same moment and both find nothing. See [Concurrency](#concurrency).

**Why a `Wishlist` row at all**, rather than hanging `wishlistItems` straight
off `User`? Because the list is a thing with a lifetime: it is created the first
time something is saved, it has its own timestamps, and a later phase that wants
named lists ("Holiday", "Wedding") widens this model instead of rebuilding the
items underneath. The indirection costs one indexed lookup.

### `WishlistItem`

| Column       | Notes                              |
| ------------ | ---------------------------------- |
| `id`         | UUIDv7                             |
| `wishlistId` | FK → `Wishlist`, cascade           |
| `productId`  | FK → `Product`, cascade            |
| `createdAt`  | what the list is ordered by        |

There is **no `updatedAt`**: an item has no mutable columns, so re-saving
something already saved is a no-op rather than an update, and there would never
be a second value to record.

### Indexes

| Index                              | Why                                                       |
| ---------------------------------- | --------------------------------------------------------- |
| `Wishlist_userId_key` (unique)     | one per customer; also serves every lookup by user         |
| `WishlistItem_wishlistId_productId_key` (unique) | no duplicates; also serves every read, which all start from `wishlistId` |
| `WishlistItem_productId_idx`       | the foreign key check on product deletion                  |

Three indexes, and each has a caller. Deliberately **not** created: a separate
index on `Wishlist.userId` (the unique constraint already made one) and a
separate index on `WishlistItem.wishlistId` (the composite unique's leading
column covers it). A redundant index is not free — it is maintained on every
write.

### Foreign keys

Both cascade.

`Wishlist.userId` cascades for the same reason `Session.userId` does: nothing
here outlives the person it belongs to.

`WishlistItem.productId` cascades to match every other child of `Product` —
memberships, variants and images all go when a product row does. **In practice
it never fires.** The catalogue archives rather than deletes; there is no
product-delete workflow in the admin area and Phase 8 did not add one. The
cascade exists so that a hard delete, wherever one is ever introduced, cannot
leave an item pointing at nothing.

---

## Ownership

A wishlist belongs to exactly one authenticated user, and is always reached
*from* that user:

```
session cookie → Session row → User.id → Wishlist (by unique userId) → items
```

Nothing in that chain accepts input from the caller. The consequences are worth
spelling out, because they are the whole security model:

- There is **no service function that takes a `wishlistId`**. Not a private one,
  not an exported one. An attacker holding somebody else's wishlist id has
  nothing to send it to.
- There is **no `userId` field in any schema**, and no action parameter that
  could carry one.
- A removal is a `deleteMany` scoped to the caller's own wishlist, so a product
  id naming something in another customer's list matches nothing and deletes
  nothing.

`pnpm check:wishlist` asserts these mechanically by reading the source, not just
by exercising the behaviour, because a rule that lives only in a comment is a
rule that eventually gets broken.

---

## The service layer

`src/lib/services/wishlist-service.ts` is the only module that queries the
wishlist tables.

| Function                   | Purpose                                            |
| -------------------------- | -------------------------------------------------- |
| `getWishlist`              | everything one customer saved, newest first        |
| `getWishlistedProductIds`  | the batch read a product grid uses                 |
| `isProductWishlisted`      | one product — for a product page, never a grid     |
| `countWishlistItems`       | the header count                                   |
| `addToWishlist`            | save                                               |
| `removeFromWishlist`       | remove                                             |
| `toggleWishlistItem`       | what the heart does                                |

Every one takes a `userId` it was handed by an authenticated caller.

**Nothing Prisma-shaped leaves it.** Callers get `WishlistEntry`, whose
`product` is the same `ProductCardData` the rest of the storefront renders,
mapped by the same `lib/catalog/product-mapper.ts`. There is no second product
shape for the wishlist, so a card on `/wishlist` and a card on `/shop` are
literally the same component with the same data.

**It reads no request state.** There is no `getCurrentUser()` in the file and no
Next.js import, which is what lets `pnpm check:wishlist` exercise it directly as
a plain module. The helper that resolves the signed-in customer for a page lives
next door, in `src/lib/wishlist/page-state.ts`.

### Expected failures are results, not exceptions

`addToWishlist` and friends return a discriminated union:

```ts
type WishlistResult =
  | { ok: true; wishlisted: boolean; productSlug: string }
  | { ok: false; code: "product-not-found" | "product-unavailable"
                     | "already-saved" | "not-saved" | "limit-reached" }
```

"Already saved" and "not saved" are outcomes worth naming, and the endpoint
above decides what to tell the customer about them — which is that their intent
was satisfied. See [Server Actions](#server-actions).

### The size limit

`MAX_WISHLIST_ITEMS = 500`, and `getWishlist` caps its own `take` at it.

Nothing in the product asked for a limit and a customer with three hundred saved
pieces is a customer, not an attack. It exists so a scripted client cannot grow
one row per product in the catalogue, forever, against an endpoint that needs no
payment. It is far above any real list, and it is documented rather than silent.

---

## Server Actions

`src/actions/wishlist.ts` exports exactly three:

- `addToWishlistAction(productId)`
- `removeFromWishlistAction(productId)`
- `toggleWishlistAction(productId)`

Three and no more, because every export in a `"use server"` file is a callable
endpoint. Shared helpers live in `src/lib/wishlist/action-support.ts` for the
same reason — a helper exported from the action file would be a public entry
point with no authorisation of its own.

All three delegate to one private body that does five things in this order:

1. **Authenticate.** `getCurrentUser()`, first, before any input is read.
2. **Validate.** Zod, on a payload containing a product id and nothing else.
3. **Act as that user.** The `userId` passed to the service is the session's.
4. **Revalidate** the routes that render a heart.
5. **Return a safe result.**

The order is the security property, and it is asserted: an action that validated
first and checked the session afterwards would still be doing work on behalf of
an unauthenticated caller.

### Why they refuse rather than redirect

An anonymous caller gets `{ ok: false, code: "SIGNED_OUT" }`, not
`redirect("/login")`. A redirect from a Server Action reads as success to
anything that is not a browser following it, and tells a prober that the
endpoint exists and merely declined. The sign-in *journey* is the interface's
job — see below.

### What the browser is told

`src/features/wishlist/wishlist-state.ts` holds the result type and the complete
set of messages. Nothing downstream improvises wording.

| Situation                        | Message                                           |
| -------------------------------- | ------------------------------------------------- |
| saved                            | "Added to your wishlist."                         |
| removed                          | "Removed from your wishlist."                     |
| not signed in                    | "Sign in to save pieces to your wishlist."        |
| unknown, draft or archived piece | "That product is no longer available."            |
| the 500-item ceiling             | "Your wishlist is full. Remove a piece to make room for another." |
| anything else                    | "Unable to update your wishlist. Please try again." |

A malformed product id and an id naming a draft produce **the same sentence**
deliberately, so the reply cannot be used to ask whether an unpublished product
exists.

No Prisma error, SQL string, constraint name, Neon detail or stack ever crosses
this boundary. Failures are logged on the server and become the generic message.

### Duplicates are reported as success

The service says `already-saved`; the endpoint returns "saved". From the
customer's side a double click did exactly what it meant to, and reporting it as
a failure would make a working control look broken. `not-saved` is mapped the
same way.

---

## Validation

`src/lib/validations/wishlist.ts`, and it is very short:

```ts
export const productIdSchema = z.uuid();
export const wishlistMutationSchema = z.object({ productId: productIdSchema });
```

One field. No `userId`, no `wishlistId` — there is nowhere to put one because
nothing accepts one. Every id in the schema is a UUIDv7, so a junk string is
refused before a query is built rather than relied upon to match nothing.

---

## Authentication and the sign-in journey

The existing session infrastructure is used as-is. No second authentication
mechanism was introduced.

- **Pages** use `requireUser("/wishlist")`, which redirects.
- **Actions** use `getCurrentUser()` and refuse.
- **The proxy** (`src/proxy.ts`) treats `/wishlist` as protected, alongside
  `/admin`.

That third one deserves a note. `requireUser()` inside a streaming page issues
its redirect after the response has begun, so the browser navigates but the
status code is 200 — correct for a person, indistinguishable from "served the
page" to anything checking the response. Catching the cookie-less case in the
proxy makes an anonymous request for `/wishlist` a plain 307 before any of it
renders. The proxy remains an optimistic filter that only looks at whether a
cookie is *present*; a revoked or forged cookie gets past it and is stopped by
`requireUser()`, which resolves the session against the database.

### Return destinations

`/wishlist` was added to `ALLOWED_PREFIXES` in `src/lib/auth/redirect.ts`,
joining `/admin` and `/shop`. That allow-list is the only way a destination
becomes reachable, so adding one is a decision rather than a pattern match.

The heart on a product builds `next=/shop/<slug>` — sign in, and you land back
on the piece you were trying to save. `safeRedirectPath` checks it again on the
way out, and refuses absolute URLs, protocol-relative URLs, backslash-smuggled
hosts and encoded variants of all three. `pnpm check:wishlist` and
`pnpm check:wishlist:ui` both test this.

---

## Product-level, not variant-level

A wishlist item references `Product`, not `ProductVariant`.

Saving is "I like this piece", not "I want this in plum, size M". A shopper's
size is usually decided at the point of buying, and a variant-keyed wishlist
would show the same dress three times and go stale the moment a colour is
retired.

So the wishlist does not store colour, size, SKU or any variant selection, and
the heart on the product page is unaffected by the colour and size controls
above it.

### Nothing is snapshotted

No price, no name, no image column. The row is a reference, so the wishlist
always shows what the product costs and is called **now**. If an admin changes a
price, the wishlist shows the new one; there is no attempt to preserve the old.

Price snapshots belong to an order line, which records what was actually agreed.
A wishlist records intent, and intent is about the piece.

---

## Archived products

The behaviour, stated exactly:

| Event                                   | What happens                                      |
| --------------------------------------- | ------------------------------------------------- |
| Admin archives a saved product          | The `WishlistItem` row **stays**                  |
| Customer opens `/wishlist`              | The piece is shown, marked unavailable            |
| Customer tries to save an archived piece| Refused: "That product is no longer available."   |
| Admin republishes it                    | The existing entry becomes ordinary again, by itself |

**The row is never silently deleted.** An admin withdrawing a piece is not a
reason to throw away what a customer told us they wanted, and a list that
quietly loses items is a list nobody trusts.

The asymmetry is the point: **you cannot add an unavailable product, but one you
already saved stays.** Adding requires `status === ACTIVE`, because a draft has
not been published and an archived piece has been withdrawn, so neither is
something a shopper could be browsing and choosing to save.

### How it is presented

`WishlistEntry.available` is false, and the card renders differently:

- the photograph is desaturated and dimmed — recognisable, clearly withdrawn;
- an **Unavailable** badge, in words;
- "Currently unavailable", with "Saved — it returns here if this piece comes
  back.";
- **no price**, because nothing is being offered at one;
- **no link**, because `/shop/[slug]` answers 404 for anything not ACTIVE and
  sending somebody to a not-found page makes it look like their fault;
- the heart stays, so the entry can be cleared.

It is not visually identical to an available piece, which is the requirement.

### Unpublished work is not discoverable through this

`getWishlist` is the one place in the application that reads a product without
`status: ACTIVE` in the query. That is safe because reaching a row requires it to
already be in *your own* wishlist, which requires it to have been ACTIVE when
you saved it. There is no path from here to a draft nobody has ever published.

---

## Batch wishlist state

The problem: a shop grid renders twenty-four cards, each of which needs to know
whether it is saved. `isProductWishlisted` per card is twenty-four round trips.

The solution is one query per page, not per card:

```
page
  → getWishlistStateFor([...product ids])   // one query, or none
  → ReadonlySet<string> | null
  → ProductGrid wishlisted={…}
  → ProductCard wishlisted={set.has(id)}
  → WishlistButton
```

`getWishlistStateFor` lives in `src/lib/wishlist/page-state.ts`. It returns
`null` — not an empty set — when nobody is signed in, because those mean
different things to the control: "not saved, tap to save" against "sign in to
save".

**Anonymous browsing costs nothing.** With no signed-in user the function returns
before touching the database, so the wishlist tables are not queried at all for a
visitor who has not signed in. `getCurrentUser` is request-cached and the header
has already called it, so there is no extra session lookup either.

Every storefront surface that renders a `ProductCard` uses it:

| Surface                      | Ids fetched                        |
| ---------------------------- | ---------------------------------- |
| Home (`/`)                   | both rails, in one call            |
| Shop (`/shop`)               | the page of results                |
| Search results               | the same route, the same call      |
| Product page related rail    | the product and the rail, one call |
| Wishlist (`/wishlist`)       | none — everything on it is saved   |

The wishlist page needs no lookup at all: every card on it is saved by
definition, so the set is built from the entries it already has.

---

## The interface

### `WishlistButton`

`src/components/commerce/wishlist-button.tsx` — the only client component the
feature adds, and the only place toggle logic lives.

**Server-confirmed, not optimistic.** The heart fills when the database says it
is filled. Optimism would mean a filled heart over a product that was never
saved whenever the network dropped, and rolling that back correctly is more
machinery than the 200ms it saves is worth. On failure the previous confirmed
state is kept, the reason is announced, and the control re-enables for a retry.
**A failed mutation never changes the heart.**

**Pending state** is a spinner plus `aria-busy`, and the click handler refuses
while a write is in flight. It is marked `aria-disabled`, *not* `disabled`: a
disabled element cannot hold focus, so `disabled` would throw a keyboard user
back to the top of the document on their own click, and the live region's
announcement would arrive with focus somewhere else.

**Accessibility.** Nothing rests on colour. The heart goes outline → solid, the
accessible name changes between "Save <piece> to your wishlist" and "Saved —
remove <piece> from your wishlist", and `aria-pressed` carries the state. The
outcome goes into a live region that is rendered empty from the start, because a
region inserted at the same moment as its text is frequently missed. No toast
system was introduced for two sentences.

**Signed out** it is a `<Link>` to `/login?next=…`, not a button that fails.

### `ProductCard`

Gained two optional props, `wishlisted` and `unavailable`, and no queries.

One thing worth knowing if you touch the card: the heart carries `z-10`. The
product name below it is a stretched link (`after:absolute after:inset-0`) that
lays a transparent layer over the whole tile so the card is tappable. Without a
stacking order the heart sits underneath it and every click opens the product
instead of saving it. This was invisible for four phases because the control did
nothing; `pnpm check:wishlist:ui` found it in the first browser run.

### Header

`src/components/layout/wishlist-link.tsx` — a Server Component, so the header
still ships no JavaScript for it. Signed out it makes no query at all. Signed in
it costs one `COUNT` on an indexed column and shows a badge. A customer with
nothing saved gets **no badge rather than a zero**, and no count is ever
invented.

### `/wishlist`

A Server Component. Heading, count, breadcrumb, grid and empty state are all
server-rendered; the only JavaScript on the page is the hearts. There is a
`loading.tsx` that draws the shell immediately and a skeleton grid.

Order is newest saved first, by `WishlistItem.createdAt DESC` — what somebody
saved last is what they came back for, and it is stable, whereas the product's
own dates would reshuffle a customer's list whenever an admin saved an edit.
There is no sorting or filtering UI, on purpose.

---

## Revalidation

`revalidateWishlistRoutes(productSlug)` in
`src/lib/wishlist/action-support.ts`, and it is deliberately narrow:

- `/wishlist` — the list that just changed
- `/shop` — the grid, where the same piece carries a heart
- `/shop/[slug]` — only the product that changed
- `/` — the home rails, which are cards with hearts

Every storefront route renders per request, so nothing stale is held on the
server. What this clears is the **client Router Cache**: the RSC payloads a
browser keeps for routes it has already visited. Without it, someone who saves a
piece from the grid, opens their wishlist and navigates back is shown the grid
the browser cached a minute ago, heart still empty, and reasonably concludes the
save failed.

**Not** `revalidatePath("/", "layout")`. The header count lives in the store
layout, and re-rendering every page's shell on every heart click to keep one
number fresh is the wrong trade; the count is correct on the next navigation,
which is when it is next read.

---

## Caching and isolation

This is the part to get wrong quietly, so it is spelled out.

**Wishlist state is per-customer and must never be shared.**

- `/wishlist` is `dynamic = "force-dynamic"`. Its entire content is one person's,
  so a cached copy served to anybody else would be a data leak rather than a
  stale page.
- Every storefront page that renders wishlist state is already
  `force-dynamic`, so none of it is written into a prerendered or shared
  response.
- `getWishlistStateFor` is wrapped in React's `cache()`. That is **request-scoped
  memoisation**, not a shared or persistent cache: it lives for one render of one
  request and is then discarded. It is also why the signature takes product ids
  and reads the user from the request rather than taking a `userId` — within one
  request there is exactly one signed-in user, and across requests nothing is
  retained.
- `getCurrentUser` is wrapped the same way and for the same reason; that
  predates this phase.
- Nothing wishlist-shaped is tagged, and no wishlist read uses `use cache`.

`/wishlist` carries `robots: { index: false, follow: true }` and is disallowed in
`robots.ts`. It is not in the sitemap, and no customer-specific data appears in
any metadata — the title and description are the same for everyone.

---

## Concurrency

Three races, and what handles each.

**Two first-time saves at once.** A customer with no `Wishlist` row opens two
tabs and saves in both. Both find nothing, both try to insert. `resolveWishlistId`
uses `upsert` on the unique `userId` and catches `P2002`: the loser re-reads the
row the winner created. Without this the customer's saved pieces would split
across two lists depending on which one a later query happened to find.

**The same product saved twice.** A double click, two devices, a retry.
`addToWishlist` does **not** pre-check with `findFirst` — there is a window
between a check and an insert, and a double click lands squarely in it. It
inserts and catches `P2002`. The unique index has no window.

**Toggle read-then-write.** `toggleWishlistItem` reads before deciding, and those
two steps are not atomic. They do not need to be: whichever branch is taken, the
write underneath is the same constraint-guarded operation. Two simultaneous adds
produce one row and one `already-saved`; two simultaneous removes produce one
deletion and one `not-saved`. Neither leaves a duplicate, and neither leaves the
customer looking at a state the database does not hold, because the endpoint
reports what the database says rather than what the click implied.

**No transaction is used for a simple add or remove**, because each is a single
statement protected by a unique index. `touchWishlist` updates `updatedAt`
separately rather than in a transaction with the write: that column is a
convenience for a future "recently changed" view, nothing depends on it, and a
transaction around every save would buy a stricter guarantee on a column with no
readers.

---

## Security

| Requirement                                 | How                                                    |
| ------------------------------------------- | ------------------------------------------------------ |
| No `userId` from the client                 | No schema field, no action parameter, no service argument |
| No `wishlistId` as authorisation            | No function anywhere takes one                          |
| Session decides ownership                   | `getCurrentUser()` → `User.id` → unique `Wishlist`      |
| Anonymous cannot mutate                     | Actions refuse with `SIGNED_OUT`; proxy 307s the page   |
| Customer isolation                          | Every query scoped by the caller's own wishlist         |
| Product ids validated                       | `z.uuid()` before any query is built                    |
| No internal detail leaks                    | Fixed message table; errors logged server-side only     |
| No cross-user cache contamination           | `force-dynamic` + request-scoped memoisation only       |
| Admin has no special behaviour              | `ADMIN` is a `User`; same tables, same rules, no separate model |
| CSRF                                        | Server Actions: Next compares Origin against Host and rejects mismatches |

Customer A attempting to remove a piece from Customer B's list is refused with
`not-saved` and changes nothing, because the `deleteMany` is scoped to A's own
wishlist. Toggling B's piece adds it to A's own list — which is the correct
outcome, not a leak: A learns nothing about B.

---

## Performance

| Page                  | Wishlist queries                                    |
| --------------------- | --------------------------------------------------- |
| Any page, signed out  | **0**                                               |
| Home, shop, product   | 1 batch read                                        |
| Header, signed in     | 1 `COUNT`                                           |
| `/wishlist`           | 2 — find the list, then read it with products joined |

No N+1 anywhere: no page loops over ids issuing a query each, and `getWishlist`
joins products, images and variants into the item query rather than fetching them
per item. Only the columns the card needs are selected, because the read reuses
`productCardSelect`.

There is no pagination, because a list capped at 500 does not need it and adding
it would be machinery with no caller. The service is shaped so that adding it
later means giving one query a cursor.

---

## Testing

```bash
pnpm check:wishlist       # database, authorisation, edge cases
pnpm check:wishlist:ui    # the whole feature in headless Chromium
```

`pnpm check:wishlist` runs in three parts.

**Offline** — reads `src/actions/wishlist.ts` as source and asserts the shape of
the endpoints: exactly three exports, authentication before validation, no
`wishlistId` anywhere, every reply built by one of two constructors, errors
logged rather than returned. Plus the redirect allow-list and the input schema.

**Database** — the real service against real rows: lazy creation, one wishlist
per user under four concurrent first saves, duplicate prevention, removal,
toggling, ordering, batch state, archiving, drafts, republishing, and isolation
between two test customers in both directions.

**HTTP** — an anonymous request for `/wishlist`, the redirect it gets, and that
`robots.txt` and the sitemap agree the page is private. Skipped, not failed, when
nothing is running.

`pnpm check:wishlist:ui` drives headless Chromium through the anonymous journey,
saving from a product page and from a card, cross-page state, rapid repeat
clicks, the wishlist page, removal, the empty state, keyboard operation, archive
and republish, a second device, a revoked session, nine viewport widths and tap
target sizes. It reuses the Phase 7 Playwright setup; no second browser-testing
system was introduced.

**Both write, and both clean up in a `finally`.** Test accounts use reserved
`+1555…` numbers and are deleted by exact match — never by a pattern — because a
real customer record must never be removed to make a test report tidy. Test
products carry a marker in their slug. Archive and republish operate on a product
the script created, so no published piece is ever withdrawn by a test.

Expect `prisma:error` lines in the output of `pnpm check:wishlist`. Several
checks violate a unique constraint on purpose; a `PASS` under one is the
constraint doing its job.

---

## How Cart will use this

Phase 9 can build a cart against the existing `ProductVariant` model without
touching any of this.

The wishlist answers "which pieces does this customer like". A cart answers
"which exact variants, and how many". Those are different questions against
different tables, and the wishlist deliberately does not pre-empt the second one:
it stores no colour, no size and no quantity.

The natural join is a "move to bag" control on a wishlist card that asks for a
colour and a size — the information the wishlist intentionally never captured —
and then writes a cart line against a `ProductVariant`. Nothing in the wishlist
needs to change for that, and a wishlist item does not have to disappear when
something is added to a bag.

The parts Cart should reuse rather than reinvent: the ownership chain
(`session → user → single row per user`), the unique-constraint-as-rule
approach, the batch-state pattern for grids, the server-confirmed control, and
the action shape of authenticate-validate-act-revalidate-return.

---

## What is deliberately not here

- **Cart, checkout, orders, payments, coupons, reviews, stock movements, image
  uploads.** Later phases.
- **Sharing a wishlist**, public wishlist URLs, or a gift registry.
- **Named or multiple lists.** The `Wishlist` row exists so this is an additive
  change rather than a rebuild.
- **Sorting and filtering on `/wishlist`.** Newest first, and nothing else,
  until there is a real use case.
- **Pagination.** See [Performance](#performance).
- **A "notify me when available" hook** on unavailable items. It is the obvious
  next thing the archived-product state suggests, and it needs a notification
  transport that does not exist yet.
- **A merge on sign-in** of anything saved while signed out. Nothing is saved
  while signed out: the heart sends you to sign in first, which is simpler and
  means there is no anonymous list to reconcile.
- **Customer account area.** Orders, addresses and profile editing are not
  built. The account menu links to the wishlist and to what already exists.
