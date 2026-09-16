# Purple Rose storefront

How the customer-facing interface is put together, and why. Written for
engineers joining the repository.

Phase 4 built the storefront and the reusable commerce component system.
Phase 5 put a real catalogue behind it and, because no component knew where its
data came from, changed almost nothing on this page.

For the catalogue itself — the models, the services, filtering, facets,
pricing and the seed — read [docs/catalog/README.md](../catalog/README.md).

---

## What is real and what is not

Being able to tell these apart is the most important thing on this page.

| Area | State |
| --- | --- |
| Layout, navigation, drawers, search panel | Real and working |
| Filtering, sorting, paging | Real, in the URL, answered by PostgreSQL |
| Product cards, grid, gallery, selectors | Real components, real data |
| Product, category, variant and price data | **Real.** PostgreSQL through `lib/services/` |
| Search | **Real.** Server-side, submits to `/shop?q=…` |
| Imagery | **Placeholder** photographs from Unsplash, in the database |
| Wishlist saving | **Not implemented.** The control says so |
| Add to bag, bag contents | **Not implemented.** The drawer says so |
| Newsletter sign-up | **Not implemented.** The form says so |
| Catalogue management | **Not implemented.** Edited through the seed |

Nothing pretends. There is no fake cart count, no invented search results, no
button that appears to save something and then loses it. Where a feature is
missing, the control stays in its real position and states what it is waiting
for, which is the convention Phase 1 set and Phase 3 followed.

---

## Layout

```
AnnouncementBar          store-wide message, scrolls away
SiteHeader               sticky: wordmark, nav, search, wishlist, account, bag
  MobileNav              drawer, below lg
  MainNav                inline links, lg and up
  HeaderActions          SearchOverlay, wishlist link, AccountMenu, CartDrawer
main                     the page
SiteFooter               shop / account / help, all links real
```

The header is **solid, not translucent or blurred**. A `backdrop-filter` makes
an element a containing block for fixed descendants, which is what trapped the
mobile drawer inside the header in Phase 1. Every drawer is portalled out of
this subtree now, so it would not break again, but the rule stands: do not put
a filter, transform or containment on the header.

Breakpoints follow Tailwind defaults. Two matter:

- **`lg` (1024px)** swaps the mobile drawer for inline navigation and moves the
  filter sidebar in beside the results.
- **`xl` (1280px)** is where category links join the navigation. At `lg` the
  wordmark, primary links and four controls already fill the row; adding four
  categories pushed the header wider than the viewport. That was found by
  measuring, not by guessing.

---

## Component organisation

```
src/components/
├── ui/          design system primitives; no commerce knowledge
│   ├── button, card, badge, container, section, typography, input, icon-button
│   ├── skeleton         loading placeholder
│   └── drawer           the one slide-over implementation
├── layout/      site chrome: header, footer, navigation, account menu
├── shared/      cross-cutting: icons, empty-state
└── commerce/    shop-specific presentation
    ├── product-card        + ProductCardSkeleton
    ├── product-grid        + ProductGridSkeleton, ProductRail
    ├── product-gallery     photographs, client
    ├── product-purchase-panel  colour, size, add to bag, client
    ├── price               formats from site config
    ├── product-badge       new / sale / bestseller / featured / sold out
    ├── size-selector       radio group, client
    ├── colour-selector     radio group, client
    ├── wishlist-button
    ├── filter-panel        checkbox groups and price, client
    ├── filter-drawer       the same panel on small screens, client
    ├── active-filters      removable chips, client
    ├── sort-select         native select, client
    ├── breadcrumbs
    ├── pagination          real links
    ├── cart-drawer         client
    └── search-overlay      client

src/features/storefront/
├── components/     page sections: hero, category tiles, editorial, newsletter
├── product-query.ts        the URL contract
└── use-product-filters.ts  writes filters to the URL, client
```

The split is by **what a thing knows**, not by where it appears. A `ui`
component knows nothing about products. A `commerce` component knows about
products but not about pages. A `features/storefront` component knows about a
particular section of a particular page.

Nothing in `components/` fetches data or contains business logic. Every one
takes typed props.

---

## The product card contract

This is the interface the catalogue services satisfy, and the reason
connecting a real database did not mean rewriting the interface.

```ts
<ProductCard product={product} priority={false} sizes="..." />
```

`product` is a `ProductCardData` from `src/types/commerce.ts`:

