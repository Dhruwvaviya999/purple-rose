# Purple Rose admin attributes

Colours and sizes: how they are managed, what deactivating one actually does,
and how the product editor and the storefront consume them.

Phase 7 built this. Before it, `Color` and `Size` were seed-only — the admin
area could build variants from them but could not create, rename, reorder or
retire one, which was recorded as a known limitation rather than papered over.

For the catalogue domain read [docs/catalog/README.md](../catalog/README.md).
For the wider admin architecture — authorisation, actions, services,
transactions — read [docs/admin-catalog/README.md](../admin-catalog/README.md);
this document only covers what is specific to attributes.

---

## What a colour and a size are

Both are small, global, reusable tables. "Lavender" is **one row** that many
products point at, which is why the swatch, the name and the spelling are the
same everywhere and the shop's colour filter has one entry for it rather than
one per product.

That makes them shared infrastructure. Changing one row changes every product
cut in it, and everything below is designed around that fact.

```
Color ────┐
          ├──> ProductVariant ──> Inventory
Size  ────┘         │
                    └── (a future OrderItem points here)

Color ──> ProductImage        (which colour a photograph is of)
```

| | Colour | Size |
| --- | --- | --- |
| Stable identifier | `slug` — `dusty-plum` | `code` — `XS`, `M`, `FREE` |
| Carried by | `?colour=dusty-plum` | `?size=m`, and every SKU |
| Also has | `hex` | optional `bustCm`, `waistCm`, `hipCm` |
| Referenced by | `ProductVariant`, `ProductImage` | `ProductVariant` |

### No schema change

Phase 7 added **no models, columns, indexes or migrations**. The Phase 5
schema already had everything: `id`, `slug`/`code`, `name`, `hex`, `position`,
`isActive`, the measurements, and `onDelete: Restrict` on every reference. What
was missing was the interface, not the data model.

---

## Routes

| Route | What it does |
| --- | --- |
| `/admin/colors` | The palette: swatch, name, hex, usage, order, on/off |
| `/admin/colors/new` | Create |
| `/admin/colors/[id]` | Edit |
| `/admin/sizes` | The run: code, name, measurements, usage, order, on/off |
| `/admin/sizes/new` | Create |
| `/admin/sizes/[id]` | Edit |

Same shape as `/admin/categories`, deliberately — list, create, edit, with
reorder arrows and an on/off switch on each row. They are the same kind of
thing and should not be three unrelated mini-applications.

---

## Deactivation, and what it actually means

This is the part worth reading carefully, because it is the whole design.

**Switching a colour or size off means: stop offering it.** It does not mean
the attribute stops existing, and it does not touch anything already using it.

| | Before | After switching off |
| --- | --- | --- |
| Offered when building new variants | yes | **no** |
| In the shop's filter | yes | **no** |
| Existing variants | sellable | **still sellable** |
| Their stock | kept | **kept** |
| `ProductImage` tied to that colour | kept | **kept** |
| Editing a product that uses it | works | **still works** |
| Reversible | — | **yes, completely** |

The seeded palette and run are untouched by any of it: a retired colour is a
row with a flag flipped.

### Why there is no delete

`ProductVariant.colorId`, `ProductVariant.sizeId` and `ProductImage.colorId`
are all `onDelete: Restrict`. So a delete would:

- **fail on a foreign key** for anything in use — which is everything worth
  retiring; or
- **succeed on an unused row**, saving one record at the price of an
  irreversible button sitting on a list screen next to the ones that matter.

Neither is worth having. Deactivation does everything an administrator wants
and none of the damage, so the destructive operation is simply not built —
not built and hidden, not built at all. There is no dead code behind a flag.

### An existing variant is never orphaned

