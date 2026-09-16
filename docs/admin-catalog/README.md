# Purple Rose admin catalogue

How an administrator manages products, collections, variants, stock and
photography, and why it is built this way. Written for an engineer joining the
repository who has to change something here without opening a hole in it.

Phase 6 built this. Before it, the catalogue was edited by rewriting the seed.

For the catalogue domain itself — the models, the money representation, how the
storefront reads it — read [docs/catalog/README.md](../catalog/README.md). For
the session and role machinery underneath, read
[docs/authentication/README.md](../authentication/README.md). For colours and
sizes specifically — what deactivating one does, and the browser verification —
read [docs/admin-attributes/README.md](../admin-attributes/README.md).

---

## The shape of it

There is **one catalogue**. The storefront reads it; the admin writes it. They
share a schema and a database and nothing else, and the two paths are kept
apart on purpose.

```
  Storefront                          Admin
      │                                 │
      ▼                                 ▼
  Read services                    Server Action
  lib/services/                    actions/admin/
    product-service.ts                   │
    category-service.ts            1. requireAdminActor()   ← the boundary
      │                            2. Zod schema
      │                            3. admin service
      │                            4. revalidate
      │                                 │
      │                                 ▼
      │                          Admin services
      │                          lib/services/admin/
      │                                 │
      └───────────────┬─────────────────┘
                      ▼
                   Prisma  (lib/db/client.ts, server-only)
                      │
                      ▼
              PostgreSQL / Neon
                      │
              CHECK constraints, unique indexes,
              foreign keys  ← the last word on integrity
```

**Why the services are separate files.** `product-service.ts` exists to make
drafts and archived products unreachable — every query it builds starts with
`status: ACTIVE`. `product-admin-service.ts` exists to edit exactly those. If
one module did both, the public storefront would be one boolean argument away
from showing unpublished work. The split is the guarantee.

**Why the UI never touches Prisma.** No component imports the client, and the
`server-only` marker on `lib/db/client.ts` makes that mechanical rather than a
convention. It caught a real mistake during this phase: the variant form
imported one pure SKU helper from a Prisma-backed service, and the build
refused. The helper moved to `lib/admin/sku.ts`; see it for the note.

---

## Routes

| Route | What it does |
| --- | --- |
| `/admin` | Catalogue counts, low stock, recently updated |
| `/admin/products` | Search, filter, sort, page |
| `/admin/products/new` | Create — fields only |
| `/admin/products/[id]` | Edit, publish, variants, photographs |
| `/admin/categories` | List, reorder, switch on and off |
| `/admin/categories/new` | Create |
| `/admin/categories/[id]` | Edit |

Phase 7 added `/admin/colors` and `/admin/sizes`, with the same list, create
and edit shape. See
[docs/admin-attributes/README.md](../admin-attributes/README.md).

Every one of them renders per request. The layout reads the session, so nothing
under `/admin` is cacheable and that is not a decision to revisit.

---

## Authorisation

Four layers, and only the last two are boundaries.

| Layer | What it is | What it actually stops |
| --- | --- | --- |
| `proxy.ts` | Cookie present? | A signed-out visitor seeing an admin shell flash |
| Admin layout | `requireAdmin()` | Navigating to an admin page |
| Each page | `requireAdmin()` | A page rendering while its layout redirects |
| **Each Server Action** | **`requireAdminActor()`** | **Anything actually changing** |

The proxy is an optimistic filter. It runs on every matched request including
prefetches, never opens a database connection, and has no idea whose cookie it
is looking at. A forged or expired cookie sails past it and is stopped by the
layout.

The page-level check is not redundant with the layout. A layout and the page
beneath it render **concurrently**, so a layout that redirects does not
reliably prevent the page from producing output.

**The Server Action check is the one that matters.** A form is markup. The
request behind it can be sent without ever loading the page that would have
rendered it, with any field set to anything. So every exported action begins:

```ts
export async function updateProductAction(previous, formData) {
  try {
    await requireAdminActor();      // first, before anything is read
    const parsed = schema.safeParse(...);
    ...
```

### Two guards, on purpose