```ts
type ProductCardData = {
  id: string;
  slug: string;
  name: string;
  category: { slug: string; name: string };
  price: number;              // minor units, always an integer
  compareAtPrice?: number;    // the old price, when genuinely reduced
  image: StorefrontImage;
  hoverImage?: StorefrontImage;
  badges: readonly ProductBadgeKind[];
  inStock: boolean;
  colours: readonly ProductColour[];
};
```

`ProductDetailData` extends it with `images`, `description`, `details` and
`sizes`.

Three rules make this work:

1. **No component imports a Prisma type.** The database schema can be reshaped
   without touching a single component. When the catalogue exists, a service
   maps a row to this shape, and that mapping is the only place the two
   vocabularies meet.
2. **Money is an integer in the minor unit.** Never a float: `0.1 + 0.2` is not
   `0.3` in binary floating point, and a store that adds up line items cannot
   afford that. `formatPrice` converts at the presentation boundary and reads
   the currency from `siteConfig`, so no component carries a currency symbol.
3. **Images carry their intrinsic size.** Every card, tile and gallery frame is
   a fixed 4:5 box, so a row never reflows as photographs arrive.

---

## Filtering, sorting and paging

Filter state lives in the **URL**, not in component state.

```
/shop?category=co-ord-sets&size=m&colour=oat&sale=true&sort=price-desc&page=2
```

That is what makes a filtered listing shareable, bookmarkable, correct when
someone presses back, and renderable on the server. It is also what keeps the
shop page a Server Component: only the small controls are interactive.

```
FilterPanel / SortSelect / ActiveFilters   (client)
        │  writes
        ▼
URL search params
        │  read on the server
        ▼
parseProductQuery()        src/features/storefront/product-query.ts
        │  typed ProductQuery
        ▼
listProducts(query)        src/lib/services/product-service.ts
        │
        ▼
ProductGrid                (server)
```

`product-query.ts` owns the URL and nothing else. It parses and validates
everything arriving from one, discarding anything unrecognised, and hands a
typed `ProductQuery` to the service. It does not know Prisma exists, and the
services do not read a query string.

Navigation happens inside a `useTransition`, so the current results stay on
screen and interactive while the next set is prepared. Filter changes use
`router.replace`, so ticking four boxes does not leave four history entries,
and any change resets to page one.

Paging is real links, so a page can be opened in a new tab, shared and
crawled, and works before any JavaScript arrives.

---

## Client and server boundaries

**Every page and every layout is a Server Component.** The two exceptions in
the repository are `app/error.tsx` and `app/global-error.tsx`, which Next.js
requires to be client components.

Client components exist only where something genuinely needs state, and each is
as small as the interaction allows:

| Client component | Why |
| --- | --- |
| `drawer` | open state, focus, Escape, scroll lock |
| `mobile-nav`, `filter-drawer`, `cart-drawer` | wrap the drawer |
| `search-overlay` | input state and panel |
| `filter-panel`, `sort-select`, `active-filters` | write to the URL |
| `product-gallery` | which photograph is shown |
| `product-variant-selection` | the chosen colour and size, shared by the two below |
| `product-purchase-panel` | renders the selectors and the buy controls |
| `size-selector`, `colour-selector` | used by the panel above |
| `use-product-filters`, `use-body-scroll-lock` | hooks |

Consequences worth knowing:

- The home page, the shop page, the product page, every card and the footer are
  all server-rendered. The grid ships no JavaScript.
- `SearchOverlay` takes its suggestions as **props**, from the store layout.
  It would otherwise have to query the catalogue from the browser.
- `ProductVariantProvider` wraps the product page's two-column grid so a colour
  choice moves both the gallery and the size row. Everything inside it that is
  not a control — the description, the details, the delivery notes — is still
  server-rendered and passed through as children.
- Reading the session for the account menu makes the store routes render per
  request rather than being statically generated. That is the cost of an
  authenticated header, noted in `docs/authentication/README.md`. Partial
  Prerendering is the eventual fix.

---

## Imagery

No component contains a URL. There are exactly two sources:

| Kind | Where it lives |
| --- | --- |
| Product and category photography | Database rows, written by `prisma/catalog/data.ts` |
| Hero and editorial photography | `src/config/media.ts` |

The split is by what the picture is. A product photograph is catalogue data
that changes with the stock; the hero is brand imagery that changes with the
brand, so it is configuration next to the wordmark and the announcement bar.

Both are still **development placeholders** from Unsplash, which is the one
reason `images.unsplash.com` is allowed in `next.config.ts`. The schema is not
tied to it: `ProductImage.url` and `Category.imageUrl` are plain absolute URLs,
so moving to Cloudinary, Vercel Blob or S3 is a seed change and a second entry
in that config, not a migration.

