# Validations

Input schemas, kept separate from both presentation and persistence so the
same rules can be reused by a form, a Server Action and a Route Handler.

Rules:

- A schema is the single definition of what a valid input looks like. Derive
  TypeScript types from the schema rather than declaring them twice.
- Schemas describe inputs at the boundary. Database shapes come from the ORM.
- Group by domain, for example `auth.ts`, `cart.ts`, `checkout.ts`,
  `product.ts`.

A validation library is added in the phase that introduces the first form
submission. Nothing is installed yet, so no unused dependency ships.
This folder is empty on purpose until then.
