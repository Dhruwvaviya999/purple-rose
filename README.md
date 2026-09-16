# Purple Rose

An ecommerce storefront for **Purple Rose**, a women's fashion label.

The application is built as a single Next.js project: the storefront, the
customer account area, the admin console and the backend all live here. There
is no separate API service.

> **Current phase: Phase 6 — admin catalogue management.** Complete.
>
> - **Phase 1** built the project foundation: routing boundaries, design
>   tokens, UI primitives and the store shell.
> - **Phase 2** added the database foundation: PostgreSQL on Neon through
>   Prisma, migrations, seed infrastructure and a server-only data layer.
> - **Phase 3** added authentication: phone number plus one-time code, with
>   database-backed sessions, roles and a protected admin area.
> - **Phase 4** built the storefront: home page, listing, product page and a
>   reusable commerce component system, with filtering and sorting in the URL.
> - **Phase 5** put a real catalogue behind it: products, categories,
>   variants, colours, sizes, stock, prices and colour-specific photography,
>   with server-side search, filtering, facet counts, sorting and paging.
> - **Phase 6** built the admin area that manages it: product and collection
>   screens, variants and stock, photography, publishing and archiving, all
>   behind server-side authorisation.
>
> The catalogue is edited through `/admin`, not by rewriting the seed. See
> [Phase 6 — admin catalogue management](#phase-6--admin-catalogue-management).

---

## Tech stack

| Concern         | Choice                                       |
| --------------- | -------------------------------------------- |
| Framework       | Next.js 16 (App Router, Turbopack)           |
| Language        | TypeScript 5, `strict` mode                  |
| UI              | React 19, Server Components by default       |
| Styling         | Tailwind CSS 4 (CSS-first theme)             |
| Variants        | `class-variance-authority`, `tailwind-merge` |
| Linting         | ESLint 9 with `eslint-config-next`           |
| Database        | PostgreSQL on Neon                           |
| ORM             | Prisma 7 with the `@prisma/adapter-pg` driver |
| Auth            | Phone plus one-time code, built on Next.js primitives |
| Validation      | Zod 4, server-side                           |
| Phone parsing   | `libphonenumber-js`                          |
| Package manager | pnpm                                         |
| Hosting target  | Vercel                                       |

Planned for later phases: the real product catalogue, then the bag, checkout
and orders.

There is no Docker in this project, and there will not be one. It runs directly
on Node.js with pnpm, and connects to Neon over the network. See
[docs/database/README.md](docs/database/README.md) for the reasoning.

## Requirements

- Node.js 20.9 or newer
- pnpm 10 or newer
- A PostgreSQL database. Use a free [Neon](https://neon.tech) project; no local
  database or container is needed.

## Installation

```bash
pnpm install
cp .env.example .env.local
# set DATABASE_URL and AUTH_SECRET in .env.local, then:
pnpm db:migrate
```

Generate a secret with `openssl rand -base64 32`.

`pnpm install` also generates Prisma Client, so a fresh clone is ready to build.
Full database setup is in
[docs/database/README.md](docs/database/README.md#first-time-setup).

## Development commands

```bash
pnpm dev     # start the dev server on http://localhost:3000
pnpm build   # generates Prisma Client, then builds and typechecks
pnpm start   # serve the production build, after pnpm build
pnpm lint    # ESLint
```

Database commands:

```bash
pnpm db:migrate          # create and apply a migration (development only)
pnpm db:migrate:deploy   # apply committed migrations (preview / production)
pnpm db:migrate:status   # show applied and pending migrations
pnpm db:generate         # regenerate Prisma Client after a schema change
pnpm db:seed             # run the idempotent seed
pnpm db:studio           # open Prisma Studio on http://localhost:5555
```

`pnpm db:migrate` can reset a database when history has diverged, so point it
only at a database you are willing to lose. Use `pnpm db:migrate:deploy`
everywhere else.

Prisma 7 does not regenerate the client when you migrate. After editing
`prisma/schema.prisma`, run `pnpm db:generate`.

Verification:

```bash
pnpm check:auth          # authentication logic; no database needed
pnpm check:auth:db       # full auth flows; needs DATABASE_URL and AUTH_SECRET
pnpm check:catalog       # catalogue logic and seed content; no database needed
pnpm check:catalog:db    # listing, filters, facets, search; needs DATABASE_URL
pnpm check:admin         # admin mutations and the guard audit; needs DATABASE_URL
pnpm check:admin:http    # admin access control; needs a running server as well
```

`pnpm check:catalog:db` re-runs the catalogue seed to prove that doing so
changes nothing. `pnpm check:admin` creates and deletes its own records, and
`pnpm check:admin:http` briefly archives one seeded product and restores it.
All three write, so run them against a development database.

`pnpm check:admin:http` needs the app running. Start it first, or point it
somewhere else:

```bash
pnpm build && pnpm start
pnpm check:admin:http
# or
CHECK_BASE_URL=http://localhost:3100 pnpm check:admin:http
```

## Environment setup

```bash
cp .env.example .env.local
```

One variable is required:

| Variable       | Required | Purpose                                        |
| -------------- | -------- | ---------------------------------------------- |
| `DATABASE_URL` | yes      | Neon **pooled** connection string, used at runtime |
| `AUTH_SECRET`  | yes      | Key used to hash one-time codes. At least 32 characters |
| `DIRECT_URL`   | no       | Neon **direct** connection string, used by the Prisma CLI for schema changes |
| `NEXT_PUBLIC_APP_URL` | no | Canonical origin; defaults to `http://localhost:3000` |
| `SEED_ADMIN_PHONE_NUMBER` | no | Phone number the seed promotes to `ADMIN` |

The authentication settings (code lifetime, attempt limits, cooldowns, session
lifetime) all have safe defaults and are listed in
[docs/authentication/README.md](docs/authentication/README.md#environment-variables).

Everything else in `.env.example` is commented out and belongs to a later
phase, so a missing value never looks like a bug.

Three rules hold for the whole project:

- Only values that are safe in a browser carry the `NEXT_PUBLIC_` prefix.
  Secrets never do.
- `.env*` files are ignored by git. `.env.example` is the one exception and
  must never contain a real credential.
- Server-only values are read through `src/lib/env.server.ts`, which is marked
  `server-only`. Importing it from a client component fails the build.

## Routes

| Route          | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| `/`            | Storefront home: category tiles and two product rails          |
| `/shop`        | The catalogue: search, filters, sort and paging, all in the URL |
| `/shop/[slug]` | Product page, rendered per request from real slugs             |
| `/wishlist`    | Wishlist shell. Saving is not implemented                      |
| `/cart`        | Bag shell. Carts are not implemented                           |
| `/login`       | Phone plus one-time code sign-in, public                       |
| `/admin`       | Catalogue dashboard. **ADMIN only**, never indexed             |
| `/admin/products`      | Product list: search, filter, sort, page               |
| `/admin/products/new`  | Create a product                                      |
| `/admin/products/[id]` | Edit, publish, variants, photographs                  |
| `/admin/categories`    | Collections: list, reorder, switch on and off         |
| `/admin/categories/new` | Create a collection                                  |
| `/admin/categories/[id]` | Edit a collection                                   |
| `/api/health`  | Liveness and database reachability probe                       |
| `/robots.txt`  | Crawl rules, generated from `src/app/robots.ts`                |
| `/sitemap.xml` | Public pages, active categories and active products            |

Categories are a filtered listing, `/shop?category=cotton-dresses`, not a route
of their own. There is deliberately one URL for a set of products rather than
two competing ones.

## Folder structure

```
prisma/
├── schema.prisma             models and enums — the written shape of the data
├── migrations/               committed SQL history; reviewed in pull requests
├── seed.ts                   idempotent seed: catalogue, plus optional admin
└── catalog/
    ├── data.ts               what the catalogue contains
    └── seed.ts               how it is written, repeatably

prisma7.config.ts             Prisma 7 CLI config: URLs, migration path, seed

scripts/
├── check-auth.ts             auth logic checks, no database needed
├── check-auth-db.ts          full auth flow checks against a real database
├── check-catalog.ts          catalogue logic and seed content, no database
├── check-catalog-db.ts       listing, filters, facets and search, live database
├── check-admin.ts            admin mutations, plus the "every action is guarded" audit
└── check-admin-http.ts       admin access control, against a running server

docs/
├── database/README.md        database architecture, decisions and workflows
├── authentication/README.md  auth architecture, OTP lifecycle, security notes
├── storefront/README.md      component system and the product data contract
├── catalog/README.md         catalogue domain, services, filtering, seeding
└── admin-catalog/README.md   admin architecture, authorisation, mutations

src/
├── proxy.ts                  optimistic request guard (Next.js 16 convention)
├── app/                      routing only — thin files that compose features
│   ├── (store)/              storefront group: header + footer chrome
│   │   ├── layout.tsx        store shell, skip link
│   │   ├── page.tsx          /
│   │   ├── shop/page.tsx     /shop — listing, filters, sort, paging
│   │   ├── shop/[slug]/      /shop/<piece> — product page
│   │   ├── wishlist/         /wishlist — shell
│   │   └── cart/             /cart — shell
│   ├── (auth)/               sign-in group: focused, chrome-light
│   │   ├── layout.tsx
│   │   └── login/page.tsx    /login
│   ├── admin/                admin area: own chrome, never indexed
│   │   ├── layout.tsx        sidebar shell, the role gate
│   │   ├── page.tsx          /admin — catalogue dashboard
│   │   ├── products/         list, create, edit
│   │   └── categories/       list, create, edit
│   ├── api/health/route.ts   liveness and database probe
│   ├── globals.css           design tokens and base styles
│   ├── layout.tsx            root layout: fonts, metadata, html/body
│   ├── icon.tsx              favicon, generated from the brand mark
│   ├── opengraph-image.tsx   default social card
│   ├── robots.ts
│   ├── not-found.tsx         404
│   ├── error.tsx             route error boundary
│   └── global-error.tsx      root-layout error boundary
│
├── components/
│   ├── ui/                   design system primitives, no business logic
│   ├── commerce/             product cards, grid, filters, selectors, drawers
│   ├── layout/               header, footer, navigation, account menu
│   └── shared/               cross-feature pieces (icons, empty states)
│
├── features/
│   ├── auth/                 sign-in form, OTP input, sign-out control
│   └── storefront/           page sections and the URL query contract
├── actions/
│   ├── auth.ts               the only two authentication endpoints
│   └── admin/                catalogue mutations, one module per feature
│
├── generated/prisma/         Prisma Client — generated on install, git-ignored
│
├── lib/
│   ├── auth/                 sessions, roles, OTP crypto, phone normalisation
│   ├── admin/                money conversion, admin URL contract, action plumbing
│   ├── catalog/              filters, row mapping, attribute vocabularies
│   ├── db/client.ts          the single Prisma Client (server-only)
│   ├── utils/                framework-agnostic helpers
│   ├── services/             the only layer that queries the database
│   │   └── admin/            the catalogue write path
│   ├── validations/          input schemas, reused by forms and actions
│   ├── env.ts                browser-safe environment access
│   └── env.server.ts         server-only environment access (server-only)
│
├── config/                   app constants: brand, navigation, storefront
├── hooks/                    reusable client-side hooks
└── types/                    shared types, including the commerce contract
```

`features/` holds one folder per business capability. Each layer keeps a
README stating the rules for what goes in it, so the conventions stay fixed as
features arrive.

## Architecture overview

**Route groups draw the boundaries.** `(store)` and `(auth)` are groups, so
they shape the layout without appearing in the URL. `admin` is a real segment
because it is a real path. Each area owns its own chrome, which means the
admin console never inherits the shop header and sign-in never inherits the
cart.

**Server Components are the default.** `"use client"` appears only where
client state is genuinely required. In the whole storefront shell that is one
file: the mobile navigation drawer.

**Layers run in one direction.** A route file composes and passes data down.
Business logic lives in features, data access lives in services, and
presentation components stay free of both.

```
app/  ->  features/  ->  lib/services/  ->  database
                    \->  lib/validations/

components/ui/ is imported by everything and imports nothing but lib/utils
```

**Design tokens live in one file.** Every colour, font, radius, shadow and the
page width are declared in `src/app/globals.css` and consumed through semantic
Tailwind utilities: `bg-canvas`, `bg-surface`, `text-ink`, `text-ink-muted`,
`border-line`, `bg-brand`, `text-on-brand`. Components never carry raw hex
values, so the palette can be retuned in one place.

**Repeated patterns are components, not long class strings.** `Button`,
`Input`, `Card`, `Badge`, `Container`, `Section`, `Heading` and `Text` carry
the shared styles. Variants are declared with `class-variance-authority`, and
`cn()` lets a caller override any class without fighting specificity.

**Navigation is configuration.** `src/config/navigation.ts` holds the
structural routes. Statically typed routes are enabled, so a nav entry
pointing at a route that does not exist fails the typecheck rather than
shipping a dead link. Product categories are not in this file: they will be
read from the database.

**Nothing is faked.** Controls that are designed but not yet wired up render
with `aria-disabled` and an explanatory accessible name. There is no sample
product data, no placeholder cart count and no non-functional form that looks
functional.

**The database is reachable from exactly one module.** `src/lib/db/client.ts`
holds the only Prisma Client and starts with `import "server-only"`, so if any
client component reaches it, even through a long import chain, the build fails
and names the chain. Prisma 7 has no bundled query engine, so the connection
goes through the `@prisma/adapter-pg` driver adapter, which speaks plain
PostgreSQL and therefore works against Neon in production and any PostgreSQL
instance locally.

**Queries flow one way.**

```
Server Component / Server Action / Route Handler
  ->  feature or service module
  ->  prisma  (src/lib/db/client.ts)
  ->  Neon pooled endpoint
```

A client component never imports the database. It receives data as props or
calls a Server Action. Full reasoning, conventions and workflows are in
[docs/database/README.md](docs/database/README.md).

**The schema grows one feature at a time.** Phase 2 models a `User` and a
`Role` enum and nothing else. A twenty-table ecommerce schema written before
the features exist would be guessing, and every wrong guess becomes a migration
against live data. Product categories will be database rows, never values
hardcoded in the application.

**Signing in is a phone number and a one-time code.** There are no passwords
anywhere in the system. A code is hashed with a keyed HMAC before storage, is
valid for five minutes, allows five wrong guesses, and cannot be replayed once
used. Every rate limit is counted in the database rather than in memory,
because on Vercel each request may reach a different instance.

**Sessions are database rows.** The browser holds an opaque random token and
the database stores only its digest, so logging out or revoking an account
takes effect on the very next request. The cookie carries no claims at all:
nothing in it can be read or altered to gain authority.

**Authorisation runs on the server, in four layers.** `proxy.ts` turns away
requests to `/admin` with no session cookie, but it is an optimistic filter
that never reads the database and is never the boundary. The admin layout and
the admin page each call `requireAdmin()`, which resolves the session and
enforces the role. Hiding the admin link is cosmetic. Roles are never read from
a request, so no form, URL or cookie can grant `ADMIN`; only the seed can.

Full reasoning, the OTP lifecycle and the residual risks are in
[docs/authentication/README.md](docs/authentication/README.md).

**The storefront is server-rendered, and its data is not real yet.** The home
page, the listing, the product page, the cards and the footer are all Server
Components. Client components exist only where something needs state: the
drawers, the search panel, the filter controls and the product selectors. No
page or layout is a client component.

Filters and sorting live in the **URL**, not in component state, so a filtered
listing is shareable, survives back, and can be rendered on the server. Phase 5
feeds the same parsed query to a database call instead of to an array.

**No component imports a Prisma type.** Cards, grids and selectors take
presentation types from `src/types/commerce.ts`, so the catalogue can be
modelled however it needs to be without touching the interface.

Where a feature is not built, its control stays in place and says so. There is
no fake cart count, no invented search results and no button that appears to
save something. Full reasoning is in
[docs/storefront/README.md](docs/storefront/README.md).

### Accessibility

Semantic landmarks throughout, one top-level heading per page with heading
order preserved, a skip link as the first focusable element in the store
shell, a single global focus-visible treatment, accessible names on every
icon-only control, and reduced-motion preferences respected. Text and
interactive colours were chosen to clear WCAG AA against their backgrounds.

### Responsive design

Mobile-first, with one shared gutter from the `Container` component. The
navigation is a drawer below the `md` breakpoint and an inline menu above it.
Layouts are composed to reflow rather than to shrink.

## Phase 5 — product and category catalogue

The storefront was built in Phase 4 against a mock layer. Phase 5 replaced that
layer with PostgreSQL and changed almost nothing above it: the components, the
design tokens and the URL contract are the ones that were already verified.

Full detail is in [docs/catalog/README.md](docs/catalog/README.md). The short
version:

**Real models.** `Category`, `Product`, `ProductCategory`, `Size`, `Color`,
`ProductVariant`, `Inventory` and `ProductImage`, plus enums for product status,
fabric, pattern, fit and occasion. One migration,
`20260916120000_add_catalog_domain`.

**Variants, not text columns.** Every sellable combination of product, colour
and size is a row with its own SKU and its own stock, and a unique constraint
makes a duplicate "pink, M" impossible. The product page offers exactly the
sizes the selected colour is cut in, and disables the rest.

**Colour-specific photography.** `ProductImage.colorId` is nullable: an image
belongs to one colour, or to all of them. Selecting a swatch switches the
gallery to that colour's photographs immediately, without a page load, while
the rest of the page stays server-rendered.

**Categories are rows.** The header, the mobile drawer, the footer links, the
home tiles and the category filter all follow the table. A product has one
primary category for its card and breadcrumb, and any number of memberships, so
a printed cotton dress can be in Cotton Dresses and Fresh Prints at once.

**Search, filtering, sorting and paging happen in PostgreSQL.** Search covers
names, descriptions, article numbers, collection names and colour names. Filter
groups are ANDed and values inside a group are ORed; size and colour are
matched against the same variant, so "pink in M" means a variant that is both.
Facet counts are database aggregations that exclude their own group, so
choosing a colour still shows the others. Paging is `LIMIT`/`OFFSET` with a
stable tiebreak, never a full read sliced in memory.

**Money is integer paise.** `₹1,299` is `129900`. No floats, no decimals, no
strings — see [Money](docs/catalog/README.md#money). A product is on sale when
`compareAtPrice` exists and is greater than `price`; the percentage is derived,
never stored.

**Seeded with 26 products.** Twenty-four live — exactly two pages — plus one
draft and one archived, so "unpublished work is not public" is something the
checks prove. Also five categories and one disabled one, six sizes and eight
colours. Running the seed twice changes nothing.

**Still to come:** admin catalogue management, inventory workflows, cart and
wishlist persistence, orders, and real photography. The schema is shaped so
none of them needs a redesign.

## Phase 6 — admin catalogue management

The catalogue was real in Phase 5 but was edited by rewriting the seed. Phase 6
built the screens that manage it.

Full detail is in
[docs/admin-catalog/README.md](docs/admin-catalog/README.md). The short version:

**Seven admin routes.** A dashboard of real catalogue counts, a product list
with server-side search, filtering, sorting and paging, create and edit screens
for products and collections, and variant, stock and photography management on
the product edit page.

**Authorisation is at the endpoint.** Every Server Action calls
`requireAdminActor()` before it reads anything, because a form is markup and the
request behind it can be sent without ever loading the page. `pnpm check:admin`
reads every action module and fails if one is missing the guard, so it cannot be
forgotten when a new action is added. Pages and the layout check too; the proxy
is an optimistic filter and not a boundary.

**One catalogue, two paths.** The storefront's read services still refuse to
return anything that is not `ACTIVE`; a separate set of admin services edits
exactly those. Keeping them in different modules is what stops the public
storefront being one boolean away from showing unpublished work.

**Nothing is deleted.** Products archive, collections and variants switch off,
and all of it stays referenceable by the orders that do not exist yet. The one
real delete is a photograph, which nothing will ever reference.

**Money stays exact.** The admin types rupees and the database stores paise, and
the conversion is integer arithmetic — `Number("12.10") * 100` is
`1209.9999999999998`, and the checks cover that case specifically.

**Image URLs, not uploads.** Addresses on an allowlisted host, shared between
`next.config.ts` and the validation schema, so a host the shop cannot render is
refused in the form rather than breaking a product page. Only `https` is
accepted, which rules out `javascript:` and `data:` by allowing one scheme
rather than blocking many.

**Stale writes are refused.** Product and category saves are pinned to the
version the form was rendered from, so a second administrator is told to reload
instead of silently reverting the first one's work — including fields their form
never showed.

**One migration**, `20260916180000_catalog_check_constraints`: four CHECK
constraints for non-negative stock, non-negative prices, and a compare-at price
that is genuinely higher than the price. No new models or columns.

**The dashboard has no revenue on it.** There are no orders, so there is no
figure that could be real, and the page says so.

**Still to come:** colour and size screens, stock movements, an audit log, image
uploads, and everything downstream of an order.

## What is not built yet

Deliberately absent, each arriving in the phase that needs it:

- SMS delivery. Codes are written to the server log in development, and that
  transport refuses to run in production
- A customer account area. Signing in works; there is no profile or order
  history to show yet
- **Colour and size management.** Variants are built from the existing palette
  and size run; adding a new colour is still a seed change
  - **An audit log.** `updatedAt` records when something changed, never who
- **Inventory workflows.** Stock can be corrected from the admin area; there
  are no adjustments with reasons, reservations, stock takes or returns
- **Real product photography.** Development placeholders come from Unsplash,
  declared in `prisma/catalog/data.ts` and `src/config/media.ts`. No component
  contains a URL
- **Wishlist and bag persistence.** Both have their UI and both say they are
  not connected
- **Newsletter sending.** The form is built and disabled
- **Sales analytics.** There are no orders, so nothing knows what has sold.
  `bestSeller` is a merchandising flag an operator sets, and is never presented
  as a ranking
- Cart, wishlist, checkout, orders, payments
- Coupons, reviews, shipping and email providers
- Image upload and media storage
- A size guide. `Size` carries measurements; nothing renders them
- Dark theme

The database models for all of the above are also absent on purpose. See
[what is deliberately not modelled yet](docs/database/README.md#what-is-deliberately-not-modelled-yet).

## Roadmap

| Phase | Scope                                                        |
| ----- | ------------------------------------------------------------ |
| 1     | Foundation, architecture, design system — **done**           |
| 2     | Database foundation: PostgreSQL, Neon, Prisma — **done**     |
| 3     | Phone-number authentication with one-time codes — **done**   |
| 4     | Storefront UI and commerce component system — **done**       |
| 5     | Product, category and variant catalogue behind that UI — **done** |
| 6     | Admin console: catalogue management — **done**                |
| 7     | Bag and wishlist persistence                                 |
| 8     | Checkout, payments and orders                                |
| 9     | Inventory workflows, coupons, reviews, image uploads         |

Each phase adds the database models its feature needs, through a migration.
