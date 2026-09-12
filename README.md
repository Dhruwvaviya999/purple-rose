# Purple Rose

An ecommerce storefront for **Purple Rose**, a women's fashion label.

The application is built as a single Next.js project: the storefront, the
customer account area, the admin console and the backend all live here. There
is no separate API service.

> **Current phase: Phase 2 — database foundation.** Complete.
>
> - **Phase 1** built the project foundation: routing boundaries, design
>   tokens, UI primitives and the store shell.
> - **Phase 2** added the database foundation: PostgreSQL on Neon through
>   Prisma, one migration, seed infrastructure and a server-only data layer.
>
> No commerce functionality is implemented yet. See
> [What is not built yet](#what-is-not-built-yet).

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
| Package manager | pnpm                                         |
| Hosting target  | Vercel                                       |

Planned for later phases: phone-number sign-in with one-time codes, then the
catalogue and the rest of the store.

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
# set DATABASE_URL in .env.local, then:
pnpm db:migrate
```

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

## Environment setup

```bash
cp .env.example .env.local
```

One variable is required:

| Variable       | Required | Purpose                                        |
| -------------- | -------- | ---------------------------------------------- |
| `DATABASE_URL` | yes      | Neon **pooled** connection string, used at runtime |
| `DIRECT_URL`   | no       | Neon **direct** connection string, used by the Prisma CLI for schema changes |
| `NEXT_PUBLIC_APP_URL` | no | Canonical origin; defaults to `http://localhost:3000` |
| `SEED_ADMIN_PHONE_NUMBER` | no | E.164 number the seed promotes to `ADMIN` |

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

| Route         | Purpose                                         |
| ------------- | ----------------------------------------------- |
| `/`           | Storefront home — brand shell                   |
| `/shop`       | Catalogue — empty until products exist          |
| `/login`      | Sign-in placeholder, outside the store chrome   |
| `/admin`      | Admin overview, never indexed                   |
| `/api/health` | Liveness and database reachability probe        |
| `/robots.txt` | Crawl rules, generated from `src/app/robots.ts` |

## Folder structure

```
prisma/
├── schema.prisma             models and enums — the written shape of the data
├── migrations/               committed SQL history; reviewed in pull requests
└── seed.ts                   idempotent seed, no sample catalogue

prisma7.config.ts             Prisma 7 CLI config: URLs, migration path, seed
docs/database/README.md       database architecture, decisions and workflows

src/
├── app/                      routing only — thin files that compose features
│   ├── (store)/              storefront group: header + footer chrome
│   │   ├── layout.tsx        store shell, skip link
│   │   ├── page.tsx          /
│   │   └── shop/page.tsx     /shop
│   ├── (auth)/               sign-in group: focused, chrome-light
│   │   ├── layout.tsx
│   │   └── login/page.tsx    /login
│   ├── admin/                admin area: own chrome, never indexed
│   │   ├── layout.tsx
│   │   └── page.tsx          /admin
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
│   ├── layout/               header, footer, navigation
│   └── shared/               cross-feature pieces (icons, empty states)
│
├── features/                 one folder per business capability (see README)
├── actions/                  Server Actions — the write path (see README)
│
├── generated/prisma/         Prisma Client — generated on install, git-ignored
│
├── lib/
│   ├── db/client.ts          the single Prisma Client (server-only)
│   ├── utils/                framework-agnostic helpers
│   ├── services/             the only layer that queries the database
│   ├── validations/          input schemas, reused by forms and actions
│   ├── env.ts                browser-safe environment access
│   └── env.server.ts         server-only environment access (server-only)
│
├── config/                   app constants: brand, navigation
├── hooks/                    reusable client-side hooks
└── types/                    shared types
```

`features/`, `actions/`, `lib/services/` and `lib/validations/` are still
empty. Each holds a README that states the rules for what goes in it, so the
conventions are fixed before the first feature is written.

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

## What is not built yet

Deliberately absent, each arriving in the phase that needs it:

- Authentication: one-time codes, sessions, sign-in. The `User` table exists;
  nothing writes to it yet
- Products, categories, inventory, product management
- Cart, wishlist, checkout, orders, payments
- Coupons, reviews, shipping and email providers
- Image upload and media storage
- Real admin functionality
- Per-product and per-category SEO, sitemap
- Dark theme

The database models for all of the above are also absent on purpose. See
[what is deliberately not modelled yet](docs/database/README.md#what-is-deliberately-not-modelled-yet).

## Roadmap

| Phase | Scope                                                        |
| ----- | ------------------------------------------------------------ |
| 1     | Foundation, architecture, design system — **done**           |
| 2     | Database foundation: PostgreSQL, Neon, Prisma — **done**     |
| 3     | Phone-number authentication with one-time codes              |
| 4     | Catalogue schema, listings, filtering, product detail pages  |
| 5     | Cart and wishlist                                            |
| 6     | Checkout, payments and orders                                |
| 7     | Admin console: catalogue, inventory and order management     |
| 8     | Coupons, reviews, full SEO and performance work              |

Each phase adds the database models its feature needs, through a migration.
