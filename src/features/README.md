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

Planned features: `catalog`, `cart`, `wishlist`, `checkout`, `orders`,
`account`, `reviews`, `coupons`, `admin-catalog`, `admin-inventory`.

This folder is empty on purpose — Phase 1 ships no business capabilities.