| Function | Used by | On failure |
| --- | --- | --- |
| `requireAdmin()` | Pages | Redirects |
| `requireAdminActor()` | Server Actions | Throws, becomes a flat message |

A redirect is right for somebody who navigated somewhere they cannot go. It is
wrong for an action: to anything that is not a browser following it, a redirect
reads as success, and it confirms the endpoint exists.

Anonymous and signed-in-but-not-an-administrator fail **identically** — "You do
not have permission to do that." — so the response cannot be used to work out
which one you are.

### The rule is testable on its own

`lib/auth/admin-policy.ts` holds `isAdmin()` and the error, and imports no Next
runtime. `lib/auth/admin-guard.ts` resolves the session and applies it. The
split exists because `current-user.ts` imports `redirect` from
`next/navigation`, which cannot be loaded outside a Next request — and a
security rule that cannot be tested on its own is a security rule nobody tests.

### The guard cannot be forgotten

`pnpm check:admin` reads every module in `actions/admin/`, finds every exported
`async function`, and fails if one does not call `requireAdminActor()` **before**
it parses input. That is why the guard is written out in each action rather than
hidden in a `withAdmin(...)` wrapper: the wrapper would read better and audit
worse.

### Role cannot be supplied

There is no role field in any form, any URL or any cookie. The role comes from a
database row, read through the session. `isAdmin()` takes a resolved
`SessionUser` rather than a role string so there is nowhere to pass one in.

---

## Server Actions

Four modules, by feature, because one `admin.ts` holding every mutation is a
file nobody can review:

```
actions/admin/
├── products.ts     create, update, publish/unpublish/archive
├── categories.ts   create, update, switch on/off, reorder
├── variants.ts     create, bulk create, update, withdraw/restore
├── images.ts       add, edit, remove, reorder
├── colors.ts       create, update, switch on/off, reorder   (Phase 7)
└── sizes.ts        create, update, switch on/off, reorder   (Phase 7)
```

Every exported function is a callable endpoint, which is why each follows the
same five steps: **guard, validate, call the service, revalidate, return.**

Server Actions rather than Route Handlers, for the reason Phase 3 chose them for
sign-in: Next compares the request `Origin` against the `Host` on every action
and rejects a mismatch, which is CSRF protection nobody has to write. Action ids
are encrypted at build time, so there is no stable public URL to script against.

Shared plumbing lives in `lib/admin/action-support.ts`, **not** beside the
actions — every export in a `"use server"` file becomes a callable endpoint, so
a helper there would be a public entry point with no authorisation of its own.

---

## Validation

One file: `lib/validations/catalog-admin.ts`, Zod, extending what Phase 3
started. It runs on the server inside the action. Anything the browser does
with the same rules is convenience.

Three things happen there that are more than shape checks:

