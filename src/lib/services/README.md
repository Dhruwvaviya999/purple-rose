# Services

The only layer that talks to the database or to third-party providers.
Everything above it (Server Actions, Route Handlers, Server Components)
consumes services and never issues queries itself.

Rules:

- Server-only. A service must never be imported into a client component.
- A service returns plain, serialisable domain objects, not ORM models or
  query builders, so the persistence layer stays replaceable.
- One file per domain area, for example `product-service.ts`,
  `inventory-service.ts`, `order-service.ts`.
- No React, no request-scoped globals, no formatting. Presentation concerns
  belong to components.

The Prisma Client lives in `src/lib/db/client.ts`, not here. Import it:

```ts
import { prisma } from "@/lib/db/client";
```

## What is here

| Service                | Covers                                                    |
| ---------------------- | --------------------------------------------------------- |
| `otp-service.ts`       | Issuing and verifying one-time codes                      |
| `session-service.ts`   | Creating, reading and revoking sessions                   |
| `user-service.ts`      | Finding or creating an account for a phone number          |
| `product-service.ts`   | Listing, search, facets, product detail, related products  |
| `category-service.ts`  | Active categories: navigation, tiles, lookup, sitemap      |
| `admin/`               | The catalogue **write** path, plus the reads admin screens need |

`admin/` is a separate folder, not a set of extra exports on the two services
above, and that separation is load-bearing. The public services exist to make
drafts and archived products unreachable — every query they build starts with
`status: ACTIVE`. The admin ones exist to edit exactly those. One module doing
both would put the storefront one boolean argument away from showing
unpublished work.

The catalogue services keep their query-building and row-mapping in
`src/lib/catalog/`, so the service files stay readable as the list of
operations they expose. See `docs/catalog/README.md`.

One rule worth repeating because it is the one that gets broken: **a public
read filters on status or `isActive` inside the query**, not afterwards. A
draft product or a disabled category must be impossible to return, rather than
merely unlikely to be rendered.

See `docs/database/README.md` for the data access conventions.