Rules that outlast the placeholders:

- `next/image` with `fill` inside a box that already has an aspect ratio.
  Nothing shifts as images load.
- One ratio, **4:5 portrait**, for every card, tile and gallery frame, and 3:2
  for the hero and editorial panels.
- `object-cover`. Images are never stretched.
- `sizes` describes how much width the image gets at each breakpoint, so the
  browser can pick a sensible source instead of the largest one.
- `priority` only above the fold: the hero, the first four cards in a grid, the
  main gallery image. Everything else stays lazy.
- **Alt text describes the garment.** "A loose cotton dress with short
  sleeves", not "product image". A decorative second shot gets `alt=""`.

---

## Accessibility conventions

Verified in a browser, not assumed. See
[verification](#verification) for what was actually run.

- **Drawers**: one implementation in `ui/drawer.tsx`. Portalled to
  `document.body`, Escape closes, focus starts on the close button and returns
  to the trigger on every close path including Escape, background scroll locks,
  and **the rest of the page is set `inert`** so the keyboard, the pointer and
  a screen reader's virtual cursor all stay inside. `inert` is the browser
  doing containment properly; a hand-written Tab cycle catches the keyboard and
  misses the other two.
- **Selectors are radio groups.** Size, colour and gallery thumbnails are real
  `input[type=radio]` in a `fieldset`. That brings one tab stop per group,
  arrow-key movement and correct announcements from the browser rather than
  from us.
- **Nothing is conveyed by colour or shape alone.** A sold-out size is struck
  through *and* announced as "sold out". The selected colour is named in text
  beside the swatches. A struck-through old price is preceded by hidden "Was".
- **Target sizes** meet the WCAG 2.2 minimum of 24 by 24 pixels. Icon buttons
  are 40 pixels. This was measured at every breakpoint, and several text links
  were given padding because of it.
- **Filter chips name their group**, so a chip is announced as "Remove colour
  Ivory" rather than "Ivory".
- **Result counts are announced** through one `aria-live` region, so changing a
  filter tells a screen reader user how many pieces are left.
- **Skeletons are `aria-hidden`** with a single status message, so a loading
  grid is announced once rather than as eight empty list items.
- **`aria-*` is not decoration.** `aria-disabled` marks a control that is
  genuinely unavailable and keeps it reachable so its reason can be heard.
  Nothing carries an ARIA attribute that repeats what the element already says.
- **Reduced motion** is respected globally: `globals.css` cuts animation and
  transition durations for anyone who has asked for less movement.

---

## Navigation conventions

Two rules, both enforced by the compiler or by review:

1. **Every `href` in `src/config/navigation.ts` is typed against the generated
   route map.** A link to a page nobody has built fails the typecheck.
2. **Anything not built is a `note`, not a link.** It renders as plain text
   with the reason attached for assistive technology.

That is why there are no social links: no accounts exist, and a link to an
invented handle is worse than no link at all.

Category links point at `/shop?category=<slug>`, which the shop page already
reads, so they keep working when categories become database rows.

---

## Design system usage

The Phase 1 tokens are authoritative and were not changed. Use the semantic
utilities, never a raw colour:

`bg-canvas` `bg-surface` `bg-surface-strong` `text-ink` `text-ink-muted`
`text-ink-subtle` `border-line` `border-line-strong` `bg-brand`
`text-brand-strong` `bg-brand-soft` `text-on-brand` `rounded-card`
`rounded-control` `shadow-subtle` `shadow-raised` `max-w-page`
`tracking-eyebrow`

The one exception is a **product colour swatch**, which uses an inline
`backgroundColor` from the data. That describes the garment, not the interface,
and it is the only place a raw colour value belongs.

Typography follows Phase 1: `font-display` (Cormorant Garamond) for editorial
headings and the wordmark, `font-sans` (Inter) for everything operational,
which is product names, prices, navigation, filters, buttons and forms. A
price set in a display serif is harder to read at a glance, which is the
opposite of what a price is for.

Reuse the primitives. Do not write a new button.

---

## Where the data comes from

Nothing under `src/components/` queries anything. Three route files and the
store layout read the catalogue, and everything below them receives props:

| File | Reads |
| --- | --- |
| `app/(store)/layout.tsx` | `getCategoryNavigation()` — header, drawer, footer, search |
| `app/(store)/page.tsx` | `getCategoryTiles()`, two `listMerchandisedProducts()` rails |
| `app/(store)/shop/page.tsx` | `listProducts()`, `listFilterGroups()`, `getCategoryBySlug()` |
| `app/(store)/shop/[slug]/page.tsx` | `getProductBySlug()`, `listRelatedProducts()` |

That set is the seam. It is short on purpose: when the catalogue changed from
an array to a database, these four files changed an import each and nothing
else did.

The services are in `src/lib/services/`, they are `server-only`, and they
return the presentation types in `src/types/commerce.ts` — never a Prisma
model. See [docs/catalog/README.md](../catalog/README.md).

---

## What Phase 5 changed up here

Almost nothing, which was the point. The four route files above, plus:

- **`types/commerce.ts` grew two fields on `ProductDetailData`:**
  `colourOptions`, carrying each colour's own photographs and its own size
  availability, and `articleNumber`. The flat `images`, `sizes` and `colours`
  stayed as the union across every colour, which is why the card, the grid and
  the badges did not move. A real catalogue has two facts a flat list cannot
  express: a garment is photographed separately in each colour, and cut in
  different sizes in each colour.
- **`product-query.ts` grew** a search term, four attribute groups and three
  merchandising flags — all of which the Phase 4 filter panel had been designed
  for but could not yet parse. Nothing that already existed changed name or
  meaning.
- **`filter-panel.tsx` gained a "Collections" fieldset** for the merchandising
  flags, built from the same `FilterFieldset` as the others. The attribute
  groups needed no change at all: the panel renders whatever `FilterGroup[]` it
  is given, and the service now gives it seven groups instead of three.
- **`search-overlay.tsx` submits** to `/shop?q=…` instead of explaining that
  search is not connected.
- **`product-purchase-panel.tsx` reads its selection from context** rather than
  local state, so the gallery can follow the colour.
- **The footer's category links come from the database**, so
  `config/navigation.ts` holds no category list to go stale.

No token, no spacing scale, no component appearance changed.

---

## Still not connected

- **Wishlist and cart persistence.** Their UI is in place and each control
  states that it is not connected, so wiring them up is adding a write path
  rather than designing a feature.
- **Catalogue management.** No admin screens and no CRUD services. The schema
  carries every field they will need.
- **Reviews.** The product page has the section and says no reviews exist,
  because none do.

---

## Verification

### Phase 5

The catalogue behind this interface is verified by `pnpm check:catalog` and
`pnpm check:catalog:db`; see
[docs/catalog/README.md](../catalog/README.md#verification) for what each
covers.

Every page was then served from a production build against the seeded
database and its HTML checked: the home rails and category tiles, the listing
count and all nine filter groups, sixteen filter, price and search
combinations, a product page's per-colour galleries and per-colour size
availability, the related rail, the sitemap, and that a draft, an archived
product and a disabled collection are all 404 or absent rather than merely
hidden.

Authentication was re-checked against the same database after the catalogue
landed — `pnpm check:auth` and `pnpm check:auth:db`, 71 assertions covering
sign-in, roles, lockout, replay, expiry and session revocation — and `/admin`
still redirects an anonymous request. The catalogue touched no auth file.

**What was still not done is the visual pass.** No page was opened in a real
browser, so the responsive sweep from 320 to 1920 pixels and the interaction
assertions below were not repeated with real data. The components did not
change in appearance, but "the grid looks right with twenty-four real products
in it" is not something anyone has looked at. Repeat the Phase 4 browser pass
before treating the storefront as visually verified.

### Phase 4

What was actually run against a real browser, not assumed:

- **Responsive**: 7 pages at 320, 360, 390, 414, 768, 1024, 1280, 1440 and
  1920 pixels. No horizontal scrolling, no element outside the viewport, no
  interactive control under 24 by 24 pixels, no broken image. 63 combinations.
- **Interaction**: 39 assertions covering drawer open, focus placement, `inert`
  application and removal, scroll lock and release, Escape, focus restoration,
  the search panel states, filter and sort writing to the URL, filters
  surviving a sort change, clear-all keeping the sort, the no-matches state,
  Tab reaching the skip link, and the product page selectors.
- **Authentication regression**: `/admin` still redirects when unauthenticated,
  a forged cookie still gets no further, the signed-out header shows sign-in,
  no admin link reaches an anonymous visitor, and `pnpm check:auth` still
  passes.

Two real defects were found this way and fixed: the header overflowed the
viewport at 1024 pixels, and the shared drawer closed on Escape without
returning focus to its trigger.