**Money is converted, not just checked.** The form takes rupees; the database
stores paise. See [Pricing](#pricing).

**Image URLs are checked against the configured hosts**, not merely parsed. See
[Photography](#photography).

**Enums are validated against the generated Prisma values**, so an unknown
fabric cannot reach a query and adding one is a migration.

### The checkbox rule

An unticked box submits nothing, so the key may be absent, `null`, or empty
depending on how the form was read. Rather than enumerate every shape of "off",
the schema accepts anything and recognises the three shapes of **on**
(`"on"`, `"true"`, `"1"`). Everything else is off.

The direction matters: a value that is not understood must never mean *true*
for a flag that decides whether something is public.

---

## Products

### Publication

One status column and one date, and `publicationDateFor()` in the service is
the only place their relationship is decided:

| Action | `status` | `publishedAt` |
| --- | --- | --- |
| Publish | `ACTIVE` | stamped **only if not already set** |
| Unpublish | `DRAFT` | kept |
| Archive | `ARCHIVED` | kept |

Only `ACTIVE` is public. There is no second "published" boolean to disagree
with the status, and no third state hiding in a nullable date.

Re-publishing keeps the original date so a piece does not jump to the top of
"Newest" every time somebody toggles it. Unpublishing keeps it because it
records when the piece first went live, which stays true while it is hidden.

**Archive is how a product is withdrawn.** Nothing in the admin area deletes a
product: it is the row a future order line will name, and an order pointing at
nothing is a receipt that cannot be explained.

### Slugs

A slug is a permanent URL. On a **new** product it follows the name until the
field is touched; on an **existing** one the two are completely independent,
and the field says why. Renaming never rewrites a live URL.

Uniqueness is checked before the write so the message lands on the slug field,
and the unique index remains the guarantee — two administrators can pass the
pre-check at the same moment, and then the database refuses the second. Both
paths produce the same sentence.

### Collections: replace, not patch

The form submits every ticked box on every save, and the service **replaces**
what is stored: memberships no longer chosen are deleted, chosen ones upserted,
in the same transaction as the product row.

Replacement matches the control. An unticked box means "not in this
collection", which a patch has no way to express. The primary category is
always included, so a product is always findable under the collection its
breadcrumb names.

### Stale writes

Both product and category updates are pinned to the version the form was
rendered from. The form carries `updatedAt`; the service writes with
`updateMany({ where: { id, updatedAt: expected } })`. If another administrator
saved in between, nothing matches, nothing is written, and the caller is told
to reload.

This is not theoretical tidiness. Without it, the second save silently discards
the first — **including changes to fields the second form never showed**.

It is optimistic and last-writer-must-retry, not a lock. Two people can open
the same product; the second to save is told. Variants, stock and photographs
are not pinned, because each is a small independent row and an administrator
editing one is not overwriting an unseen field.

---

## Pricing

**Integer paise, everywhere, still.** `₹1,299` is `129900`.

The admin types rupees. `lib/admin/money.ts` converts, and **the conversion
never goes through a float**:

```
"12.10"  →  split on "."  →  12 * 100 + 10  →  1210
```

`Number("12.10") * 100` is `1209.9999999999998`, and rounding that back is a
coin flip on the last paisa. There is no `parseFloat` in that file and there
should not be one anywhere money is handled. `pnpm check:admin` tests that
exact case.

Grouping commas are accepted, because somebody pasting from a spreadsheet will
have them.

A compare-at price must be **higher** than the price, or blank. That comparison
is the entire definition of "on sale" everywhere in the codebase, so a
compare-at below the price is either absent or wrong. It is refused by the
schema with a message on the field, and by a CHECK constraint in the database.

---

## Variants and stock

A variant is a product in one colour in one size: the row stock hangs off and
the row a future order line will name.

**Colour and size are fixed once created.** Changing either would quietly turn
one sellable thing into a different one while keeping its identity, its stock
and anything pointing at it. To sell a different combination, add a variant and
withdraw this one.

**Nothing is deleted.** Withdrawing sets `isActive = false`; it vanishes from
the storefront because every public query filters on it, and keeps its SKU, its
stock and its place in the size run.

### Duplicates

`@@unique([productId, colorId, sizeId])` is the guarantee. The service checks
first so the message lands on a field, and **withdrawn variants count** — a
retired "pink, M" still occupies that combination, so the answer to "I want
pink M back" is to restore it, not to create a second row for one garment.

### The grid generator

Fashion comes in a grid. Three colours by five sizes is fifteen rows, and
typing fifteen SKUs by hand is how a SKU gets a typo.

The generator produces the combinations, suggests a SKU with the same rule the
seed uses (`PR-DR-0001-LAV-M`) and a stock figure, and puts them in an
**editable table**. Nothing is written until that table is submitted, and what
is written is what the administrator can see.

Combinations the product already has are skipped at generation time and the
count of skipped rows is shown. A batch that still contains one is refused
whole rather than silently trimmed — dropping rows from a reviewed list would
be the screen lying about what it did.

The batch is capped at 60 and is one transaction. A partial result would leave
a product with an arbitrary subset of its size run and no record of what was
meant to exist.

### Stock

`quantity` and `lowStockThreshold`, and nothing else. An administrator corrects
a number.

There is **no ledger, no adjustment reason, no reservation, no movement
history**. Those are the inventory phase, and `Inventory` is already the table
they attach to. What exists here is what the catalogue needs to know whether
something can be bought.

Negative stock is refused in three places: the number input, the Zod schema,
and a PostgreSQL CHECK constraint.

---

## Photography

**URLs, not uploads.** No Cloudinary, no S3, no Vercel Blob, no upload route,
no image pipeline. An administrator supplies an address, its alt text, which
colour it is of, and where it sits.

### The host allowlist is load-bearing

`src/config/images.ts` holds one list. `next.config.ts` turns it into
`images.remotePatterns`; the validation schema refuses a URL whose host is not
on it.

That pairing is the point. `next/image` **throws at render time** for an
unconfigured host, so without the check a perfectly well-formed URL would save
cleanly and break the product page for every shopper. Failing in a form, next
to the field, is much better.

It also means the only accepted scheme is `https`, which refuses
`javascript:`, `data:` and everything else **by allowing exactly one** rather
than by trying to list what to block.

The list is not configurable from the browser or the database. Letting an admin
form widen the set of hosts the application will fetch and proxy images from
turns a catalogue screen into an SSRF and content-injection surface. Adding a
host is a code change and a deploy.

### Colour association

`ProductImage.colorId` nullable is what makes a swatch change the gallery:

- **set** — shown when that colour is chosen
- **null** — shared by every colour: flat lays, fabric shots, detail crops

So it is a labelled control at the top of each row with the consequence spelled
out, not a select buried at the end of a form. Only colours the product is
actually cut in may be chosen; anything else would create a gallery entry no
shopper could reach, and is refused.

### Order and the card image

Two rules the service maintains rather than hopes for:

- **Positions stay contiguous.** Every write renumbers the product's images
  `0..n-1`. A delete never leaves a gap; two images never share a slot. React
  state is never the running order — `position` is.
- **At most one card image.** Marking one clears the rest in the same
  transaction. The first photograph a product gets becomes it automatically,
  because a product with photographs and no primary would render the fallback.
  Deleting the card image hands the role to the next in order.

Reordering is a pair of arrows, not drag and drop: keyboard and screen-reader
users get the same control without a parallel implementation, and each press
persists immediately rather than waiting for a save nobody remembers.

**Deleting a photograph is the one genuine delete in the admin area.** An image
is content: nothing will ever reference it, an order names a variant, and a
"deleted" flag would mean filtering it out of every gallery query forever for
no benefit. It is confirmed, and the dialog says it cannot be undone.

---

## Collections

Switching off is the admin equivalent of deleting, and it is always allowed
whatever is attached. The collection leaves the navigation, the footer, the home
tiles, the filter panel and the sitemap; **its products stay in the shop**,
their memberships intact, and switching it back on restores exactly what was
there. The confirmation dialog says so, because it is the surprising part.

There is no delete. One with products would fail on a foreign key, and deleting
an empty one to save a row is not worth an irreversible button on a list screen.

**The product count is every product**, drafts and archived included, and the
screen labels it precisely with the live figure beside it. Somebody about to
switch a collection off needs to know what is attached; a draft counts for that.
Both are `_count` aggregations in the query that fetched the rows.

Reordering swaps two positions in a transaction and re-bases the whole list, so
the order is never briefly duplicated and gaps left by hand edits are healed.

---

## Transactions

Used where atomicity actually matters, not everywhere:

| Operation | Why |
| --- | --- |
| Create product + memberships | A product must never exist without its collections |
| Update product + replace memberships | The two halves are one edit |
| Create variant + inventory | A variant with no inventory reads as unavailable everywhere |
| Bulk variants | An arbitrary subset of a size run is worse than a failure |
| Add/edit image + clear other primaries | Never two card images, even for a moment |
| Delete image + renumber + promote next | Never a gap, never no card image |
| Reorder | Never a duplicated or missing position |

Independent reads are **not** wrapped. A transaction around a query that reads
one row buys nothing and holds a connection.

---

## Revalidation

Every storefront route renders per request, so nothing is holding a stale page
on the server. What `revalidatePath` clears is the **client Router Cache** —
the RSC payloads a browser keeps for routes it has already visited.

Without it, an administrator who edits a product and clicks "View store" can be
shown the copy their browser cached a minute ago and reasonably conclude the
save failed.

| Change | Revalidated |
| --- | --- |
| Product fields | `/admin/products`, `/shop`, `/shop/<slug>`, `/sitemap.xml`, `/` |
| Variant or image | the same, plus `/admin/products/<id>` and `/admin` |
| Collection | `/admin/categories`, `/` as a **layout**, `/sitemap.xml` |

Collections revalidate the storefront layout because they are in the header, the
mobile drawer, the footer, the home tiles and the filter panel — which is every
page. Products do not, because a stock edit has no business throwing away a
cached home page.

The slug used for `/shop/<slug>` is **looked up**, never taken from the form. A
form that could name any slug could be used to evict any cached page.

---

## Errors

Nothing internal reaches the browser. `toSafeFailure()` is the single funnel:

- an authorisation failure becomes one flat sentence;
- **anything else is logged server-side and becomes a generic message.**

A Prisma error carries table names, column names, constraint names and
sometimes the offending value. None of that belongs in a form.

Expected failures are not exceptions. A taken slug, a taken SKU, a stale write
are **results** — they are part of what the operation means and the form has to
render them next to a field. `AdminResult<T>` carries a code, a field and a
message written for a person. `pnpm check:admin` asserts those messages match
no `/prisma|constraint|unique|sql/i`.

---

## Database changes

One migration: `20260916180000_catalog_check_constraints`. No models, no
columns, no indexes.

```sql
Inventory.quantity            >= 0
Inventory.lowStockThreshold   >= 0
Product.price                 >= 0
Product.compareAtPrice        IS NULL OR > price
```

Phase 5 deferred these because nothing wrote stock or prices except the seed,
which validates its own input. Phase 6 adds an administrator typing into a
form, so the rules moved into the database where they hold whatever the
application does.

Prisma's schema language cannot express a CHECK constraint, so they are raw SQL
in a custom migration — the documented approach. **It was verified not to cause
drift**: `prisma migrate dev --create-only` after applying them generates
nothing, and all four were confirmed to actually reject a violating write.

No index was added. The admin list filters on `status` and sorts by `updatedAt`
over a few dozen rows, where PostgreSQL will choose a sequential scan over any
index. Adding one now would be guessing; the right moment is real `EXPLAIN`
output on a real catalogue.

---

## Performance

The product list is **two queries**: one `COUNT`, one page of rows with their
primary image, primary category and variant stock selected in the same query.
No loop issues a query.

The stock summary is computed from variant rows fetched with the page — bounded
by the page size (20), not by the catalogue. Prisma cannot sum a nested
relation, and the alternative, a query per row, is the N+1 this avoids.

The product edit screen is **two queries** for the entire page: the product with
its memberships, variants, colours, sizes, stock and every photograph; and the
choices the form offers. The browser never issues a request per section.

The dashboard is eleven aggregations issued together, none of which reads a row
into JavaScript to count it.

### One thing deliberately not offered

There is **no "stock: lowest first" sort**. Ordering by total stock means
summing a related table per row, which Prisma cannot express and which would
need the whole filter builder rewritten in raw SQL to keep paging correct.
Sorting only the fetched page would look right and be wrong.

The question it was for — what is running out — is answered exactly by the
`low` and `out` stock filters and by the dashboard.

---

## Forms

Sectioned, because a product has more than twenty fields and one flat column is
a wall nobody reads. Each `FormSection` is a real `fieldset` with a `legend`, so
a screen reader gets the same grouping as a sighted reader.

Mostly **uncontrolled**: inputs hold their own values and the form is read on
submit. That is what keeps a twenty-field form from re-rendering per keystroke.
Only the slug (which follows the name while creating) needs state.

A validation failure never empties the form: the action echoes back what was
submitted and the fields re-render from it. Repeated fields — every ticked
collection — are preserved too, which is why `valuesFrom` joins them rather
than keeping the last one.

Duplicate submission is prevented by `useFormStatus`: the submit button
disables itself while its own form is in flight. Success is never shown before
the write commits.

### Dialogs

`components/ui/modal.tsx`, the sibling of the storefront `Drawer`, with the same
guarantees: portalled to `document.body`, Escape closes, focus starts inside and
returns to the trigger, everything else `inert`, scrolling locked, labelled by
its own heading.

`window.confirm()` is not used anywhere. It cannot explain consequences in more
than a line, cannot be styled, and blocks the tab.

Every dialog says **what will happen and whether it can be reversed**, because
"Are you sure?" answers neither. It closes only once the server has confirmed;
a failure keeps it open with the reason inside.

---

## Accessibility

Following Phase 4's standards:

- Status is **words first**. `Live`, `Draft`, `Archived`, `Out of stock`,
  `Withdrawn` are text; colour and shape are a second channel carrying the same
  information, so everything reads correctly in greyscale and to a screen
  reader.
- The desktop list is a real `<table>` with `<th scope>`, a `<caption>`, and row
  headers. Below `lg` it is a list of cards — a deliberate second layout, not a
  horizontal scroll that hides the actions column.
- Every field has a real `<label>`, and `AdminField` wires the id,
  `aria-invalid` and `aria-describedby` in one place so it is right on the
  thirty-first field as well as the first.
- Errors sit next to their field. "Check the highlighted fields" is only useful
  if they are.
- A failure is `role="alert"`; a success is `role="status"`. The result count is
  `aria-live="polite"`.
- Toggles are real buttons with `aria-pressed`; expanding panels carry
  `aria-expanded`; the current nav section carries `aria-current="page"`.

---

## Verification

```
pnpm check:admin        # 155 assertions; needs DATABASE_URL
pnpm check:admin:http   # 42 assertions; needs a running server too
```

`check:admin` covers the money conversion (including the float trap), the image
URL allowlist, admin URL parsing under hostile input, the schemas, the policy,
**the mechanical audit that every action is guarded**, and then the real
services against the real database: creation, uniqueness on slug, article
number and SKU, stale-write refusal, the publication model, variants and the
bulk batch, photographs and their ordering and primary rules, collections, the
dashboard counts, and that error messages leak nothing.

`check:admin:http` makes real requests as nobody, a customer and an
administrator against a running server, with genuine sessions created the way
sign-in creates them. It also archives a live product, confirms it leaves the
product page, the listing and the sitemap, and puts it back.

Everything either creates is prefixed `zzz-check-admin` or uses the reserved
`+1 555 01xx` range, and is deleted in a `finally` so a failed assertion leaves
nothing behind in Neon.

### What these cannot prove

**A Server Action's authorisation cannot be exercised from a script.** An action
reads its session through `cookies()`, which only exists inside a Next request.
So authorisation is covered three ways — the policy directly, the mechanical
guard audit, and the HTTP page checks — and the report says which is which
rather than implying the action endpoints were called as a customer.

---

## Known limitations

**Last writer must retry, not merge.** Stale writes are refused, not
reconciled. Two administrators editing the same product see "someone else
changed this"; there is no field-level merge and no live presence.

**No audit log.** `updatedAt` records *when*, never *who*. Adding an actor
column or an event table is a phase of its own; the mutation paths all run
through services, which is where it would attach.

**Descriptions are plain text.** No rich text, no HTML rendering, no
sanitisation strategy — because introducing HTML rendering without one is how
stored XSS happens.

**No image uploads.** URLs on an approved host only.

---

## Not built, deliberately

Cart, wishlist, checkout, orders, coupons, reviews, payments. Stock movements,
purchase orders, reservations, returns, suppliers. Revenue, conversion and any
other figure that would need an order to exist.

The dashboard says all of this on the page, so nobody using the admin area has
to guess which numbers are real.

---

## For the next phase

The models carry every field an admin needs and nothing here assumes a product
can be deleted. When orders arrive:

- `ProductVariant` is the row an order line points at, and it is never deleted.
- `ARCHIVED` already means "withdrawn but still referenceable".
- `Inventory` is where a movement ledger attaches, and the CHECK constraint is
  already there to catch a decrement that goes too far.
