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

This folder is empty on purpose: the first services arrive with the first
feature that reads or writes data. See `docs/database/README.md` for the
data access conventions.