A variant's colour and size are fixed once created (see
[docs/admin-catalog/README.md](../admin-catalog/README.md#variants-and-stock)),
and the product editor renders them from the **variant's own relation**, not
from the list of offered attributes. So deactivating an attribute can never
make a product impossible to edit — the row still shows "Lavender · M" and
still sells.

This is asserted directly: `pnpm check:attributes` withdraws a colour and a
size that a variant is using, then checks the variant still exists, is still
active, still points at both, and still has its stock.

---

## The form is a snapshot; the database is authoritative

The case that matters:

1. Administrator A opens a product editor. The colour list is rendered.
2. Administrator B retires a colour.
3. Administrator A submits a variant in that colour.

Without a check, A's submit would quietly create a sellable variant in a colour
the shop has stopped offering — and no screen would ever show it as wrong,
because the row would look exactly like any other.

So `createVariant` and `createVariants` **ask the database at write time**
whether both attributes are still offered, and refuse with a message that says
what happened and what to do:

> That colour is no longer offered. Someone switched it off while this page was
> open — reload to see the current palette, or switch it back on under Colours.

The bulk path asks once per distinct attribute rather than once per row, so a
sixty-row batch across three colours is three questions.

This applies to **new** variants only. Editing an existing one never
re-validates its colour and size, because that variant is history and history
does not need re-approving.

---

## Product editor integration

`getProductFormOptions()` is the single source of what the editor offers:

```ts
colors: prisma.color.findMany({ where: { isActive: true }, orderBy: position })
sizes:  prisma.size.findMany({  where: { isActive: true }, orderBy: position })
```

There is **no hardcoded `XS, S, M, L, XL, XXL` anywhere** in the application,
and no hardcoded colour list. The size selector renders whatever it is given,
so a shop selling 28–36 or a single "Free" size works with no code change.

The bulk variant generator draws its pills from the same two lists, so a colour
created five minutes ago is in the grid and a colour retired five minutes ago
is not. The 60-variant cap and the review-before-save step are unchanged from
Phase 6: nothing is written until the generated table is submitted.

### Ordering is visible

`position` is not decoration. It decides:

- the order of swatches on a product page,
- the order of the colour filter in the shop,
- the order of the size selector — this is what puts **XS before XXL** rather
  than whatever order the rows happened to be read in,
- the order of the size facet.

Reordering is a pair of arrows, matching collections: keyboard- and
screen-reader-operable with no parallel implementation, persisted server-side
on each press, and the whole list is re-based to `0..n-1` inside a transaction
so gaps and ties left by a seed or a hand edit are healed rather than
preserved.

---

## Storefront consumption

Nothing changed here, and that is the point — the storefront already read these
tables. What Phase 7 verified is that the rules hold:

- `buildProductWhere` filters size and colour by `isActive: true`, so a
  retired attribute cannot be filtered on even by typing the URL.
- The facet query joins `color: { isActive: true }` and
  `size: { isActive: true }`, so a retired attribute is not offered as a filter
  option.
- A product page renders a variant's colour and size from the variant, so a
  garment cut in a retired colour still shows it.

`pnpm check:attributes` asserts all three against a live database.

---

## Validation

In `lib/validations/catalog-admin.ts`, beside the rest of the catalogue admin
schemas so the shared primitives — the slug shape, the position, the checkbox
rule — are defined once.

### The hex value

Deliberately narrow: `#rgb` or `#rrggbb`, nothing else. Short form is expanded
to long, and the column stores one canonical lower-case form.

The value is rendered as an inline `background-color` on a swatch, so the safe
thing is to accept **one unambiguous shape** rather than everything CSS
permits. No `rgb()`, no named colours, no `url()`, no `var()`. Six hex digits
cannot express a function call, a URL, or a semicolon that would end the
declaration and start another. `javascript:` and friends are refused not by
being listed but by not being hex.

### The size code

Upper-cased on the way in, so `m` and `M` cannot become two sizes. Constrained
to letters, digits and hyphens, because it is built into every SKU.

### Measurements

Optional, whole centimetres, and **blank stores `null`, not `0`**. A shop that
has not put a tape round its garments should not have to invent numbers to save
a name change, and a zero would read as "measured, and it is nothing".

---

## Renaming never moves an identifier

| Field | Follows the name? |
| --- | --- |
| Colour `slug` | only while **creating**, and only until the field is touched |
| Size `code` | **never** — it is typed |

A colour slug is a live URL: the shop's filter carries it. Re-deriving it on a
rename would break every filtered link anyone has shared. A size code is built
into every SKU of every variant cut in it.

Both are checked for uniqueness before the write so the message lands on the
right field, and both have unique indexes behind them so two administrators
racing cannot produce a duplicate. The messages say what is wrong without
naming a table, a column or a constraint:

> Another colour already uses that slug. It is the value the shop filter
> carries in its URL, so each one belongs to a single colour.

---

## Authorisation

Unchanged from Phase 6, and it applies here in full:

- `/admin/colors` and `/admin/sizes` require `ADMIN` in the layout and again in
  each page.
- **Every exported action in `actions/admin/colors.ts` and
  `actions/admin/sizes.ts` calls `requireAdminActor()` first, before it parses
  any input.**
- `pnpm check:attributes` reads both modules and fails if an exported action is
  missing the guard, or runs it after `safeParse`. The same mechanical audit
  `pnpm check:admin` applies to the older modules.
- Role comes from a database row reached through the session. There is no role
  field in any form, URL or cookie.

---

## Revalidation

Attributes reach further than a product edit, because they are shared:

```ts
revalidatePath(`/admin/${kind}`)          // the list being edited
revalidatePath("/admin/products/[id]", "page")  // the editor's choices
revalidatePath("/admin/products/new")
revalidatePath("/admin")                  // the dashboard counts them
revalidatePath("/", "layout")             // swatches, selectors, both facets
```

`"/"` as a **layout** rather than a page, because the filter panel and every
product page live inside the store shell. It is still targeted: five named
paths, not a blanket invalidation.

The requirement it satisfies is that a newly created active colour must not
stay absent from the product editor. It does not: `pnpm check:attributes`
creates one and finds it in `getProductFormOptions()` immediately, and
`pnpm check:ui` creates one through the form and finds it in the editor's
`<select>`.

---

## Concurrency

Phase 6's model, unchanged: **last writer must retry**, never silently
overwrite.

Colour and size updates are pinned to the `updatedAt` the form was rendered
from. If another administrator saved in between, nothing is written and the
caller is told to reload.

It matters more here than the size of the form suggests. A colour is shared, so
two administrators saving different hex values would leave the losing change
silently gone from every product cut in it.

Toggling on and off is **not** pinned. It is a single boolean with one sensible
value at a time, and refusing "switch this off" because somebody else touched
the name would be obstruction rather than protection.

---

## Accessibility

**Colour is never the only channel.** Every swatch has its name and its hex
value in text beside it:

```
Lavender          ← the name, as text
[swatch]          ← aria-hidden, decorative
#a87bc9           ← the value, as text
```

A square of colour with nothing to announce would be the one place in this
application where colour carried information alone.

- Status is words — `Offered` / `Not offered` — with the tint as a second
  channel, so it reads in greyscale and to a screen reader.
- The hex field pairs a text input with a native colour picker bound to the
  same state, so it works for someone pasting a brand value and for someone
  choosing one by eye. The live preview is labelled `Preview of Lavender`,
  never an unlabelled square.
- Reorder arrows carry a `title` naming what moves and which way.
- Generator pills are real buttons with `aria-pressed`, so their state is
  announced rather than implied by a border.
- Every field has a real `<label>`; errors sit next to their field.

All verified in a browser — see below.

---

## Verification

```
pnpm check:attributes   # 115 assertions; needs DATABASE_URL
pnpm check:ui           # real browser; needs a running server too
```

`check:attributes` covers the hex and measurement schemas under hostile input,
the guard audit for both new action modules, then the real services against the
real database: creation, uniqueness, renaming without moving an identifier,
stale-write refusal, deactivation with a variant attached, the write-time
attribute check, the shop filter, reactivation, reordering, the lists, the
dashboard counts, and that the seeded catalogue is untouched.

`check:ui` drives headless Chromium through the actual screens — see
[Browser verification](#browser-verification).

Everything either creates is marked `zzzcheck` or `zzzui` and removed in a
`finally`, and both restore the running order they shuffled.

---

## Browser verification

Phase 6 reported that no browser tooling was available and that responsive
behaviour, dialogs, the variant generator and save states were therefore
unverified. **Phase 7 closed that.** `playwright` is a devDependency and
`pnpm check:ui` drives a real Chromium.

It performs the flows rather than asserting on HTML: it types into the forms,
clicks the buttons, opens the dialogs, presses Escape, and measures the layout
at 320, 360, 390, 414, 768, 1024, 1280, 1440 and 1920.

**It found four real defects**, all fixed:

| Found | Where |
| --- | --- |
| "View store" was a 20px tap target | admin header |
| "Manage colours" / "Manage sizes" were 15px | dashboard tiles |
| Low-stock product links were 17px | dashboard |
| Recently-updated product links were 17px | dashboard |

All four were inline text links sitting in their line box with no vertical
padding — invisible to every HTTP-level check Phase 6 could run, and obvious
the moment something measured a rendered box.

Running it needs a server:

```bash
pnpm build && pnpm start
pnpm check:ui
# or against another port
CHECK_BASE_URL=http://localhost:3100 pnpm check:ui
```

### Why `playwright` and not `@playwright/test`

The driver, not the test runner. This project verifies with plain scripts —
`check:auth`, `check:catalog`, `check:admin` — and a second test framework with
its own runner, config and reporter would sit beside that convention rather
than in it. The driver is what was missing; the harness already existed.

---

## A future size guide

`Size` carries `bustCm`, `waistCm` and `hipCm`, and the admin form edits them.
**Nothing renders them yet**, and the form says so rather than implying a
customer will see them.

They are stored so that a size guide, when it is built, starts from numbers
somebody actually measured rather than numbers invented at the time. What that
phase would add:

- a customer-facing table on the product page or behind a link from the size
  selector, ordered by `position` so it reads smallest to largest;
- more columns if the garments need them — length, inseam, shoulder — as
  nullable additions to `Size`, which is an additive migration;
- per-product overrides, if a particular cut runs small, which would be a new
  table keyed on product and size rather than more columns here.

Nothing about the current shape blocks any of it.

---

## Known limitations

**No delete.** By design — see [above](#why-there-is-no-delete). An unused
attribute can only be switched off, not removed. If a catalogue ever
accumulates enough retired attributes to be a nuisance, a guarded delete for
zero-reference rows is the answer, and it should be built then rather than
carried unused now.

**Toggling is not stale-write protected.** Deliberate; the field is a single
boolean.

**No audit log.** `updatedAt` records when an attribute changed, never who.
Shared with the rest of the admin area.

**No bulk import.** Colours and sizes are created one at a time. For a palette
of eight and a run of six that is the right amount of machinery.
