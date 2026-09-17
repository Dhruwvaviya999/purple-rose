# Purple Rose catalogue architecture

How products, categories, variants, colours, sizes, images, stock and prices
are modelled, read and rendered. Written for an engineer joining the repository
who has to change something here without breaking the storefront.

Phase 5 built this. Before it, the storefront rendered eight objects from a
TypeScript file; the interface has barely changed, and everything underneath it
has.

For general Prisma and PostgreSQL conventions read
[`docs/database/README.md`](../database/README.md). For the components this
feeds, read [`docs/storefront/README.md`](../storefront/README.md). For the
screens that **write** this catalogue, read
[`docs/admin-catalog/README.md`](../admin-catalog/README.md).

---

## The shape of it

```
Browser
  │
  ▼
Next.js Server Component            app/(store)/shop/page.tsx
  │                                 app/(store)/shop/[slug]/page.tsx
  │                                 app/(store)/page.tsx
  ▼
Product query                       features/storefront/product-query.ts
  │  parses and validates the URL          → ProductQuery
  ▼
Product service                     lib/services/product-service.ts
Category service                    lib/services/category-service.ts
  │  build the query, run it, map the rows
  ├── lib/catalog/product-filters.ts   ProductQuery → Prisma where + orderBy
  ├── lib/catalog/product-mapper.ts    Prisma rows  → ProductCardData / ProductDetailData
  └── lib/catalog/vocabulary.ts        enum ↔ URL token ↔ label
  │
  ▼
Prisma Client                       lib/db/client.ts  (server-only, lazy)
  │
  ▼
PostgreSQL / Neon
```

Filtering, from the shopper's side:

```
Browser
  │  ticks a checkbox, types a search, presses a page link
  ▼
Client UI                           filter-panel, sort-select, search-overlay,
  │  writes to the query string       active-filters, pagination
  ▼
URL state                           /shop?category=cotton-dresses&size=m&sort=price-asc
  │  a full navigation, inside a transition
  ▼
Server-rendered catalogue           the listing, the facet counts and the
                                    chips all come back from the server
```

Two rules hold that diagram together:

- **The URL layer never queries.** `product-query.ts` knows nothing about
  Prisma.
- **The service layer never parses a URL.** It takes a `ProductQuery` and
  returns presentation types.

The seam between them is the `ProductQuery` type. That is what made Phase 5 a
change of one import per route rather than a rewrite.

---

## Domain models

Eight tables, one join table among them, plus five enums. All in
[`prisma/schema.prisma`](../../prisma/schema.prisma), where each carries its
own reasoning.

| Model             | What it is                                            |
| ----------------- | ----------------------------------------------------- |
| `Category`        | A collection a product is browsed under               |
| `Product`         | A garment: the copy, the price, the merchandising      |
| `ProductCategory` | Which collections a product appears in                |
| `Size`            | A size the catalogue can be cut in                    |
| `Color`           | A colour the catalogue can be cut in                  |
| `ProductVariant`  | One sellable combination: product + colour + size     |
| `Inventory`       | How many of one variant there are                     |
| `ProductImage`    | A photograph, optionally belonging to one colour      |

| Enum            | Values                                             |
| --------------- | -------------------------------------------------- |
| `ProductStatus` | `DRAFT` `ACTIVE` `ARCHIVED`                        |
| `Fabric`        | cotton, poplin, linen, rayon, georgette, satin, …  |
| `Pattern`       | solid, floral, striped, checked, printed, …        |
| `Fit`           | relaxed, regular, fitted, oversized, A-line, …     |
| `Occasion`      | everyday, work, brunch, evening, festive, holiday  |

### Category

Rows, never a list in application code. The header, the mobile drawer, the
footer, the home tiles and the filter panel all follow the table, so renaming
or retiring a collection needs no deployment.

`isActive` is the switch. Every public read filters on it **in the query**, not
afterwards, so a disabled collection cannot reach a page because one branch
forgot.

There is deliberately **no `parentId`**. Purple Rose sells five flat
collections. A tree would bring recursive queries, breadcrumb assembly and a
cycle check to serve a hierarchy nobody has asked for. Adding one later is an
additive migration.

### Product to category: many to many

A product has **one primary category** and **any number of memberships**.

