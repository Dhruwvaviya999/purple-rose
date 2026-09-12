# Purple Rose

An ecommerce storefront for **Purple Rose**, a women's fashion label.

The application is built as a single Next.js project: the storefront, the
customer account area, the admin console and the backend all live here. There
is no separate API service.

> **Current phase: Phase 1 — foundation, architecture and design system.**
> The routing boundaries, design tokens, UI primitives and store shell are in
> place. No commerce functionality is implemented yet. See
> [What Phase 1 does not include](#what-phase-1-does-not-include).

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
| Package manager | pnpm                                         |
| Hosting target  | Vercel                                       |

Planned for later phases: PostgreSQL on Neon with Prisma, and phone-number
sign-in with one-time codes.

There is no Docker in this project. It runs directly on Node.js with pnpm.

## Requirements

- Node.js 20.9 or newer
- pnpm 10 or newer

## Installation

```bash
pnpm install
```

## Development commands

```bash
pnpm dev     # start the dev server on http://localhost:3000
pnpm build   # production build (typechecks as part of the build)
pnpm start   # serve the production build, after pnpm build
pnpm lint    # ESLint
```

## Environment setup

Phase 1 runs with no configuration. Every value has a safe default and no
external service is contacted.

```bash
cp .env.example .env.local
```

`.env.example` documents the variables that later phases will need, grouped by
the phase that activates them. They are commented out, so a missing value
never looks like a bug.

Two rules hold for the whole project:

- Only values that are safe in a browser carry the `NEXT_PUBLIC_` prefix.
  Secrets never do.
- `.env*` files are ignored by git. `.env.example` is the one exception and
  must never contain a real credential.

## Routes

| Route         | Purpose                                         |
| ------------- | ----------------------------------------------- |
| `/`           | Storefront home — brand shell                   |
| `/shop`       | Catalogue — empty until products exist          |
| `/login`      | Sign-in placeholder, outside the store chrome   |
| `/admin`      | Admin overview, never indexed                   |
| `/api/health` | Liveness probe                                  |
| `/robots.txt` | Crawl rules, generated from `src/app/robots.ts` |

## Folder structure

```
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
│   ├── api/health/route.ts    route handlers
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
├── lib/
│   ├── utils/                framework-agnostic helpers
│   ├── services/             the only layer that touches the database
│   ├── validations/          input schemas, reused by forms and actions
│   └── env.ts                typed, browser-safe environment access
│
├── config/                   app constants: brand, navigation
├── hooks/                    reusable client-side hooks
└── types/                    shared types
```

`features/`, `actions/`, `lib/services/` and `lib/validations/` are empty in
Phase 1. Each holds a README that states the rules for what goes in it, so the
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

## What Phase 1 does not include

Deliberately absent, each arriving in a later phase:

- Database, Prisma and Neon; no PostgreSQL schema
- Authentication, one-time codes, sessions, user accounts
- Products, categories, inventory, product CRUD
- Cart, wishlist, checkout, orders, payments
- Coupons, reviews, shipping and email providers
- Image upload and media storage
- Real admin functionality
- Per-product and per-category SEO, sitemap
- Dark theme

## Roadmap

| Phase | Scope                                                    |
| ----- | -------------------------------------------------------- |
| 1     | Foundation, architecture, design system — **done**       |
| 2     | PostgreSQL, Prisma and Neon; product and category schema |
| 3     | Catalogue: listings, filtering, product detail pages     |
| 4     | Phone-number authentication with one-time codes          |
| 5     | Cart and wishlist                                        |
| 6     | Checkout, payments and orders                            |
| 7     | Admin console: catalogue, inventory and order management |
| 8     | Coupons, reviews, full SEO and performance work          |
