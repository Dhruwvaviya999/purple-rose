# The customer account

Phase 10. Where the three things a customer owns finally have a front door.

Authentication gave them a way in. The wishlist and the bag gave them things to
own. This is the room those things live in, plus the one piece of data neither of
them needed and a future order cannot do without: **where to send the parcel.**

> **The session decides who is asking. Every address statement carries its owner
> in the `where`.** Not "fetch it, then check" — the ownership is part of the
> query, every time. An address id belonging to someone else matches nothing,
> which is indistinguishable from an id that names nothing, which is exactly what
> an attacker should learn.

---

## Contents

- [What a customer can do](#what-a-customer-can-do)
- [Routes](#routes)
- [Profile: deliberately one field](#profile-deliberately-one-field)
- [Address schema](#address-schema)
- [Ownership](#ownership)
- [The default address](#the-default-address)
- [Deleting, and what replaces a default](#deleting-and-what-replaces-a-default)
- [Validation](#validation)
- [The service layer](#the-service-layer)
- [Server Actions](#server-actions)
- [The interface](#the-interface)
- [Revalidation](#revalidation)
- [Caching and isolation](#caching-and-isolation)
- [Concurrency](#concurrency)
- [Security](#security)
- [Performance](#performance)
- [Testing](#testing)
- [Future checkout, and why orders must snapshot](#future-checkout-and-why-orders-must-snapshot)
- [What is deliberately not here](#what-is-deliberately-not-here)

---

## What a customer can do

See who they are signed in as, change the name they are addressed by, and manage
up to ten delivery addresses — add, edit, delete, and choose which one is the
default. Plus links to the wishlist and the bag, and a way to sign out.

That is the whole feature. It is short on purpose.

---

## Routes

| Route                       | What it is                          |
| --------------------------- | ----------------------------------- |
| `/account`                  | Overview: who, and links to the rest |
| `/account/profile`          | The name field, and the phone number shown |
| `/account/addresses`        | The address book                    |
| `/account/addresses/new`    | Add one                             |
| `/account/addresses/[id]`   | Edit one                            |

All five live under the `(store)` route group, so they keep the shop's header and
footer. **The account area is part of the shop, not a dashboard bolted onto it** —
the admin console has its own chrome for a reason, and a customer who has just
been browsing dresses should not feel they have been handed a SaaS control panel
to change their address in.

There is no `/account/orders`, because there are no orders. A navigation full of
links that apologise when you reach them is worse than a short one.

---

## Profile: deliberately one field

A customer may change **what they would like to be called**. Nothing else.

Not the phone number: it is the account's identity, it was proven with a one-time
code, and changing it means proving a new one — a verification flow, not a text
input, and a later phase if ever. Not the role: the server sets that and no form
touches it. And nothing else at all — no avatar, no birthday, no gender, no
preferences, no saved cards. **A profile page that collects data the shop has no
use for is a liability, not a feature.**

The narrowness is enforced rather than intended: `profileInputSchema` has one
field and `updateUserName` writes one column, and `pnpm check:account` asserts
both by reading the source.

Clearing the name is allowed and stores `null`. An account created by a one-time
code has none until somebody types one, and somebody who mistyped theirs should
not be stuck with it.

---

## Address schema

One table, added in `prisma/migrations/20260918140000_add_customer_addresses`.

| Column          | Type          | Notes                                  |
| --------------- | ------------- | -------------------------------------- |
| `id`            | UUIDv7        |                                        |
| `userId`        | UUID, FK      | cascade; indexed with `isDefault`      |
| `label`         | VarChar(40)   | free text, not an enum                 |
| `recipientName` | VarChar(120)  | not the account name                   |
| `phoneNumber`   | VarChar(16)   | E.164, same normaliser as sign-in      |
| `addressLine1`  | VarChar(200)  | required                               |
| `addressLine2`  | VarChar(200)? | optional                               |
| `landmark`      | VarChar(120)? | optional                               |
| `city`          | VarChar(80)   | required                               |
| `state`         | VarChar(80)   | required                               |
| `postalCode`    | VarChar(16)   | wide enough for any country            |
| `country`       | VarChar(2)    | ISO alpha-2, default `IN`              |
| `isDefault`     | Boolean       | at most one true per user              |

Four decisions worth stating:

**`label` is free text.** A customer with two homes needs "Home" and "Home 2", and
an enum makes that impossible. It is a nickname, never an identity — two addresses
may share one.

**`recipientName` is separate from the account name.** Ordering a gift to a sister
means the account says one thing and the doorstep needs another.

**`country` is stored, not assumed.** The shop delivers locally in India today. A
column that silently means India is a column that lies the moment that changes.
The database accepts any alpha-2 code; the *form* offers one, and widening that
is a change to `lib/account/limits.ts` and a validation rule — not a migration.

**`postalCode` is 16 characters, not 6.** The six-digit Indian PIN is a validation
rule, applied per country, not a shape the schema is locked into.

### Constraints

```sql
CREATE UNIQUE INDEX "Address_one_default_per_user"
  ON "Address" ("userId") WHERE "isDefault";

CHECK ("country" ~ '^[A-Z]{2}$')
CHECK (length(btrim(...)) > 0 for every required text column)
CHECK (optional columns are NULL or non-blank)
```

The partial unique index is the tool that actually makes "one default" true. An
ordinary unique index on `("userId", "isDefault")` would permit one default *and
one non-default* — the opposite of what is wanted. Indexing only the rows where
the flag is set leaves the `false` ones unconstrained and caps the `true` ones at
one.

**On Prisma and the partial index.** Prisma's schema language has no syntax for
one, so `schema.prisma` does not describe it. §39 asked whether that creates
drift; it was tested rather than assumed — `pnpm db:migrate` run twice after
applying reports *"Already in sync, no schema change or pending migration was
found"*, and `db:migrate:status` is clean. Prisma does not manage indexes it was
never told about, exactly as it does not manage the CHECK constraints added in
Phases 6 and 9. The application still enforces the rule in a transaction; the
index is the backstop, not the mechanism.

---

## Ownership

```
session cookie → Session row → User.id → Address.userId
```

Nothing in that chain accepts input from the caller. Concretely:

- **No schema accepts a `userId`.**
- **No write ever sets `userId`**, so an address cannot change hands.
- An address id **is** accepted, because a form has to say which row it is
  editing. It is not authority: every statement carries `userId` alongside it.

The test that matters is mechanical, and `pnpm check:account` runs it: it extracts
every `where: { … }` clause in the service and fails if any mentions `id` without
`userId`. A future edit that adds an unscoped query fails the suite rather than
quietly shipping.

`getAddress` uses `findFirst({ where: { id, userId } })` rather than
`findUnique({ where: { id } })` followed by a check. The two are not equivalent:
the second reads the row before deciding, which is one forgotten `if` away from
handing it over.

---

## The default address

**At most one per customer**, enforced in three places: the transaction that sets
it, the partial unique index, and the interface, which never shows two badges
because it renders from the server after the write.

**The first address a customer saves becomes the default automatically**, whatever
the form said. A customer with exactly one saved address and no default is a
customer who reaches a future checkout and is asked to choose from a list of one.
The rule is applied where the situation arises — in `createAddress` — rather than
patched at checkout.

**Setting a default does not require editing the address.** It is its own action
and its own endpoint: changing which address a parcel goes to should not mean
reopening and resaving eleven fields.

The order inside the transaction is clear-then-set, and it is not a preference:
the reverse would momentarily hold two defaults, which the index refuses outright.

**Turning a default off is not offered.** A customer with addresses should always
have one, so the edit form locks the tick box on for the current default and says
why. Choosing a *different* default is how you stop this one being it.

---

## Deleting, and what replaces a default

Deleting asks first, through the shared `Modal`, which names the address, says
whether it is the current default, and says what happens next. A one-click
destructive action sitting next to "Edit" is a mis-tap away from losing somebody's
address.

**The promotion rule, stated exactly:**

| Situation                              | Result                                     |
| -------------------------------------- | ------------------------------------------ |
| A non-default address is deleted       | Nothing else changes                       |
| The default is deleted, others remain  | The **most recently updated** of the rest becomes default |
| The default is deleted, none remain    | No default, which is correct — there is nothing to be default |

Deterministic, and it has to be: "whichever the database returns first" would
promote a different address on different days. The tie-break is `id`.

All of it is one transaction, so there is never a moment with two defaults, or
with an address gone and no replacement chosen.

---

## Validation

`src/lib/validations/address.ts`. Every message is written for the person filling
the form, because these are what the fields display — no Zod default ever reaches
a customer, since "Invalid input" tells nobody what to type instead.

- **Trimmed, then required.** `"   "` is an empty field, not a three-character
  city. The database carries the same rule as a CHECK.
- **Optional means absent, not empty.** A blank input becomes `undefined`, the
  service writes `null`, and a CHECK keeps it that way.
- **The PIN code is checked against its country.** India's is six digits not
  starting with zero — the real rule, rather than "six digits". Other countries
  get a loose alphanumeric check, because inventing a format for a country the
  shop does not deliver to would refuse valid addresses on the day it starts.
- **The phone number reuses `normalisePhoneNumber`** from Phase 3. The schema
  only bounds the string; the authoritative check knows the per-country rules,
  and its output is the canonical E.164 every other number in the database is
  stored as. **There is no second phone implementation.**
- **Nothing is HTML.** Every field is text, stored as text, rendered as a string.
  No rich text, no markup, nowhere.

---

## The service layer

`src/lib/services/address-service.ts` — `listAddresses`, `getAddress`,
`countAddresses`, `getDefaultAddress`, `createAddress`, `updateAddress`,
`setDefaultAddress`, `deleteAddress`.

Each takes a `userId` the caller resolved from the session. Nothing Prisma-shaped
leaves: callers get `AddressData`, which carries no `userId` and no timestamps.

It reads no request state — no `cookies()`, no `getCurrentUser()` — so
`pnpm check:account` exercises it directly. Same split as the wishlist's and the
bag's.

**Ordering is declared:** default first, then most recently updated, then by id.
A list that reshuffles between visits is a list nobody can scan.

**The limit is ten**, in `lib/account/limits.ts` so the browser can hide the Add
button at the same number. Reaching it refuses the eleventh with a sentence; **no
address is ever evicted to make room.**

---

## Server Actions

`src/actions/addresses.ts` (four) and `src/actions/account.ts` (one). Shared
helpers live in `lib/account/action-support.ts`, because a helper exported from a
`"use server"` file would be a public endpoint with no authorisation of its own.

Each does the same steps in the same order, and the order is asserted from source:

1. **Authenticate** — `getCurrentUser()`, first, before any input is read.
2. **Validate** — Zod.
3. **Normalise** — the phone, through the shared normaliser.
4. **Act as that customer** — the `userId` is the session's.
5. **Revalidate.**
6. **Return a safe result** — a sentence, plus field errors where they belong.

Actions **refuse**; pages **redirect**. A signed-out caller of an action gets
`SIGNED_OUT` back, not `redirect("/login")`: a redirect from a Server Action reads
as success to anything that is not a browser following it. The pages use
`requireUser()`, and `src/proxy.ts` turns a cookie-less request for `/account`
into a plain 307 before anything renders.

### What the browser is told

| Situation                          | Message                                                      |
| ---------------------------------- | ------------------------------------------------------------ |
| saved / updated / removed          | "Address saved." / "Address updated." / "Address removed."    |
| default changed                    | "Default delivery address updated."                           |
| profile saved                      | "Your details are saved."                                     |
| a field is wrong                   | "Check the highlighted fields and try again." + per-field text |
| unknown id, or somebody else's     | "That address could not be found."                            |
| at the limit                       | "You have saved as many addresses as an account can hold…"     |
| anything else                      | "Something went wrong. Please try again."                      |

An id that never existed and an id belonging to another customer get **the same
sentence**, deliberately. A different answer would turn these endpoints into a
way of asking whether an id is real.

No Prisma error, SQL string, constraint name or stack reaches a customer — and
here the offending value would be somebody's home address.

---

## The interface

Server Components throughout, except the three things that must act: the address
form, the address card and the profile form.

- **Forms are real `<form>` elements with real actions**, through
  `useActionState`. They submit and work before any JavaScript loads.
- **Nothing is lost on a refusal.** Every field reads `state.values` first, so a
  rejected submission comes back with everything still in it. Retyping an address
  because a PIN code was a digit short is how somebody gives up.
- **Errors sit with their fields**, tied by `aria-describedby`, marked
  `aria-invalid`. "Check the highlighted fields" is only useful if they are.
- **Server-confirmed.** The default badge appears when the list re-renders from
  the server, so two cards can never both look default.
- **Controls name what they act on** — "Edit Home", "Delete Home", "Set as
  default — Work" — because six identical "Delete" buttons down a list are six
  unusable buttons.
- **The delete dialog is the shared `Modal`** from Phase 6: portalled, Escape to
  close, background `inert`, focus starting inside and returning to the trigger.
- **Layout**: two columns where it helps on desktop, one on mobile, tap targets at
  44px.

---

## Revalidation

`revalidateAccountRoutes()` clears `/account` and `/account/addresses`.
`revalidateProfileRoutes()` adds `/account/profile` and `/` as a layout, because
the header greets a customer by name once they have set one.

Only the account area. Nothing about a saved address changes a product page, a bag
or a wishlist, and throwing away cached catalogue payloads because somebody
corrected a PIN code would be paying for nothing.

---

## Caching and isolation

Every account route is `dynamic = "force-dynamic"` and carries
`robots: { index: false, follow: false }`. `/account` is disallowed in
`robots.txt` and absent from the sitemap.

**This is the most sensitive data in the application** — a name, a phone number
and somebody's home address. A cached copy reaching another customer would be
worse than any leak in the earlier phases. So:

- no account read is tagged, and none uses `use cache`;
- the only memoisation in the path is React's request-scoped `cache()` on
  `getCurrentUser`, which lives for one render of one request and is discarded;
- `requireUser()` resolves through that same cache, so the page, the header and
  the account navigation share one session lookup rather than three.

---

## Concurrency

| Race                                     | What handles it                                |
| ---------------------------------------- | ---------------------------------------------- |
| Two tabs both setting a default          | Each transaction clears all others before setting its own; exactly one survives |
| A default set while another is created   | Both are transactions; the index refuses a second default |
| Two presses of Delete in one frame       | A `useRef` guard, synchronous unlike `pending`  |
| Deleting the default from two tabs       | The second finds nothing and reports not-found  |

No optimistic locking and no collaborative editing: an address book is used by one
person at a time, and the last write winning is the right answer for it.

---

## Security

| Requirement                            | How                                                     |
| -------------------------------------- | ------------------------------------------------------- |
| Account pages private                  | `requireUser()`, plus the proxy, plus `noindex`          |
| Address ownership enforced             | `userId` in every `where`; asserted mechanically         |
| No `userId` from the client            | No schema field, no action parameter                     |
| No role updates                        | `updateUserName` writes one column                       |
| No phone updates                       | Not in the schema, not in the form, shown read-only      |
| An address id is not enough            | Always paired with `userId`                              |
| No raw database errors                 | Fixed message table; errors logged server-side only      |
| No sensitive values in logs            | Only `error.message`; no address fields, no phone        |
| No client Prisma imports               | Asserted across the account components                   |
| No cross-user cache leakage            | `force-dynamic` + request-scoped memoisation only        |
| No open redirect introduced            | `/account` added to the existing `ALLOWED_PREFIXES`      |
| Admin gains nothing                    | `ADMIN` is a `User` with an ordinary account             |

---

## Performance

| Page                   | Queries                                    |
| ---------------------- | ------------------------------------------ |
| `/account`             | 2, run together (count + default)          |
| `/account/profile`     | 0 beyond the session                       |
| `/account/addresses`   | 1, filtered in the database                |
| `/account/addresses/[id]` | 1                                       |

No per-card query, and nothing loads a set of addresses to narrow it in
JavaScript. The signed-in user costs nothing extra on any of them — `requireUser`
resolves through the request-cached `getCurrentUser` the header has already
called.

One index, `(userId, isDefault)`, serves both reads this table has. A customer
holds at most ten rows, so the list's secondary sort is ten values in memory
rather than a second index maintained on every write.

---

## Testing

```bash
pnpm check:account      # data, ownership, defaults, limits, constraints
pnpm check:account:ui   # the whole area in headless Chromium
```

`pnpm check:account` is offline assertions plus live behaviour: the endpoint
shape, the ownership scan described above, every validation rule, the profile's
narrowness, the full address lifecycle, the default rules in every shape, the
promotion on delete, the limit, isolation between two customers in both
directions, a simultaneous default race, and the CHECK constraints and partial
index pushed directly at PostgreSQL.

`pnpm check:account:ui` drives headless Chromium through the signed-out sweep of
every route, the full journey from overview to a deleted default, a refused form
keeping its values, two customers in two contexts including one typing the
other's address URL, keyboard operation of the delete dialog, and nine widths.

Both write, and both clean up in a `finally`. Test accounts use reserved `+1555…`
numbers and are deleted by exact match — never by a pattern — because a real
customer record must never be removed to make a test report tidy. Addresses
cascade away with them, which is itself one of the checks.

> **Run the suites sequentially.** Several assert that the seeded catalogue is
> intact by counting rows, so a suite running beside another sees the other's
> in-flight fixtures and fails for the wrong reason.

---

## Future checkout, and why orders must snapshot

Checkout will eventually need a customer, a bag, a chosen address, delivery
eligibility, an order, a payment and a final stock check. **None of that is built,
and none of it is started here.**

What this phase does provide is the address, and one rule that must survive into
that phase:

> **A saved address is mutable. An order's address must not be.**
>
> A customer can edit or delete any address at any time. An order that
> foreign-keys `Address.id` and reads through it does not record where the parcel
> went — it records where that address points *today*. Change the street after
> delivery and the order's history silently rewrites itself; delete it and the
> order points at nothing.

So a future `Order` must **copy** `recipientName`, `phoneNumber`, `addressLine1`,
`addressLine2`, `landmark`, `city`, `state`, `postalCode` and `country` onto
itself at the moment the order is placed. The columns here are shaped so that copy
is a straight field-for-field snapshot.

That is the same reasoning the bag already follows for price: `CartItem.unitPrice`
is a hint for detecting drift and explicitly *not* an order price, because the
number a customer is charged is fixed by the order. Addresses and prices are the
same problem — mutable source, immutable record — and Phase 11 should solve them
the same way.

`OrderAddress` is deliberately **not** modelled yet. Modelling it before the order
exists would be guessing at the questions the order actually decides.

---

## What is deliberately not here

- **Orders, checkout, payments, coupons, shipping APIs, stock movements, image
  uploads, saved payment methods.** Later phases.
- **An order-history page.** There are no orders; a page that says so is a page
  that should not exist yet.
- **Phone-number editing.** A verification flow, not a text field.
- **Anything else on the profile** — avatar, birthday, gender, preferences,
  loyalty. See [Profile](#profile-deliberately-one-field).
- **A geography master table.** State and city are text inputs. A dropdown of
  every Indian district is a data-maintenance problem the shop does not have yet.
- **Rate limiting on address CRUD.** It is authenticated, bounded at ten rows per
  account, and has no delivery cost. Adding a limiter without evidence would be
  machinery guarding nothing. The OTP flow, which *is* unauthenticated and does
  cost money, has one.
- **An audit log.** `createdAt` and `updatedAt` record when; a later phase can
  record who and what if there is a reason.
