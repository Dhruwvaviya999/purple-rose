# Purple Rose database architecture

How the Purple Rose database is put together, and why. This covers decisions
specific to this store. For general Prisma usage, read the Prisma docs.

Phase 2 established this foundation. It holds one enum and one table. That is
deliberate, and the reasoning is in
[What is deliberately not modelled yet](#what-is-deliberately-not-modelled-yet).

---

## The choices

**PostgreSQL.** An order is money. It needs real transactions, foreign keys
that the database itself enforces, and constraints that hold no matter which
process writes. PostgreSQL also gives us enums, partial and composite indexes,
`numeric` for prices without floating point drift, and `jsonb` for the
occasional semi-structured field. Nothing about a fashion catalogue pushes us
toward a document store: products, variants, stock and orders are relational.

**Neon.** The application is serverless on Vercel, and serverless is hostile
to a classic connection-per-instance database. Neon answers that directly with
a built-in connection pooler, so we get pooling without running PgBouncer or
adding a paid proxy in front. Two other properties matter to us. Branching
gives every developer and every preview deployment a real database copied from
production structure, which is what replaces a local Docker container here.
Scale-to-zero means a dev branch costs nothing while nobody is using it.

**Prisma.** The schema is the single written description of our data, and
migrations are generated from it and committed, so the database shape is
reviewable in a pull request. The generated client gives us types that follow
the schema automatically, which means a column rename surfaces as a TypeScript
error rather than a runtime failure. Prisma Studio covers local inspection so
we do not build an internal database viewer.

**No Docker.** There is no container in this repository and there will not be
one. Local development connects to a Neon branch over the network. That keeps
one database engine, one version and one set of behaviours across local,
preview and production, and removes an entire class of "works on my machine".

---

## Versions

| Package              | Version | Why it is here                              |
| -------------------- | ------- | ------------------------------------------- |
| `prisma`             | 7.10.0  | CLI: migrations, generation, studio, seed   |
| `@prisma/client`     | 7.10.0  | Runtime client                              |
| `@prisma/adapter-pg` | 7.10.0  | Required driver adapter, speaks PostgreSQL  |
| `dotenv`             | 17      | Prisma 7 does not load `.env` files itself  |
| `tsx`                | 4       | Runs the TypeScript seed script             |

Prisma 7 is the current stable line. At the time of writing, npm's `latest`
tag for the `prisma` package points at an `8.0.0` release candidate while
`@prisma/client` still resolves to 7, so the two packages are pinned to the
`7` major on purpose. Do not run `pnpm add prisma@latest` without checking
what that tag resolves to.

### Three things Prisma 7 changed that will trip you up

1. **Connection URLs are not in `schema.prisma`.** They live in
   `prisma7.config.ts` at the repository root. Note the filename: this CLI
   version looks for `prisma7.config.ts`, not `prisma.config.ts`.
2. **A driver adapter is mandatory.** There is no bundled query engine any
   more, so `new PrismaClient()` on its own cannot connect. It needs
   `{ adapter }`.
3. **Migrating no longer regenerates the client.** After any schema change,
   run `pnpm db:generate`. `pnpm build` does it for you.

---

## Connection architecture

```
Server Component / Server Action / Route Handler
        │
        ▼
feature or service module          src/features/*, src/lib/services/*
        │
        ▼
prisma                             src/lib/db/client.ts   (server-only)
        │
        ▼
@prisma/adapter-pg                 PostgreSQL wire protocol
        │
        ▼
Neon pooled endpoint  ──────────►  PostgreSQL
```

### Two URLs, two jobs

| Variable       | Endpoint             | Used by                        | Required |
| -------------- | -------------------- | ------------------------------ | -------- |
| `DATABASE_URL` | pooled, `-pooler`    | the application at runtime     | yes      |
| `DIRECT_URL`   | direct, no `-pooler` | the Prisma CLI, schema changes | no       |

Runtime queries go through the pooler because serverless functions open and
discard connections constantly, and the pooler is what absorbs that.

Schema changes do not go through the pooler. The migration engine holds a
session open, runs DDL, and may create and drop a shadow database. A
transaction pooler cannot carry any of that. Point `DIRECT_URL` at Neon's
direct endpoint and the CLI will use it.

`DIRECT_URL` is optional. When it is absent Prisma falls back to
`DATABASE_URL`, which is the right behaviour for a database with a single
endpoint. Nothing else is invented: these are the only two connection
variables, and both are read.

### Why `@prisma/adapter-pg` and not `@prisma/adapter-neon`

Prisma ships a Neon-specific adapter built on Neon's serverless driver. We use
the plain PostgreSQL adapter instead, for three reasons.

- It speaks the standard PostgreSQL protocol, so the same code path serves
  Neon in production and any PostgreSQL instance a developer points at.
  Nothing in the application is coupled to one hosting provider.
- Server Components, Server Actions and Route Handlers run on Vercel's Node.js
  runtime, which supports TCP. The Neon driver's advantage is the Edge runtime,
  and we do not use it.
- Neon's pooled endpoint already provides connection management, so the
  serverless benefit the Neon driver exists to deliver is already covered.

If a future feature genuinely needs the Edge runtime, switching is confined to
`src/lib/db/client.ts`: install `@prisma/adapter-neon` and swap the adapter.

### Pool settings

`src/lib/db/client.ts` keeps each instance's pool small (`max: 5`) and drops
idle sockets after ten seconds. Many function instances may be warm at once, so
a large per-instance pool multiplies into far more connections than it looks
like. Neon's pooler is the thing that should be absorbing concurrency, not our
process.

---

## Server-only boundary

`src/lib/db/client.ts` starts with `import "server-only"`. Next.js implements
that import at the compiler level, so if any client component ever reaches the
database module, even through a long import chain, **the build fails** and
names the chain. This is enforced, not a convention. It has been verified by
deliberately importing the client into a client component and confirming the
build refuses.

Environment access follows the same split:

| Module                 | Holds                          | Safe in a browser bundle |
| ---------------------- | ------------------------------ | ------------------------ |
| `src/lib/env.ts`       | `NEXT_PUBLIC_APP_URL`, mode    | yes                      |
| `src/lib/env.server.ts` | `DATABASE_URL`, `DIRECT_URL`  | no, `server-only`        |

They are two files rather than one because `env.ts` is imported by shared
configuration that client components can pull in. Putting a secret's name in
that module would be a leak waiting to happen. `env.server.ts` validates
lazily, inside a function, so importing it never throws and a caller can
report a missing variable as an operational problem.

Nothing logs a connection string. The error raised for a missing variable
names the variable only.

---

## Data access conventions

Where a future query belongs:

- **Route files stay thin.** A page, layout or route handler composes UI and
  calls into a feature or service. It does not build queries.
- **`src/lib/services/`** is the only layer that talks to Prisma. A service
  returns plain serialisable objects, never a Prisma model instance or a query
  builder, so the persistence layer stays replaceable.
- **`src/features/<feature>/`** holds capability-specific read and write paths
  and may call services.
- **`src/actions/`** holds Server Actions. An action validates its input with a
  schema from `src/lib/validations/`, checks authorisation itself, orchestrates
  services, and revalidates affected paths. It does not query directly.
- **Client components never import the database.** They receive data as props
  or call a Server Action.

Use Prisma's generated types rather than hand-writing model interfaces. Import
them from the generated client:

```ts
import type { User } from "@/generated/prisma/models/User";
import { Role } from "@/generated/prisma/enums";
```

No repository layer, no generic base classes, no empty service files. Those
arrive with the features that need them.

---

## Conventions

### Naming

- Models are singular PascalCase: `User`, and later `Product`, `OrderItem`.
- Fields are camelCase: `phoneNumber`, `createdAt`.
- Column names are left as Prisma generates them, which means the database
  columns are camelCase too. We do not map to snake_case. One convention
  across schema, client and SQL is worth more than matching PostgreSQL
  tradition, and raw SQL simply quotes the identifiers.
- Enum values are SCREAMING_SNAKE_CASE: `CUSTOMER`, `ADMIN`.
- Names say what the thing is. No `data`, `info`, `value` or `type` as a
  field name unless that genuinely is the concept.
- Relation fields are named for the other side (`user`, `orderItems`), and
  explicit relation names are used wherever a model would otherwise have two
  ambiguous links to the same table.

### IDs

Primary keys are **UUIDv7**, declared as `@default(uuid(7)) @db.Uuid`.

The candidates and why v7 won:

| Option        | Problem for us                                                  |
| ------------- | --------------------------------------------------------------- |
| `autoincrement` | Leaks volume: `/orders/1041` tells a customer how many orders the store has ever had. Also awkward once writes come from more than one place. |
| UUIDv4        | Random, so every insert lands in a random spot in the primary key index. The index fragments and write performance degrades as tables grow. |
| CUID2         | Fine identifiers, but stored as `text`, not a native type, and not sortable. |
| **UUIDv7**    | **Chosen.** Time-ordered, so inserts append and the index stays compact. Stored in PostgreSQL's native 16-byte `uuid` type. Generated in the application, so no round trip and no ID gap on a rolled-back transaction. Standard, not Prisma-specific. |

The one trade-off: a v7 ID embeds its creation time, so it is not a secret. We
do not treat IDs as secrets anywhere.

### Timestamps

Every foundational record carries `createdAt` and `updatedAt`, typed
`@db.Timestamptz(3)` so instants are stored with a time zone at millisecond
precision.

Both columns get `DEFAULT CURRENT_TIMESTAMP` in the migration, so an insert
never depends on the client sending a time. `updatedAt` additionally carries
Prisma's `@updatedAt`, which means Prisma writes it on update. Be aware that
this part is application-level: a raw `UPDATE` issued outside Prisma will not
touch it. If we ever need that guarantee at the database level, it becomes a
trigger added through a migration.

### Constraints

Integrity is enforced by the database, not only by application checks.

- `Role` is a real PostgreSQL enum type, so an unknown role cannot be written.
- `phoneNumber` has a unique index, so two accounts cannot claim one number
  even under a race between concurrent signups.
- Required fields are `NOT NULL`; `name` is deliberately nullable.
- Lengths are bounded: `VARCHAR(16)` for an E.164 number, `VARCHAR(120)` for
  a display name.
- Foreign keys will be declared on every relation as models arrive.

Phone number *format* is not a database `CHECK` constraint. Prisma cannot
express one, so it would have to be hand-written SQL that the schema does not
know about, which then shows up as drift. Normalisation to E.164 belongs in
`src/lib/validations/` in the authentication phase, in front of every write.

---

## Current schema

The whole schema is `prisma/schema.prisma`. It is short enough to read in full;
this section explains the intent.

### `enum Role`

| Value      | Meaning                                          |
| ---------- | ------------------------------------------------ |
| `CUSTOMER` | Default. Shops, and later owns a cart and orders |
| `ADMIN`    | Reaches `/admin` and manages the store           |

Two values because two is what the application actually distinguishes today.
A native enum keeps the database authoritative. Extending it later is an
additive migration. More granular admin permissions, if they are ever needed,
should be a separate permissions concept rather than a longer role list.

### `model User`

| Field         | Type       | Constraints                              | Why it exists |
| ------------- | ---------- | ---------------------------------------- | ------------- |
| `id`          | `String`   | PK, `uuid(7)`, `@db.Uuid`                | Stable internal identity |
| `phoneNumber` | `String`   | **unique**, `VARCHAR(16)`, not null      | The account identifier. Sign-in is phone plus a one-time code, so this is what a person is looked up by. E.164 is at most 15 digits plus `+` |
| `name`        | `String?`  | `VARCHAR(120)`, nullable                 | Display name. Nullable because a phone-first signup has no name at the moment the account is created |
| `role`        | `Role`     | not null, default `CUSTOMER`             | Authorisation input. Defaulted so a new signup is a customer without the application deciding |
| `createdAt`   | `DateTime` | not null, `DEFAULT CURRENT_TIMESTAMP`    | Cohort and support questions |
| `updatedAt`   | `DateTime` | not null, default now, Prisma `@updatedAt` | Change tracking |

No relations yet, because there is nothing to relate to.

**Why `User` exists now and nothing else does.** The next phase implements
phone number plus one-time-code authentication, and it needs somewhere to put
an account. The shape of that account is also the least speculative thing in
the whole system: a person has a phone number and a role. Committing to it now
costs nothing and unblocks the next phase.

**What is not on this table, and why.**

- *No password column.* Authentication is phone and one-time code. There is no
  password to store, so storing one would be dead weight and a liability.
- *No one-time-code columns.* A code is short-lived verification state with its
  own lifecycle: issued, attempted a few times, expired, discarded. It needs
  its own model with an expiry, an attempt counter and its own cleanup. Putting
  it on `User` would widen a long-lived row with data that churns every login
  and make rate limiting awkward.
- *No `emailVerified`, `image`, `sessions` or `accounts`.* Those come from
  third-party auth library schemas. We are not using one yet, and copying its
  tables before choosing it would be guessing.

---

## What is deliberately not modelled yet

Not modelled: `Product`, `ProductVariant`, `ProductImage`, `Category`,
`Inventory`, `Cart`, `CartItem`, `Wishlist`, `Order`, `OrderItem`, `Address`,
`Payment`, `Shipment`, `Coupon`, `Review`, and the one-time-code model.

This is a decision, not an omission. A twenty-table ecommerce schema written
before any of those features exist would be guessing at the questions that
actually decide the design:

- Does a size run as a variant of a product, or does the product carry a size
  set? That depends on how stock is counted and how the catalogue is edited.
- Is a cart a database row or a cookie until checkout? That depends on whether
  guests can shop, which is a product decision nobody has made.
- Does an order copy the product name and price at purchase time? It has to,
  for receipts and refunds, but exactly which fields get copied depends on the
  invoice we end up sending.

Every wrong guess becomes a migration against live data. Each phase adds the
models its feature needs, through a migration, with the feature's requirements
actually known. The categories the brand will sell, such as cotton dresses and
co-ord sets, are database rows in a future `Category` table, never values
hardcoded in the application.

---

## Workflows

All commands are pnpm. Run them from the repository root.

### First-time setup

1. Create a Neon project at [neon.tech](https://neon.tech). A free project is
   enough for development.
2. From the Neon dashboard, copy the **pooled** connection string. Its host
   contains `-pooler`.
3. Configure your local environment:

   ```bash
   cp .env.example .env.local
   ```

   Set `DATABASE_URL` to the pooled string. Optionally set `DIRECT_URL` to the
   direct string, the same host without `-pooler`.

4. Install dependencies and apply the schema:

   ```bash
   pnpm install
   pnpm db:migrate
   ```

5. Check the connection:

   ```bash
   pnpm dev
   curl http://localhost:3000/api/health
   ```

   A reachable database returns HTTP 200 and `"database": "ok"`.

`.env.local` is git-ignored. Never commit a real connection string.

### Changing the schema

```bash
# 1. Edit prisma/schema.prisma
# 2. Create and apply a migration, and name it after the change
pnpm db:migrate
# 3. Refresh the generated client (Prisma 7 does not do this for you)
pnpm db:generate
```

Prisma writes the SQL to `prisma/migrations/<timestamp>_<name>/migration.sql`.
**Read that file before committing it.** Review both the schema change and its
SQL in the pull request. Never edit a migration that has already been applied
anywhere other than your own branch; write a new one instead.

Do not use `prisma db push` on this project. It changes a database without
leaving a migration behind, and the migration history is how we know what
production looks like and how preview and production databases stay
reproducible.

Never change the database by hand. If the change belongs in the schema, it
belongs in a migration.

### Applying migrations elsewhere

```bash
pnpm db:migrate:deploy   # applies pending migrations, creates none
pnpm db:migrate:status   # shows what is applied and what is pending
```

`db:migrate:deploy` is the command for preview and production. It only applies
what is already committed.

`db:migrate` wraps `prisma migrate dev`, which is a development command: it can
create migrations and, when history has diverged, offer to reset the database.
Point it only at a database you are willing to lose.

### Seeding

```bash
pnpm db:seed
```

The seed lives in `prisma/seed.ts` and is wired through the `migrations.seed`
entry in `prisma7.config.ts`. Prisma 7 does not run it automatically after a
migration, so run it when you want it.

It is idempotent. Every write is an `upsert` keyed on a natural unique column,
so running it ten times leaves the same rows as running it once.

What it does:

- Promotes one phone number to `ADMIN`, read from `SEED_ADMIN_PHONE_NUMBER`.
  When that variable is unset the step is skipped and says so. No phone number
  is invented, and no credential is created, because there is no password to
  create: the admin still signs in with a one-time code once authentication
  exists.
- Reports the resulting user count.

There is no sample catalogue and no fake customers. Seeding products before the
catalogue exists would put data in the database that the application has no
way to render or manage.

The seed script builds its own Prisma Client rather than importing
`src/lib/db/client.ts`. That module is `server-only` for the Next.js compiler
and holds a request-scoped singleton; a CLI script runs outside Next and should
open and close its own connection.

### Inspecting data

```bash
pnpm db:studio
```

Prisma Studio opens on <http://localhost:5555> and reads `DATABASE_URL` from
`prisma7.config.ts`. It is a local developer tool with full read and write
access to whatever it is pointed at. Do not expose it, and do not point it at
production casually. It is also the reason we are not building an admin
database browser.

---

## Environments

Neon branching gives each environment its own database without another
container or another provider.

| Environment | Database                          | Migrations applied by       |
| ----------- | --------------------------------- | --------------------------- |
| Local       | a personal Neon branch            | you, `pnpm db:migrate`      |
| Preview     | a branch per pull request         | `pnpm db:migrate:deploy`    |
| Production  | the primary branch                | `pnpm db:migrate:deploy`    |

Phase 2 does not require separate databases: one development branch is enough
to work. Splitting them matters as soon as there is data worth not destroying,
and the split is a Neon dashboard action plus a different `DATABASE_URL` in
Vercel, not a code change.

### Production notes

- Set `DATABASE_URL` in Vercel's environment variables, scoped per
  environment. It is a secret. It is never prefixed `NEXT_PUBLIC_`.
- Use the pooled endpoint in Vercel. Serverless concurrency without a pooler
  exhausts connection limits.
- Run migrations as a deliberate step, not as part of serving traffic. A
  migration that runs on cold start races with itself across instances.
- `prisma generate` runs both on install and at the start of `pnpm build`, so a
  deployment cannot fail because the client was never generated. Generation
  does not need a database connection, so builds work without `DATABASE_URL`
  present at build time.
- The generated client is git-ignored. It is a build artifact. The schema and
  the migrations are committed.
- Neon's free tier scales a branch to zero when idle, so the first query after
  a quiet period pays a cold start. Worth knowing before reading it as an
  application performance problem.

---

## Health endpoint

`GET /api/health` reports process health and database reachability.

```json
{
  "status": "ok",
  "service": "Purple Rose",
  "timestamp": "2026-09-13T00:00:00.000Z",
  "database": "ok"
}
```

| Database state | HTTP | `status`     | `database`      |
| -------------- | ---- | ------------ | --------------- |
| Reachable      | 200  | `ok`         | `ok`            |
| Not reachable  | 503  | `degraded`   | `unavailable`   |

The check is a single `SELECT 1`, which is the cheapest round trip that proves
the connection actually works rather than that a pool object exists.

The response never contains a connection string, a driver name, the SQL that
ran, or a stack trace. The real reason is written to the server log, where
operators can read it and users cannot. The database module is imported inside
the handler rather than at module scope, so a configuration problem such as an
unset `DATABASE_URL` is reported as an unhealthy dependency instead of
crashing the route.
