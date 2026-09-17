# Features

One folder per business capability. A feature folder owns everything that is
specific to it and nothing that is shared:

```
features/<feature>/
├── components/   UI used only by this feature
├── queries.ts    read paths (server-only)
├── mutations.ts  write paths (server-only)
└── types.ts      feature-local types
```

Rules:

- A feature may import from `components/ui`, `lib`, `config` and `types`.
- A feature must not import from another feature. Shared code moves up into
  `lib` or `components/shared` instead.
- Route files in `app/` stay thin: they compose feature components and pass
  data in. Business logic lives here, not in `app/`.

Here now:

- `auth/` — the sign-in form, the code input, the sign-out control.
- `storefront/` — the page sections (hero, category tiles, editorial,
  newsletter) and the URL query contract that the listing is driven by.

The catalogue is deliberately **not** a feature folder. It is read by three
routes and the store layout, and nothing else, so its reads live in
`lib/services/` and its domain helpers in `lib/catalog/`, next to the other
services. A feature folder would add a layer with one caller.

One consequence is worth naming, because it looks like a broken rule:
`lib/services/product-service.ts` imports `ProductQuery` and
`productQueryParams` from `storefront/product-query.ts`. That module is the
**contract** between the URL and the services rather than a feature
implementation — it holds no logic of its own, imports nothing but `config` and
`types`, and both sides need the same parameter names. Duplicating them so the
arrow pointed the other way would give two lists to keep in step.

`wishlist/` holds `wishlist-state.ts`: the result type every wishlist Server
Action returns and the fixed table of messages it may carry. It lives here
rather than beside the actions because a `"use server"` file may only export
async functions, and here rather than in `types/` because the messages are
feature behaviour, not a shared shape.

Planned: `cart`, `checkout`, `orders`, `account`, `reviews`, `coupons`,
`admin-catalog`, `admin-inventory`.