- `Product.primaryCategoryId` is what the card line and the breadcrumb show. A
  card has room for one category and a breadcrumb has one path.
- `ProductCategory` is what the category filter and the category facet read.

This is not over-modelling, and the seeded catalogue is the argument for it:
*Fresh Prints* is a print story, not a garment type. A printed cotton dress is
genuinely a cotton dress **and** a fresh print, and a shopper browsing either
collection should find it. Nothing has *Fresh Prints* as its primary category,
which is exactly the case a single foreign key cannot express.

The join is an explicit model rather than an implicit many-to-many because the
row carries data of its own: `position`, the product's place inside that
collection, which is a per-collection merchandising decision.

### Variants

A product is not a row with `sizes` and `colors` text columns. Every sellable
combination is a row:

```
Product  Floral Cotton Midi Dress            PR-DR-0009
  ├── Variant  PR-DR-0009-GRE-S   green / S   → Inventory 6
  ├── Variant  PR-DR-0009-GRE-M   green / M   → Inventory 7
  ├── Variant  PR-DR-0009-PIN-M   pink  / M   → Inventory 6
  └── Variant  PR-DR-0009-PIN-L   pink  / L   → Inventory 4
```

`@@unique([productId, colorId, sizeId])` is the constraint that matters:
nothing can create a second "pink, M" that claims the same shelf and the same
stock. All three columns are `NOT NULL` on purpose — PostgreSQL treats NULLs as
distinct inside a unique index, so a nullable colour or size would let
duplicates straight back in. A one-size garment gets a `Free` size row.

`Color` and `Size` are global, reusable rows. "Lavender" is one record with one
spelling and one swatch, however many garments are cut in it, which is why the
colour filter has one entry for it rather than one per product.

### SKU and article number

Two levels of identity, both unique, and they are not the same thing:

| Level   | Column                  | Example              | Names             |
| ------- | ----------------------- | -------------------- | ----------------- |
| Product | `Product.articleNumber` | `PR-DR-0009`         | the design        |
| Variant | `ProductVariant.sku`    | `PR-DR-0009-PIN-M`   | the physical unit |

The variant SKU is what a pick list, a barcode and a future order line point
at, so it carries the unique constraint that has to hold. The seed derives it
from the article number, the colour and the size, which makes it stable across
re-runs and the natural key the seed upserts on.

### Images, and why a colour swatch changes the gallery

`ProductImage.colorId` is nullable, and that nullability is the whole feature:

- **`colorId` set** — shown when that colour is selected.
- **`colorId` null** — shared by every colour: flat lays, fabric close-ups.

The service groups them, so `ProductDetailData.colourOptions[n].images` is that
colour's own photographs followed by the shared ones. Nothing flattens the two
lists together, so selecting Blue never shows the pink dress.

`width` and `height` are stored rather than derived, so the layout can reserve
the 4:5 box before the image arrives and nothing on the page moves as it loads.
Nothing has to parse a URL to discover how big a picture is.

`url` is a plain absolute URL with nothing host-specific about it. Development
placeholders live there today; a Cloudinary, Vercel Blob or S3 URL lives there
later, with **no migration** — only a seed change and a second entry in
`next.config.ts`.

### Inventory

A dedicated table with a one-to-one relation to the variant, rather than a
`quantity` column on the variant. Three reasons:

1. Stock is the one part of a catalogue that changes constantly. Keeping it
   separate means a stock movement never touches the row that descriptions,
   SKUs and merchandising flags are read from.
2. Adjustments, reservations, purchases and returns get somewhere to point when
   they arrive, without widening `ProductVariant` again.
3. The write that will matter — decrementing stock under a lock during
   checkout — stays on the narrowest possible row.

Only what availability needs is modelled: `quantity` and `lowStockThreshold`.
There is no ledger, no reservation and no warehouse, because nothing calls for
them yet. A variant with no inventory row at all is treated as unavailable,
which is the safe reading of missing stock data.

