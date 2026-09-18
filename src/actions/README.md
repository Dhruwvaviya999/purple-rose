# Server Actions

Server Actions are the write path for forms and interactive mutations. Each
file starts with `"use server"` and exports narrowly scoped actions.

Rules:

- Validate every input with a schema from `lib/validations` before use. Never
  trust a value that arrived from the client.
- Check authorisation inside the action itself. Never rely on the caller
  having hidden the UI.
- Return a serialisable result (`{ ok: true }` or `{ ok: false, message }`)
  instead of throwing for expected failures, so forms can render the message.
- Keep database access in `lib/services`; an action orchestrates, it does not
  query directly.
- Revalidate affected paths or tags after a successful write.

## What is here

```
actions/
├── auth.ts      request a code, verify it, sign out
├── wishlist.ts  add, remove, toggle — the customer's saved pieces
├── cart.ts      add, update, remove, clear — the shopper's bag
├── addresses.ts create, update, set default, delete
├── account.ts   the one thing a customer may change about themselves
└── admin/       catalogue mutations, one module per feature
    ├── products.ts
    ├── categories.ts
    ├── variants.ts
    ├── images.ts
    ├── colors.ts
    └── sizes.ts
```

One module per feature rather than one `admin.ts`: every export in a
`"use server"` file is a callable endpoint, and a single file holding every
mutation is a file nobody can review.

Two things about the admin actions are worth knowing before adding another:

- **The authorisation check is written out in each action**, first, before any
  input is read. Not in a wrapper. `pnpm check:admin` reads these modules and
  fails if an exported action does not call `requireAdminActor()` before it
  parses, so the rule cannot be forgotten.
- **Shared helpers live in `lib/admin/action-support.ts`**, not here. A helper
  exported from a `"use server"` file would be a public endpoint with no
  authorisation of its own.

See `docs/admin-catalog/README.md`.
