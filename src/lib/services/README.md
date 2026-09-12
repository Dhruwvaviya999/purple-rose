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

Phase 2 adds `db.ts` (the Prisma client singleton) and the first services.
This folder is empty on purpose until then.