A `CHECK (quantity >= 0)` constraint belongs here, and Phase 6 added it —
along with one for `lowStockThreshold` — when the admin area introduced the
first write path that is not the seed. See
[Database changes](../admin-catalog/README.md#database-changes).

---

## Money

**Integer paise. Everywhere. No exceptions.**

```
₹1,299  →  129900
```

`Product.price` and `Product.compareAtPrice` are `Int` columns. There is no
`Float`, no `Decimal` and no string amount in the schema, in the services, in
the seed or in the presentation types.

Binary floating point cannot represent 0.1, so a store that adds up line items
in floats eventually charges the wrong amount. Integers in the minor unit are
exact, compare and sort correctly in SQL, and survive JSON without a custom
serialiser — which `Decimal` does not. `numeric` would also be exact, but it
arrives as a `Decimal` object that has to be converted at every boundary,
buying precision the catalogue does not need for a currency whose smallest unit
is 1/100.

The conversion to something a person reads happens once, at the presentation
boundary, in
[`src/lib/utils/format-price.ts`](../../src/lib/utils/format-price.ts). The
conversion the other way — what an administrator types into what is stored —
happens once too, in
[`src/lib/admin/money.ts`](../../src/lib/admin/money.ts), and never through a
float.

The URL is the one place amounts are not in paise: `?min=2000` means two
thousand rupees, because that is what a shopper types. `parseProductQuery`
multiplies by 100 immediately.

### Sale pricing

A product is on sale when, and only when:

```
compareAtPrice IS NOT NULL  AND  compareAtPrice > price
```

That rule lives in exactly two places that cannot disagree: the SQL predicate
in `buildProductWhere` (a Prisma field reference, so the comparison happens in
the database) and `isOnSale` in the mapper. The sale badge, the sale filter and
the struck-through price therefore always agree.

There is **no discount percentage column**. The saving is derived from the two
amounts by `discountPercent`, rounded down so a discount is never overstated.
Two stored sources for one fact drift; one does not.

### Variant price overrides: not implemented, on purpose

Every variant of a product costs the same. There is no `price` column on
`ProductVariant`.

The reason is that the price on the card, the price the filter compares, the
price the sort orders by and the price the product page shows are then the same
number **by construction**. The moment variants can override, a listing needs a
minimum-price aggregate on `Product`, that aggregate needs maintaining on every
variant write, and a stale one means a card advertising a price nothing can be
bought at.

When a real product needs it: add `priceOverride` and `compareAtPriceOverride`
to `ProductVariant`, add `minPrice` to `Product`, maintain it in the write path,
and point the filter and the sort at it. Precedence would be variant override,
else product price. Additive migration, no redesign.

---

## Product lifecycle, slugs and deletion

### Status

```
DRAFT  →  ACTIVE  →  ARCHIVED
```

Only `ACTIVE` products are ever public, and that rule lives in
`buildProductWhere`, which every listing, count and facet query goes through.
It is not applied by a component, and not applied as a filter after the fact.

The seed ships one `DRAFT` and one `ARCHIVED` product precisely so this is
something `pnpm check:catalog:db` can prove rather than something we assume.

### Slugs

Set once, at creation, from the name at that moment. **A slug is never
re-derived when a product is renamed.** A live product that quietly changes URL
breaks every inbound link, every share and every crawled result pointing at it.
Changing a slug is an explicit, separate act with a redirect behind it.

`Product.slug` and `Category.slug` are unique. `getProductBySlug` checks the
shape of the string before it builds a query, so a slug that could not exist is
answered without touching the database.

### Deleting

Nothing in the public services deletes anything, and the schema is arranged so
that the destructive option is hard to take by accident:

| Thing             | How it goes away         | Why                                            |
| ----------------- | ------------------------ | ---------------------------------------------- |
| Product           | `status = ARCHIVED`      | An order line will name it; the row must stay   |
| Category          | `isActive = false`       | Products reference it                           |
| Size, Color       | `isActive = false`       | Variants reference them (`onDelete: Restrict`)  |
| Variant           | `isActive = false`       | An order line will name it                      |
| Category membership | Hard delete            | A join row carries nothing to preserve          |
| Image, Inventory  | Cascade from the owner   | Pure child data                                 |

`Product.primaryCategoryId` is `onDelete: Restrict`: deleting a category that
products are displayed under fails loudly rather than orphaning a catalogue.

---

## The query contract

[`src/features/storefront/product-query.ts`](../../src/features/storefront/product-query.ts)
owns the URL and nothing else.

| Parameter     | Field                | Shape                              |
| ------------- | -------------------- | ---------------------------------- |
| `q`           | `search`             | free text, cleaned and capped at 80 |
| `category`    | `categories[]`       | slugs                              |
| `size`        | `sizes[]`            | size codes, lower case             |
| `colour`      | `colours[]`          | colour slugs                       |
| `fabric`      | `fabrics[]`          | `cotton-poplin`, `linen-blend`, …  |
| `pattern`     | `patterns[]`         | `block-print`, `floral`, …         |
| `fit`         | `fits[]`             | `a-line`, `relaxed`, …             |
| `occasion`    | `occasions[]`        | `everyday`, `festive`, …           |
| `sale`        | `onSale`             | `true` / `1`                       |
| `in-stock`    | `inStockOnly`        | `true` / `1`                       |
| `new`         | `newArrivalsOnly`    | `true` / `1`                       |
| `featured`    | `featuredOnly`       | `true` / `1`                       |
| `bestseller`  | `bestSellersOnly`    | `true` / `1`                       |
| `min`, `max`  | `minPrice`, `maxPrice` | whole rupees in, paise out       |
| `sort`        | `sort`               | one of the five sort values        |
| `page`        | `page`               | positive integer                   |

Multi-value groups accept both `?size=m&size=l` and `?size=m,l`.

Everything from a URL is attacker-controlled, so there are **two gates**:

1. `parseProductQuery` reduces every value to a known shape. A token must match
   `^[a-z0-9][a-z0-9-]{0,40}$`; a list is capped at 24 entries; an unknown sort
   falls back to the default; a page outside range becomes 1; a free-text term
   has its control characters replaced and is cut to 80 characters.
2. The service resolves those tokens against real rows and real enum values. An
   unrecognised fabric token produces an empty `IN ()`, which matches nothing —
   the same answer the shopper would get from asking for a fabric that does not
   exist.

Nothing from a URL is ever concatenated into SQL. Values reach PostgreSQL as
bound parameters through Prisma.

---

## Filtering semantics

**Groups are ANDed. Values inside a group are ORed.**

```
?category=cotton-dresses&colour=pink&colour=blue&size=m&max=2000

  category ∈ {cotton-dresses}
  AND (colour = pink OR colour = blue)
  AND size = M
  AND price ≤ 200000
  AND status = ACTIVE
```

Two parts of that need stating explicitly, because they are choices.

### Size and colour are evaluated against the same variant

`?colour=pink&size=m` returns a product only when **one orderable variant is
both pink and M**.

This is stricter than the Phase 4 mock, which checked the two lists
independently and would return a dress that comes in pink (in S only) and in M
(in blue only). That is not a pink dress in M. The change is deliberate: it is
the answer the shopper is asking for. In Prisma it is a single
`variants: { some: { … } }`.

### A size or colour counts only when it is orderable

Filtering by M never surfaces a garment with no M left. This is the Phase 4
behaviour, kept, and it is what keeps the facet counts honest: a facet offers a
value only when ticking it produces results.

The consequence, stated plainly: a fully sold-out product does not match any
size or colour filter, even without "In stock" ticked. It still appears in an
unfiltered listing, carrying its sold-out badge.

---

## Facet counts

Facets are built by aggregation in PostgreSQL. **Nothing fetches the catalogue
and counts it in JavaScript.**

### What a count means

A count is *the number of products that would be left if this value were
ticked, with every other group still applied*. The group being counted does not
narrow itself.

So after choosing Pink, the colour group still shows the other colours, with
the counts a shopper would get by adding them — instead of collapsing to
"Pink 4" and stranding them there. Every other group does narrow it, so a count
never promises results a tick would not produce.

A value is listed when its count is above zero **or** when it is currently
ticked. Keeping a ticked value visible at zero is what lets someone undo the
filter that emptied the page.

### How they are counted

Three queries, run together:

| Group                          | Query                                                                        |
| ------------------------------ | ---------------------------------------------------------------------------- |
| Category                       | `category.findMany` with a **filtered relation count**, so the label and the count arrive together |
| Fabric, pattern, fit, occasion | One `product.groupBy(['fabric','pattern','fit','occasion'])`                  |
| Size and colour                | One projection of `(productId, sizeId, colorId)` over orderable variants      |

The four-column `groupBy` deserves a note. Each product has exactly one value
in each of the four columns, so a row of that grouping is a distinct
*combination* with a count, and a single dimension's facet is the sum of the
rows agreeing with the other three selections. Four aggregations for the price
of one query, and the in-memory step walks distinct combinations — at most a
few dozen rows — never products.

Size and colour cannot be a `groupBy`: a product cut in six sizes in pink would
be counted six times, and what is wanted is `COUNT(DISTINCT product)`, which
Prisma's `groupBy` cannot express. So one query projects three key columns for
the orderable variants of the matching products, and the distinct pairs are
counted from that. It is bounded by the result set rather than by the
catalogue, and one query serves both groups because every row carries a size
*and* a colour — which is also what makes the self-exclusion exact.

**When it outgrows this:** step three becomes a parameterised
`COUNT(DISTINCT p.id) … GROUP BY` and nothing else changes. `listFilterGroups`
returns `FilterGroup[]` either way.

---

## Search

Server-side, in PostgreSQL, no external engine.

A term is split into at most six words. **Every word must be found**, so
"pink linen" does not return everything pink plus everything linen. Each word
is looked for in:

- product name
- short description
- article number
- the names of the collections the product is in
- the names of the colours it is cut in

The long description is deliberately excluded: it is prose, and matching inside
it returns a dress because the copy mentions linen in passing.

`contains` compiles to `ILIKE '%term%'`, which PostgreSQL answers with a
sequential scan. For a catalogue of this size that is a sub-millisecond scan of
a few dozen rows and the right amount of machinery for the problem.

**The upgrade path** is a generated `tsvector` column with a GIN index, or a
`pg_trgm` index serving the same `ILIKE`. Either replaces the body of
`buildSearchWhere` and nothing else: no caller changes, no component changes,
and the URL contract is untouched.

Search is not a separate results page. Submitting the header panel navigates to
`/shop?q=…`, so the results arrive as the ordinary listing with the ordinary
filters beside them — which is what someone who searched "linen" wants next.
Nothing is queried as you type.

---

## Sorting

Five options, unchanged from Phase 4, and they are the whole list:

| Value        | Order                                                        |
| ------------ | ------------------------------------------------------------ |
| `featured`   | `featured` desc, `bestSeller` desc, `publishedAt` desc, `id`  |
| `newest`     | `publishedAt` desc (nulls last), `id`                        |
| `price-asc`  | `price` asc, `id`                                            |
| `price-desc` | `price` desc, `id`                                           |
| `name-asc`   | `name` asc, `id`                                             |

**Every ordering ends with `id`.** Without a stable tiebreak, paging through
rows with equal prices can show one product twice and skip another.

`publishedAt`, not `createdAt`, is what "newest" means: the date a product went
live, which an operator sets. A re-import does not reshuffle the storefront.

### There is no "popularity" or "best selling" sort

There is no order system. Nothing has been sold. A sort claiming to rank by
sales would be ranking by nothing, so it is not offered — Phase 4 did not offer
it either, and Phase 5 did not invent it.

`bestSeller` is a **merchandising flag**, set by whoever runs the shop, exactly
like `featured`. It is a decision about what to put in front of people, not a
measurement. It appears as a tiebreak inside the featured ordering, as the
"Purple Rose picks" filter, and as the second home page rail. Nothing in the
application presents it as a ranking, and the copy never claims it is one.

### One Phase 4 behaviour dropped

The mock sorted sold-out pieces to the bottom of the featured order. That is
not reproduced. Availability lives in `Inventory`, and ordering a listing by a
related table's contents means either a denormalised "in stock" column on
`Product` that nothing yet maintains — a cache with no writer, which is exactly
the kind of thing that survives into production holding stale data — or a
correlated subquery Prisma cannot express. A sold-out piece still carries its
badge, and ticking "In stock" removes it outright.

---

## Pagination

Server-side, always. `productsPerPage` is 12, from
[`src/config/storefront.ts`](../../src/config/storefront.ts).

`listProducts` returns:

```ts
{ products, total, page, pageSize, pageCount }
```

The count and the page of rows run together — the count does not depend on the
rows. The requested page is then clamped to the number of pages that exist, so
`?page=900` shows the last page rather than an empty grid; when it overshoots,
one more query fetches the page that does exist, which is the only case where a
listing costs three queries instead of two.

Nothing reads a full result set to slice it.

---

## Related products

Deterministic, explainable, and not a recommendation engine.

Everything sharing **any** collection with the piece, in merchandising order,
with the piece itself excluded. Sharing any collection rather than only the
primary one is what lets a print story pull a co-ord next to a dress.

When that does not fill the rail it is topped up from the rest of the
catalogue, so the row is never half empty. At most three queries, and the third
only when it is needed.

Behaviour signals need behaviour, and none is collected. When orders exist,
"bought together" belongs here — as a new strategy behind the same function.

---

## Rendering and caching

**Nothing in the storefront is cached. Every page renders per request.**

| Route | Rendering |
| --- | --- |
| `/`, `/shop`, `/shop/[slug]` | Per request |
| `/sitemap.xml` | Per request |
| `/cart`, `/wishlist` | Per request |
| `/admin`, `/login` | Per request, unchanged from Phase 3 |
| `/robots.txt` | Static |

### Why, and it is not for want of trying

A product page is the obvious thing to cache: its data changes when somebody
edits it, not when somebody looks at it. It was built that way first —
`revalidate = 3600` with `generateStaticParams` returning `[]`, which is the
documented way to get incremental regeneration without tying the build to the
database.

It does not work here, and the reason is the header. `AccountMenu` is a Server
Component that reads the session cookie to choose between "Sign in" and the
account panel. It lives in the store layout, so it is part of **every**
storefront page, and a cached response cannot carry a personalised header.
Marking the product route static passed `next build` — there were no params to
prerender — and then failed on the first real request with
`DYNAMIC_SERVER_USAGE`, which is the framework saying exactly that.

This is not new. Phase 4 recorded the same trade-off for the whole storefront
and named Partial Prerendering as the eventual fix. Phase 5 does not change it.

**What caching the catalogue actually requires** is separating the personalised
part from the cacheable part — Partial Prerendering or Cache Components
(`cacheComponents: true` plus `use cache`), so the header becomes a dynamic hole
in a prerendered shell — or moving the account control to the client and
fetching the session from there. Both change how every route in the application
renders, including the authenticated ones, so either is its own piece of work
rather than a side effect of connecting the catalogue.

Note that `unstable_cache` is **not** used: Next.js 16 documents it as replaced
by `use cache`, and reaching for a deprecated API to avoid a documented one is
the wrong direction.

### What keeps per-request rendering cheap

Every page is a small, fixed number of queries on indexed columns, run in
parallel, with no N+1 and no full-table read. The counts are in
[Query counts per page](#query-counts-per-page). A product page fetches the
product once and shares it between the metadata and the body.

Not prerendering also means `next build` never needs a reachable database,
which preserves the Phase 2 decision that `src/lib/db/client.ts` documents: a
missing connection string is a runtime condition, not a build failure.

### Request-scoped deduplication

`getProductBySlug` is wrapped in React's `cache`. A product page calls it twice
— once in `generateMetadata`, once in the page — and without that every view
would run the same query twice. It is per request: nothing is shared between
shoppers and nothing is held between requests.

---

## SEO

Real product URLs exist now, so there is something worth telling a crawler.

**Product pages** take their title and description from `seoTitle` and
`seoDescription` where an operator has written them, and fall back to the
product's own name and the first 155 characters of its description where they
have not. Nothing is generated from a slug: an invented meta description is
worse than a truncated real one. Each page also carries a canonical URL, Open
Graph and Twitter cards built from its primary photograph at its real
dimensions, and product metadata — price, currency, availability, retailer item
id — read off the row, so a shopping crawler is told the same price and stock
the page shows. The amount is converted from paise once, by integer division.

**Category listings** are a page in their own right: `/shop?category=…` with
exactly one category and no other filter gets that collection's SEO copy and a
canonical naming it.

**Every other filtered listing is `noindex, follow`.** Filters are a
combinatorial space and a search term is unbounded, so indexing them would
offer a crawler an endless supply of near-identical pages. `follow` stays on,
so the products linked from a filtered view are still discovered, and the one
canonical route to each of them is `/shop/[slug]`.

**A product that does not resolve** returns `noindex` alongside its 404, so a
withdrawn piece stops being advertised.

`robots.ts` allows the storefront, blocks `/admin`, `/api/` and `/login`, and
declares the sitemap. Note that `disallow` is a request to crawlers and nothing
more — `/admin` is protected by a server-side session and role check, and that
is what actually keeps people out.

---

## Indexes

Chosen from the queries that actually run, not applied column by column.

| Index                                          | Serves                                                    |
| ---------------------------------------------- | --------------------------------------------------------- |
| `Product(slug)` unique                         | `/shop/[slug]`                                             |
| `Product(articleNumber)` unique                | Article identity, and search on it                         |
| `Product(status, publishedAt)`                 | Newest order, the sitemap, both home rails                 |
| `Product(status, price)`                       | Price range filter, both price orderings                   |
| `Product(primaryCategoryId)`                   | The foreign key check when a category changes              |
| `Category(slug)` unique                        | Category lookup by URL                                     |
| `Category(isActive, position)`                 | "Active categories in merchandising order" — every page    |
| `ProductCategory(productId, categoryId)` PK    | Membership uniqueness                                      |
| `ProductCategory(categoryId, position)`        | Category filter and category facet                         |
| `Size(code)` unique, `Color(slug)` unique      | Resolving a URL token to a row                             |
| `Size(isActive, position)`, `Color(…)`         | Facet ordering                                             |
| `ProductVariant(sku)` unique                   | Variant identity; the seed's upsert key                    |
| `ProductVariant(productId, colorId, sizeId)` unique | **No duplicate combinations**                         |
| `ProductVariant(productId)`                    | Loading a product's variants                               |
| `ProductVariant(colorId)`, `(sizeId)`          | Colour and size filters and facets                         |
| `Inventory(variantId)` unique                  | The one-to-one relation                                    |
| `Inventory(quantity)`                          | Availability, the only predicate this table is filtered by |
| `ProductImage(productId, colorId, position)`   | "This product's gallery in this colour, in order"          |
| `ProductImage(colorId)`                        | The foreign key check when a colour is retired             |

**Deliberately not indexed:** the merchandising booleans and the four attribute
enums. They are low-cardinality columns on a table of a few dozen rows, and
PostgreSQL will choose a sequential scan over any index on them at this size.
When the catalogue reaches a few thousand rows, the right answer is partial
indexes — `CREATE INDEX … ON "Product"(featured) WHERE status = 'ACTIVE'` —
chosen from real `EXPLAIN` output rather than guessed at now.

### Query counts per page

| Page            | Queries                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| `/shop`         | 6–7: categories for the chrome, count, page of rows, 3 facet queries, and a category lookup when exactly one is selected (deduped with the one `generateMetadata` makes) |
| `/shop/[slug]`  | 4–5: chrome, the product (deduped across metadata and page), related, and a top-up when the rail is short |
| `/`             | 4: chrome, category tiles, two rails                                      |

Each also reads the session for the header, which is what Phase 3 added and
what keeps these pages dynamic.

No N+1 anywhere: variants, images and categories all arrive with their product
in one query, through `select`, and no loop issues a query.

---

## Presentation types

No component ever receives a Prisma model.

```
Prisma row  →  lib/catalog/product-mapper.ts  →  types/commerce.ts  →  component
```

`ProductCardData` and `ProductDetailData` describe what the interface renders,
not how anything is stored. The selects live next to the mappers so the two
cannot drift: a select that stops returning a column makes the mapper stop
compiling.

Phase 5 extended `ProductDetailData` with two fields, and this is the one place
the interface contract genuinely had to grow:

- **`colourOptions`** — per colour, its own photographs and its own size
  availability. The mock had one flat image list and one flat size list per
  product, which cannot express the two facts a real catalogue has: a garment
  is photographed separately in each colour, and it is cut in different sizes
  in each colour.
- **`articleNumber`** — shown in the details and in the product metadata.

The existing flat `images`, `sizes` and `colours` stay as the union across
every colour. They are what a card shows and what the page falls back to before
a colour is chosen, which is why nothing built in Phase 4 had to change.

### Variant selection in the browser

`ProductVariantProvider` holds which colour and size are chosen, and both the
gallery and the purchase panel read it. That is what lets a colour swatch
change the photographs on the other side of the page while the description, the
details, the delivery notes and the related rail stay server-rendered — they
are passed through the provider as children.

It holds *selection*, never data. Every colour, size and photograph comes from
the server. It enforces one rule the database is the source of truth for: when
a colour changes and the chosen size is not cut in the new one, the size is
cleared rather than left selected on a combination nobody can buy.

---

## Seed data

```
pnpm db:seed
```

Content in [`prisma/catalog/data.ts`](../../prisma/catalog/data.ts), writing in
[`prisma/catalog/seed.ts`](../../prisma/catalog/seed.ts).

| | |
| --- | --- |
| Categories | 5 live, 1 disabled |
| Sizes | XS S M L XL XXL, with measurements |
| Colours | Black, White, Beige, Pink, Lavender, Blue, Green, Red |
| Products | 24 live, 1 draft, 1 archived |
| Variants | One per colour-and-size a product is actually cut in |
| Images | Two per colour, plus one shared by all of them |

Twenty-four live products is exactly two pages at twelve per page, which makes
the pager real rather than hypothetical. Between them they cover every state
the storefront renders: a reduced price, a colour sold out inside an otherwise
available product, two products sold out entirely, each badge, products in one
collection and in two, a full size run and a short one, and a price spread from
₹990 to ₹5,490 wide enough that sorting and the price filter visibly do
something.

The draft and the archived piece exist so "unpublished work is not public" can
be checked rather than assumed. The archived one also sits in the disabled
collection.

### Idempotency

Running it twice produces the same catalogue, not two of it. Every write is
keyed on a natural unique column — category slug, size code, colour slug,
product slug, variant SKU — never on a generated id.

- Variants that leave the seed are **deactivated, not deleted**: that is the
  row a future order line will reference.
- Photographs have no natural key, so the set is fingerprinted and compared
  first, and only replaced when it differs. A re-run does not churn every image
  row to reach the state it was already in.
- Publication dates count back from a **fixed anchor** rather than `Date.now()`,
  so re-seeding does not silently reshuffle the listing.
- `articleNumber` is set on create only. It is printed on a swing tag, so a
  re-import does not rewrite it.

The whole seed is validated before the first insert: slugs, duplicate article
numbers, hex colours, unknown category or colour or size references, negative
stock, and a `compareAtPrice` that is not actually a reduction. The cheapest
place to catch a typo is before product one, not at product nineteen.

### Photography

Development placeholders from Unsplash, pooled and rotated. Pooled because
there are far more colour galleries than placeholder photographs, and a
repeated stock photo is an obviously temporary picture rather than a wrong one.

Every URL is built by one function in one file. Replacing them with real Purple
Rose photography is that file and nothing else — no component contains a URL,
and the schema is not tied to the host.

---

## Verification

```
pnpm check:catalog       # offline: no database, no environment
pnpm check:catalog:db    # against a real database
```

The offline checks cover URL parsing (including hostile input), the money
arithmetic, the vocabularies, the filter and sort builders, the row-to-page
mapping — including per-colour galleries and per-colour size availability — and
the seed content.

The database checks run the real services: paging, clamping, every sort, every
filter, facet counts matched against the listings they predict, search
including a SQL fragment as a term, the product page, related products, the
home rails, that nothing unpublished is reachable or listed or in the sitemap,
and that seeding twice changes nothing.

No test framework was introduced. The project already runs verification as
scripts (`pnpm check:auth`, `pnpm check:auth:db`); adding a runner for two more
would be ceremony. When the domain grows a unit-testable core worth a watch
mode and a reporter, that is the moment to add one.

---

## Not built yet

Deliberately out of scope, and the schema is shaped so none of them needs a
redesign:

- **Colour and size management.** Phase 6 built the admin area for products,
  collections, variants, stock and photography; colours and sizes are still
  seeded. See
  [Known limitations](../admin-catalog/README.md#known-limitations).
- **Inventory workflows.** Adjustments, reservations, stock takes, returns.
  `Inventory` is the table they attach to.
- **Cart, orders, checkout, payment, coupons, reviews.** The bag control is an
  interface shell and says so. The wishlist is real as of Phase 8 and reads the
  catalogue through the same mapper this document describes — including, in one
  deliberate place, products that are no longer ACTIVE. See
  [docs/wishlist/README.md](../wishlist/README.md).
- **Production image storage.** `ProductImage.url` already accepts any absolute
  URL.
- **Size guide.** `Size` carries measurements; nothing renders them.
- **A search engine.** See [Search](#search) for the upgrade path.
- **Variant price overrides.** See [Money](#money) for the reason and the path.
